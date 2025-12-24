## Pricing, paywalls, and free-to-ad flow

### Regional pricing matrix (example)
| Region | Currency | Monthly | Annual | Notes |
| --- | --- | --- | --- | --- |
| US, CA | USD/CAD | 7.99 | 59.99 | Anchor pricing; show 25% savings on annual. |
| EU (Tier 3) | EUR | 7.49 | 56.99 | Respect country-specific VAT in storefront. |
| UK | GBP | 6.99 | 52.99 | Round to .99 for consistency. |
| BR | BRL | 19.90 | 139.90 | Localized affordability tier. |
| IN | INR | 349 | 2299 | Use Play pricing templates; avoid weekend changes. |
| AU/NZ | AUD/NZD | 8.99 | 64.99 | Match AUD/NZD parity. |

> Update prices quarterly based on FX changes; never raise more than 10% without 30-day notice.

### Paywall flows (client)
- **Entry points**: launching solver, viewing premium drills, hitting deck depth limit, profile badge tap.
- **Variants**: A/B test paywall layouts (hero-first vs. feature-list-first) using remote config key `paywall.variant`.
- **State machine**:
  1. Evaluate entitlements; if active, bypass paywall.
  2. If not active and rewarded unlock available, show **"Solve with ad"** CTA.
  3. Present product cards using regional matrix; highlight best value.
  4. On purchase, call `/rvs/validate`; optimistically unlock gated screen while validation resolves.
  5. On failure, surface inline error, allow retry, and fall back to ad unlock if eligible.

### "Solve with ad" CTA (free unlock)
- Placement: solver screen when user taps locked solution.
- Behavior:
  - Show CTA if user has **not exceeded 3 rewarded unlocks/day** and `solve_unlock_rewarded` placement is available.
  - After ad success, unlock the specific solution for the session; do **not** grant full subscription benefits.
  - On ad failure (no fill), offer **retry once** then prompt to subscribe.
  - Track unlock count per user locally; reconcile daily cap with server via `/ads/state`.

### Client implementation checklist
- Use remote config keys:
  - `paywall.variant`, `pricing.region_override`, `ads.solve.daily_cap`, `interstitial.cooldown_seconds`.
- Expose analytics events:
  - `paywall_view` (variant, entry), `paywall_purchase_tap` (product_id), `paywall_purchase_success`, `paywall_dismiss`, `solve_ad_start`, `solve_ad_complete`, `solve_ad_fail`.
- Accessibility:
  - Ensure paywall buttons are **minimum 44px height**, label ads CTA explicitly ("Solve with ad (watch a 30s video)").
  - Respect reduced motion setting; avoid autoplaying paywall animations if `prefers-reduced-motion` is set.
