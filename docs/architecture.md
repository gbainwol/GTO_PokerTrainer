# GTO Poker Trainer Service Architecture

## Goals and Scope
- Deliver secure user experiences with clear separation of concerns across authentication, entitlements, solver orchestration, caching, and content delivery.
- Provide deterministic, prioritized job execution for solver workloads with low latency for interactive users.
- Optimize performance and cost by combining a priority queue, CDN-backed static delivery, and cached solve reuse.
- Ensure observability (metrics/tracing/logs) and cost visibility (compute and ads revenue dashboards).

## High-Level Topology
- **Edge / API Gateway**: Terminates TLS, applies rate limits, authenticates sessions, routes to services, and injects trace headers.
- **Identity & Session Service**: Handles OAuth/social login, MFA, session issuance (JWT w/ short TTL + refresh tokens), and device fingerprinting.
- **Entitlements Service**: Evaluates user access (subscription tiers, promotional trials, experiment flags) and signs short-lived access tokens for solver usage.
- **Content Service**: Manages static and authored content (training modules, strategy articles, UI assets) and exposes signed URLs via CDN.
- **Solver Orchestrator**: Accepts solve requests, enforces entitlements, deduplicates identical requests, pushes work to the priority job queue, and returns job handles.
- **Job Queue**: Multi-lane priority queue (interactive > subscriber > free) with per-tenant quotas, dead-letter lanes, and delayed retries.
- **Solver Workers**: Stateless workers that pull from the queue, run solve jobs against compute clusters (CPU/GPU), and write results to cache and object storage.
- **Cache Layer**: Multi-tier cache for solver outputs (memory/Redis + CDN + object storage) with content-addressed keys for reuse.
- **CDN**: Fronts static assets and cached solves; supports signed URLs for premium outputs and edge caching of repeat queries.
- **Observability Stack**: OpenTelemetry for traces, structured logging to centralized log store, Prometheus/Grafana for metrics and dashboards.

## Data Stores and Queues
- **Auth/Session**: PostgreSQL for user identities, Redis for session tokens + rate limits.
- **Entitlements**: PostgreSQL for plans, grants, and experiments; Redis for tokenized entitlement decisions.
- **Content**: Object storage (S3/GCS) for assets; Postgres for authored content metadata.
- **Queue**: Managed queue (e.g., SQS + priority wrappers or Redis Streams) with explicit priority lanes.
- **Cache**: Redis for hot solver results; object storage for cold cache; CDN edge for global distribution.

## API Responsibilities
- **Auth**
  - `/auth/login`, `/auth/refresh`, `/auth/logout`
  - Issues JWT (short TTL) + refresh, enforces device binding and MFA.
- **Entitlements**
  - `/entitlements/check` → returns tier, quotas, flags
  - `/entitlements/token` → short-lived signed token for solver access
- **Solver**
  - `/solve` → validates entitlement token, de-dupes by normalized solve spec, enqueues job, returns `job_id`
  - `/solve/{job_id}` → status, queue lane, ETA, cost estimate
  - `/solve/{job_id}/result` → signed URL for cached or newly produced result (served via CDN)
- **Content**
  - `/content/{path}` → redirects to CDN signed URL for static assets and training content

## Priority Job Queue Design
- **Lanes**: `interactive` (critical, low-latency UI actions), `subscriber` (paid users), `free` (ad-supported), plus `dlq`.
- **Scheduling**
  - Weighted fair scheduler across lanes (e.g., 60/30/10) with head-of-line blocking protection.
  - Per-user and per-account concurrency caps to prevent noisy neighbors.
  - Aging/promotion: long-waiting lower-tier jobs can be promoted to avoid starvation.
- **Job Shape**
  - Payload includes normalized solve parameters, entitlement token, idempotency key, cost estimate, and cache key.
  - Deduplication via cache key; if a matching result exists, shortcut to cached response.
- **Retries & DLQ**
  - Exponential backoff with jitter for transient compute errors; max attempts per lane.
  - DLQ per lane with alerting and replay tooling.

## CDN and Caching Strategy
- **Static Assets**: Versioned paths (`/static/<commit>/<asset>`) with immutable caching; served via CDN.
- **Solver Results**
  - **Hot Cache**: Redis keyed by normalized solve spec hash; short TTL for interactive sessions.
  - **Warm/Cold Cache**: Object storage blobs (`results/<hash>.json`) with metadata for reuse and CDN fronting.
  - **Edge Cache**: CDN caches result blobs; requires signed URLs for premium tiers; cache-control tuned per tier.
- **Invalidation**
  - Cache busting via versioned URLs for static assets.
  - For entitlements changes, rotate signing keys/claims to prevent stale premium access.

## Observability
- **Tracing**: OpenTelemetry SDK in all services; propagate `traceparent` from edge. Spans for auth checks, entitlement lookups, queue enqueue/dequeue, solver execution, cache hits/misses.
- **Metrics** (Prometheus)
  - Auth: login success/failed counts, token issuance latency, MFA challenge outcomes.
  - Entitlements: cache hit rate, decision latency, denial reasons.
  - Queue: enqueue/dequeue rates by lane, time-in-queue, retry counts, DLQ depth, per-lane concurrency.
  - Solver: job duration, cost per job, success/error rates, cache hit ratio, compute utilization (CPU/GPU).
  - CDN/Cache: hit/miss, egress bytes, signed URL validation failures.
  - Ads: impressions, fill rate, CTR, eCPM, revenue per session.
- **Logging**: Structured JSON logs with request IDs and trace IDs; PII redaction pipeline; log sampling on noisy paths.
- **Dashboards & Alerts**
  - Latency and error-rate SLOs per service and per lane.
  - Queue health (depth, lag, retries) and cache efficiency.
  - Compute cost vs revenue: cost per solver minute, cost per solve, revenue per session, ads vs subscription mix.
  - Ads revenue dashboard: impressions, CTR, eCPM, ad-block detection rate, revenue by geography.

## Cost Management and Governance
- **Cost Attribution**: Tag compute jobs by lane, user tier, and experiment bucket; export to cost explorer/BigQuery for dashboards.
- **Adaptive Throttling**: Enforce per-tier concurrency ceilings and dynamic queue weights when compute budget is exceeded.
- **Autoscaling**: Scale solver workers based on queue depth and target latency per lane; pre-warm GPU pools for interactive lane.
- **Ads-Aware Scheduling**: For ad-supported lane, delay execution until post-ad-impression to validate monetization signal.

## Failure and Reliability Considerations
- Graceful degradation: fallback to cached solves when compute unavailable; serve precomputed “good enough” strategies for free users.
- Multi-region deployment: active/active for stateless services; regional queues with spillover; CDN handles edge locality.
- Rate limiting: at edge per IP + user; stricter for free tier; entitlement token scopes enforced in solver and content services.
- Security: rotate signing keys; short-lived tokens; signed URLs; WAF on edge; audit logging for entitlement changes.

## Developer Experience
- Local dev via docker-compose: API gateway, Postgres, Redis, mock queue, worker.
- Trace-aware load generator to test queue fairness and cache hit rates.
- Feature flags for lane weights and cache TTLs for rapid tuning without redeployments.
