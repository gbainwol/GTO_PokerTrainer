## Mediation partners and ad strategy

### Partner selection
- **iOS**: Google AdMob (primary), Unity LevelPlay as backup waterfall for rewarded formats. Chosen for SDK stability, SKAdNetwork coverage, and strong fill in US/EU.
- **Android**: AppLovin MAX (primary), Google AdMob as secondary network. MAX provides robust A/B testing and price floors; AdMob offers wide advertiser base.

### Ad formats and placements
| Placement | Format | Trigger | Purpose | Notes |
| --- | --- | --- | --- | --- |
| `paywall_top_banner` | Banner | Paywall shown to non-subscribers | Monetize impressions on paywall entry | Keep under 80px height to avoid layout shift. |
| `solve_unlock_rewarded` | Rewarded video | User taps "Solve with ad" CTA on puzzle/hand screen | Allow free unlock with ad view | Must return success callback to resume solver. |
| `post_hand_interstitial` | Interstitial | After finishing a hand/session | Monetize engaged users | Frequency capped to avoid churn. |
| `daily_bonus_rewarded` | Rewarded video | User claims daily bonus chips | Boost retention with optional reward | Non-blocking; offer skip. |

### Frequency capping and pacing
- **Global rules**
  - Interstitials: max **2 per user per hour**, **6 per day**. Minimum **90s** between interstitials.
  - Rewarded: no hard cap, but enforce **cooldown 60s** between rewarded requests to reduce spam.
  - Banners: refresh every **30s**; pause when app is backgrounded.
- **Placement overrides**
  - `post_hand_interstitial`: also require **minimum 2 hands played** before showing first interstitial in a session.
  - `solve_unlock_rewarded`: allow **one retry** if the ad fails to load; then hide CTA for 10 minutes.
  - `daily_bonus_rewarded`: limit to **1 completion every 22 hours**.

### Integration notes
- Use mediation SDK callbacks to surface **load**, **show**, **reward**, and **fail** events to analytics (`ad_event` with placement, network, and error code).
- Persist caps in local storage with server reconciliation via `/ads/state` endpoint (server authoritative on caps for abuse control).
- Configure **COPPA and GDPR** flags per platform; prompt for consent on first launch in GDPR regions.
- Use **SKAdNetwork IDs** list from AdMob for iOS builds; keep synced in `ios/Info.plist`.
