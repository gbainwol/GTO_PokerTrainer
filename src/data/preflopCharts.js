export const PREFLOP_CHARTS = [
  {
    position: "UTG",
    openRange: "14% (99+, AQ+, AJs+, KQs)",
    threeBet: "4% (QQ+, AK)",
    mix: "Fold suited connectors below 65s",
  },
  {
    position: "HJ",
    openRange: "19% (88+, AJ+, KQ, ATs+)",
    threeBet: "6% (JJ+, AQ+, A5s)",
    mix: "Mix AJo at 50%",
  },
  {
    position: "CO",
    openRange: "26% (66+, AT+, KJ+, QJs, 98s+)",
    threeBet: "9% (TT+, AQ+, A5s, KQs)",
    mix: "Mix suited gappers",
  },
  {
    position: "BTN",
    openRange: "45% (Any pair, A2+, K7s+, Q8s+)",
    threeBet: "12% (99+, AQ+, A5s, KJs)",
    mix: "Mix offsuit broadways",
  },
  {
    position: "SB",
    openRange: "36% (Any pair, A2+, K9s+, Q9s+)",
    threeBet: "15% (88+, AT+, A5s, KJs)",
    mix: "Complete suited connectors down to 54s",
  },
];
