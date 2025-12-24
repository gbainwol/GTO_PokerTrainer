## Receipt validation and subscription lifecycle

### Architecture
- **Receipt Validation Service (RVS)**: lightweight service that validates App Store / Play receipts, normalizes into unified entitlement records, and issues signed access tokens to clients.
- **Data store**: `entitlements` table keyed by `user_id` + `platform` with fields: `product_id`, `status (active|grace|expired|revoked)`, `expires_at`, `original_tx`, `last_validated_at`, `latest_receipt_data`.
- **Cache**: 5–10 minute TTL for positive validations; force re-validate if the client reports a new transaction ID or if cache is older than TTL.

### API surface
| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/rvs/validate` | POST | Accepts `{user_id, platform, receipt, product_id}`; returns normalized entitlement and short-lived access token. |
| `/rvs/webhook/appstore` | POST | Receives App Store Server Notifications (V2). Updates entitlement state and triggers downstream events. |
| `/rvs/webhook/play` | POST | Receives Real-Time Developer Notifications (RTDN) from Google Play. Updates entitlements. |
| `/entitlements/:user_id` | GET | Internal/admin lookup of current entitlement state. |

### Validation flow
1. Client sends receipt + product_id to `/rvs/validate` after purchase.
2. RVS verifies receipt with platform:
   - **iOS**: App Store verifyReceipt endpoint; require `latest_receipt_info` and `pending_renewal_info`.
   - **Android**: Play Developer API (`purchases.subscriptions.get`), handle `acknowledged` flag.
3. Normalize into `Entitlement` object:
   ```json
   {
     "user_id": "123",
     "product_id": "gto.sub.monthly",
     "platform": "ios",
     "status": "active",
     "expires_at": "2024-12-31T23:59:59Z",
     "transaction_id": "1000000",
     "grace_period": true
   }
   ```
4. Persist to DB and issue signed access token (JWT) with `exp` set to `expires_at` (or 24h max) and `entitlement_id`.
5. Return entitlement + token to client; client caches and refreshes proactively at 80% of remaining time or on app open.

### Webhooks and lifecycle handling
- **Events to handle**:
  - App Store: `DID_RENEW`, `DID_FAIL_TO_RENEW`, `EXPIRED`, `GRACE_PERIOD`, `REFUND`, `REVOKE`.
  - Play: `SUBSCRIPTION_RENEWED`, `SUBSCRIPTION_EXPIRED`, `SUBSCRIPTION_RECOVERED`, `SUBSCRIPTION_REVOKED`.
- **Processing rules**:
  - Idempotent updates keyed by `original_transaction_id` (iOS) or `purchaseToken` (Android) + `event_time`.
  - Move to **grace** on payment issues, set `grace_until` (e.g., 48h), and keep token valid until `grace_until`.
  - On `REFUND/REVOKE`, immediately mark entitlement revoked and invalidate tokens (set `revoked_at`, push cache bust to clients).
- **Notifications**:
  - Emit internal `subscription_event` message (Kafka/SNS) with `user_id`, `event`, `product_id`, `effective_at`.
  - Push in-app messaging triggers for grace/expiration warnings.

### Failure and abuse controls
- Rate-limit validation requests per user/IP; require client to provide **device_id** and `app_version`.
- Reject sandbox receipts in production builds; log and flag mismatched bundle IDs or package names.
- Store webhook payloads for auditing; expose replay endpoint for support tooling.
