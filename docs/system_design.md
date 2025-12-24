# Platform capability design

This document captures the proposed architecture for three related capabilities:

1. Tiered rate/concurrency/precision limits with quota counters and priority queues.
2. Cross-platform ad mediation with placement rules and a rewarded-solve path for free users.
3. An entitlement service covering subscriptions, receipt validation, anti-fraud, and device-agnostic identity.

## 1) Rate, concurrency, and precision controls

### Tiers and limits
- **Tiers:** `free`, `plus`, `pro`, `enterprise` (extendable via config).
- **Limits per tier (config-driven):**
  - **Rate:** requests per minute/hour/day.
  - **Concurrency:** max in-flight requests per user/device/api_key.
  - **Precision/quality:** allowed model/solver precision bands (e.g., low/medium/high/ultra), gated per tier.
  - **Burst policy:** leaky-bucket token bucket per minute plus rolling daily quota.
  - **Overage:** soft overage window for enterprise with alerting and optional pay-per-use.

### Quota counters
- **Storage:** Redis or Dynamo-style KV with TTL per counter window; append-only audit log in OLTP/warehouse for reconciliation.
- **Keys:** `{user_id}:{counter_type}:{window_start}`, plus device-scoped keys for concurrency.
- **Operations:**
  - `reserve(counter, amount)`: atomic INCR + boundary check; reject or accept with remaining.
  - `release(counter, amount)`: on cancellation/failure for concurrency counters.
  - `reconcile`: periodic job comparing Redis to warehouse events; heals drift.
  - **Idempotency:** request_id stored in a short-lived dedupe set to avoid double-charging.

### Priority queues
- **Queues per priority band:** `p0` (enterprise/critical), `p1` (pro/plus), `p2` (free/background).
- **Dispatch policy:** weighted fair scheduling (e.g., deficit round robin) across queues with max-concurrency per queue.
- **Admission control:** before enqueue, check rate + concurrency counters; precision band validated against tier.
- **Backpressure:** if queue length > threshold, downgrade precision (where allowed) or return “retry later”.
- **Observability:** per-queue metrics (enqueue latency, wait time, drops), SLO alerts by tier.

### Request lifecycle (simplified)
1. **Authenticate** user/device/api_key.
2. **Lookup entitlements** (via entitlement service) -> determines tier + allowed precision.
3. **Check quotas**: rate + daily + concurrency via counters.
4. **Enqueue** into priority queue for execution.
5. **Execute** with allowed precision; on completion, decrement concurrency; emit usage event for reconciliation.

## 2) Ad mediation with placement rules and rewarded solve

### Placement rules
- **Surfaces:** mobile (iOS/Android), web, desktop.
- **Placements:** `interstitial`, `banner`, `native`, `rewarded_solve` (unlocks one solve), `offerwall` (optional).
- **Rule engine:** declarative rules (YAML/JSON) evaluated per request:
  - inputs: device type, platform, country, connectivity, session depth, cooldown timers, entitlement tier, frequency caps, blocklists.
  - outputs: placement eligibility, provider waterfall/auction list, floor prices, skip timers.
- **Frequency caps:** per placement per user/day and per session; backed by Redis counters with TTL.
- **Cooldowns:** e.g., interstitial every N navigations; rewarded_solve limited per day/hour.

### Mediation flow
1. Request placement eligibility -> rule engine returns ordered providers (waterfall) or auction config.
2. Adapter abstraction for providers (AdMob, AppLovin, ironSource, Unity, web partners).
3. Collect auction results / waterfall fill; apply price floors; return creative + tracking.
4. Log impressions/clicks/completions; push to analytics and anti-fraud.

### Rewarded solve path
- Available to **free** (and optionally plus) users when they hit a paywall/limit.
- Flow: show rewarded placement -> on verified completion, grant a **one-time solve entitlement** (short TTL) via entitlement service.
- Anti-abuse: completion verification via server-side callbacks/postbacks; device binding; frequency cap; fraud scoring.
- UX rules: never block critical flows; graceful fallback if ad unavailable (offer trial prompt).

## 3) Entitlement service

### Scope
- Subscriptions, one-time purchases, rewarded solves, trials, and promo credits.
- Cross-device identity with device-agnostic identifiers.
- Anti-fraud and receipt validation pipeline.

### Identity model
- **Primary key:** `account_id`.
- **Device binding:** `device_fingerprint` + platform-specific IDs (IDFA/GAID/AAID, web cookies) linked to `account_id`.
- **Anonymous users:** temp `anon_id` with upgrade path to account; entitlements transferable on account link.
- **API tokens:** short-lived signed tokens embedding tier + entitlements; refreshed via auth service.

### Entitlement representation
- `entitlement` record: `id`, `account_id`, `type` (subscription, reward, credit), `status`, `start_at`, `end_at`, `scope` (feature flags, precision caps), `source` (store, promo, ad), `metadata`.
- **Caching:** signed entitlement bundles in Redis; cache invalidation on mutation events.
- **Precedence:** highest-paying tier wins; additive feature flags; rewarded solves grant scoped, expiring rights.

### Receipt validation
- **Platforms:** App Store, Play Store, web Stripe/PayPal, desktop stores.
- **Pipeline:** ingest -> verify with platform -> persist raw receipt + normalized record -> fraud scoring -> issue entitlements -> emit events.
- **Security:** signed webhooks, nonce per transaction, replay protection, country/IP sanity checks.

### Anti-fraud
- Signals: device fingerprint changes, velocity (purchases per device), receipt reuse, IP reputation, emulator/root/jailbreak flags.
- Actions: block, require step-up verification, downgrade entitlements, or shadow-ban rewarded grants.
- Model: rules engine + optional ML scoring; scores attached to entitlements for analytics.

### APIs (sketch)
- `GET /entitlements/me` -> current bundle (cached).
- `POST /entitlements/consume` -> consume scoped right (e.g., rewarded solve); idempotent by request_id.
- `POST /receipts/validate` -> submit and validate platform receipt.
- `POST /identity/link` -> link device/anon to account; migrate entitlements.
- `POST /usage` -> record usage event (supports quota reconciliation).

### Data flows
- **On request:** Auth -> Entitlement lookup -> Rate/precision enforcement -> Execution.
- **On purchase:** Client -> Receipt submit -> Validate -> Issue entitlements -> Cache push -> Event bus to analytics/quota.
- **On rewarded solve:** Mediation completion -> Server callback -> Fraud score -> Grant short-lived entitlement -> Cache push.

### Observability & ops
- Metrics: entitlement fetch latency, cache hit rate, fraud score distribution, receipt success rate, quota rejects.
- Auditing: append-only event log for grants/consumes; admin tooling for investigations.
- Runbooks: circuit breaker if receipt validation upstreams fail (temporary grace), queue drains, reconciliation jobs.
