# GTO Poker Trainer Service Architecture

This document outlines service-level designs for rate and priority controls, ad mediation with rewarded solve experiences, and entitlements with device-agnostic identity. It is scoped to back-end and cross-platform client integration concerns.

## 1. Rate, Concurrency, and Precision Controls

### Tiers

| Tier | Daily quota (requests/user) | Burst QPS | Concurrent sessions | Precision defaults |
| --- | --- | --- | --- | --- |
| Free | 1,000 | 2 | 1 | "fast" heuristic; capped at 3 solver iterations |
| Plus | 10,000 | 10 | 3 | "balanced"; up to 10 iterations |
| Pro | 100,000 | 25 | 8 | "precise"; up to 25 iterations |

Notes:
- Concurrency refers to simultaneous solver sessions per user.
- Precision defines solver iteration ceilings and numerical tolerances; server-side enforces upper bounds even if clients request higher.

### Enforcement pipeline

1. **AuthN**: Identify user via device-agnostic identity (see §3).
2. **Rate gate** (token bucket per user/tier):
   - Keys: `rate:{userId}` with bucket size derived from tier; refill at tier-specific QPS.
   - Reject with 429 if empty.
3. **Concurrency gate** (semaphore):
   - Keys: `conc:{userId}` with limit from tier; tokens held for session lifetime.
   - Optionally allow queueing (see §1.4) instead of hard reject.
4. **Precision clamp**: Clamp requested solver precision/iterations to tier maxima.
5. **Quota accounting** (see §1.3) for accepted requests.

### Data model (Redis/Key-Value)

- `quota:{userId}:{yyyyMMdd}` → integer counter; TTL = 2 days to absorb skew.
- `rate:{userId}` → token bucket state.
- `conc:{userId}` → integer semaphore.
- `tier:{userId}` → enum Free/Plus/Pro resolved at auth time.

### Quota counters (per user/day)

Algorithm:

1. Compute `todayKey = quota:{userId}:{utcDate}`.
2. `INCR todayKey`; on first creation, set `EX 172800`.
3. Compare against tier quota; if exceeded, roll back (using Lua transaction) and return 429/`quota_exceeded`.

Rationale:
- Simple per-day bucket avoids need for windowing; suits human-scale usage.
- Lua script ensures atomic increment + check + optional rollback.

### Priority queues for overflow

When rate/concurrency gates overflow, enqueue instead of rejecting:

- Queue: `priority_queue` in Redis Streams or a broker (e.g., RabbitMQ) with priorities.
- Priority rules:
  - Pro > Plus > Free (mapped to numeric priority 3/2/1).
  - Within same priority, FIFO with fairness key = userId to avoid starvation.
- Dequeue workers respect per-user concurrency; if `conc:{userId}` full, requeue with delay.
- TTL on queued jobs (e.g., 30s) to avoid stale solves.

Observability:
- Export queue depth, dequeue latency, drop rates per priority.
- Log 429 vs queued for product insight.

## 2. Ad Mediation & Rewarded Solve Flow

### Placement rules

- **Surfaces**: mobile app (iOS/Android), web, desktop.
- **Placements**: lobby banner, session interstitial, post-hand summary panel.
- **Rules**: Configurable via remote config service (e.g., JSON delivered at startup), including:
  - Eligibility: tier == Free, region allowlist, age-gate flag, session cooldown.
  - Frequency caps: per placement + global per session/day.
  - Creative type allowlist by platform (video/display/native) and network.

### Mediation layer

- Adapter interface for networks (AdMob, AppLovin, Unity Ads, custom web SSP):
  - Methods: `load(placement)`, `show(placement, context)`, callbacks for fill, click, reward.
- Waterfall + bidding hybrid:
  - First-price bidders evaluated via client/SDK where supported; fallback to price-priority waterfall.
  - Floor prices from server config; analytics piped to data warehouse.
- Failure handling: if no fill, fallback to house ad or offerwall; record `no_fill` metric.

### Rewarded solve path (Free tier)

Flow:
1. User requests high-precision or over-quota solve.
2. Backend responds with `requires_rewarded` token (JWT with claim `solve_id`).
3. Client launches rewarded placement `rewarded_solve` via mediation.
4. On reward callback, client POSTs `/rewarded/claim` with token.
5. Backend verifies token, ensures single-use via `reward:{solveId}` key, and temporarily lifts quota for that solve (e.g., grant +1 solve or bump precision once).
6. Solve proceeds under temporary entitlement; result marked as rewarded for analytics.

Safeguards:
- Reward token expiry (15 minutes).
- Device binding via hashed deviceId + userId in token to deter sharing.
- Cap rewarded solves/day (e.g., 10) via `reward_quota:{userId}:{date}` counter.

## 3. Entitlement Service

### Identity (device-agnostic)

- Primary key: `userId` issued at registration.
- Identity resolution:
  - Email/OAuth account linking.
  - Device fingerprint (hashed) stored as secondary identifiers in `identity_links` table.
  - Allow multiple devices per user; prevent duplicate anonymous accounts by soft-matching fingerprint + IP heuristics.

### Data model (SQL)

- `users(id, created_at, status)`
- `subscriptions(id, user_id, product_id, tier, status, started_at, expires_at, platform)`
- `receipts(id, subscription_id, platform, raw_payload, signature, status, created_at)`
- `devices(id, user_id, fingerprint, platform, last_seen_at)`
- `fraud_flags(id, user_id, reason, signal, created_at)`
- `entitlements_cache(user_id, tier, expires_at, updated_at)` for fast lookup.

### Subscription & receipt handling

Platforms: Apple, Google, Stripe/web.

1. Clients send purchase token → `/entitlements/claim`.
2. Service validates token with platform (server-to-server) and persists receipt.
3. Update `subscriptions` and `entitlements_cache` based on validation result.
4. Webhooks (Apple/Google/Stripe) update statuses (renewal, cancel, refund) asynchronously.
5. All entitlement reads go through cache; cache stampede protected via single-flight.

### Anti-fraud measures

- Signals: device reuse across many accounts, repeated free trials, receipt replay, geography mismatch, payment risk scores.
- Actions:
  - Mark `fraud_flags`; downgrade tier to Free pending review.
  - Block rewarded solves if risky.
  - Require revalidation of receipts periodically (e.g., every 72h) for flagged users.

### API surface (examples)

- `GET /entitlements` → returns tier, expiry, rewarded caps.
- `POST /entitlements/claim` → validates purchase token.
- `POST /rewarded/claim` → redeem rewarded solve token (see §2.3).
- `POST /auth/resolve` → returns userId after linking device identifiers + account login.

### Observability & SLOs

- SLO: 99p latency < 150ms for entitlement reads; 99p < 500ms for rewarded claim.
- Metrics: rate limit hits, queue wait time, ad fill rate, rewarded completion rate, subscription validation success, fraud flag incidence.
- Tracing: propagate `solve_id`/`request_id` across services and ad callbacks.

## 4. Migration & Rollout Notes

- Launch Free tier with conservative quotas; enable priority queue only after stability testing.
- Start mediation with two networks per platform; gradually enable bidders.
- Gate rewarded solve by feature flag; A/B test uplift vs churn.
- Backfill entitlements_cache nightly from subscriptions to ensure consistency.
