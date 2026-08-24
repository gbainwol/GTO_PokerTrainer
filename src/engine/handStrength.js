/**
 * Preflop hand strength, ordered strongest to weakest.
 *
 * GENERATED FILE - do not edit by hand.
 * Regenerate with: node scripts/gen-hand-strength.mjs
 *
 * Each of the 169 distinct starting hands was simulated heads-up against a
 * uniformly random opponent hand (120,000 Monte Carlo trials).
 * The values are that equity, so the ordering is derived from measured math
 * rather than folklore.
 *
 * This ranks raw all-in equity vs one random hand. It is the right metric for
 * shove/call decisions and a reasonable proxy for opening strength, but it does
 * not capture postflop playability - suited connectors are worth more in
 * deep-stacked multiway pots than this ordering alone implies.
 */
/** @type {ReadonlyArray<[string, number]>} */
export const HAND_STRENGTH = [
  ["AA", 0.8533],
  ["KK", 0.8254],
  ["QQ", 0.8012],
  ["JJ", 0.7756],
  ["TT", 0.7529],
  ["99", 0.7235],
  ["88", 0.6932],
  ["AKs", 0.6725],
  ["77", 0.6650],
  ["AQs", 0.6639],
  ["AKo", 0.6562],
  ["AJs", 0.6556],
  ["ATs", 0.6477],
  ["AQo", 0.6465],
  ["AJo", 0.6377],
  ["66", 0.6359],
  ["KQs", 0.6356],
  ["ATo", 0.6292],
  ["A9s", 0.6280],
  ["KJs", 0.6267],
  ["A8s", 0.6205],
  ["KTs", 0.6185],
  ["KQo", 0.6160],
  ["A7s", 0.6123],
  ["A9o", 0.6083],
  ["KJo", 0.6069],
  ["55", 0.6069],
  ["QJs", 0.6032],
  ["A6s", 0.6020],
  ["A5s", 0.6019],
  ["A8o", 0.6006],
  ["K9s", 0.6000],
  ["KTo", 0.5986],
  ["QTs", 0.5951],
  ["A4s", 0.5925],
  ["A7o", 0.5917],
  ["A3s", 0.5839],
  ["K8s", 0.5828],
  ["QJo", 0.5822],
  ["A6o", 0.5806],
  ["A5o", 0.5804],
  ["K9o", 0.5785],
  ["K7s", 0.5778],
  ["JTs", 0.5768],
  ["Q9s", 0.5764],
  ["A2s", 0.5747],
  ["QTo", 0.5736],
  ["44", 0.5723],
  ["A4o", 0.5701],
  ["K6s", 0.5694],
  ["A3o", 0.5605],
  ["K5s", 0.5605],
  ["K8o", 0.5603],
  ["Q8s", 0.5595],
  ["J9s", 0.5572],
  ["JTo", 0.5545],
  ["K7o", 0.5540],
  ["Q9o", 0.5534],
  ["K4s", 0.5503],
  ["A2o", 0.5502],
  ["Q7s", 0.5454],
  ["K6o", 0.5451],
  ["K3s", 0.5411],
  ["T9s", 0.5408],
  ["J8s", 0.5399],
  ["33", 0.5390],
  ["Q6s", 0.5376],
  ["K5o", 0.5358],
  ["Q8o", 0.5358],
  ["K2s", 0.5339],
  ["J9o", 0.5335],
  ["Q5s", 0.5297],
  ["J7s", 0.5263],
  ["K4o", 0.5250],
  ["T8s", 0.5223],
  ["Q7o", 0.5200],
  ["Q4s", 0.5186],
  ["T9o", 0.5160],
  ["J8o", 0.5155],
  ["K3o", 0.5151],
  ["Q6o", 0.5117],
  ["Q3s", 0.5115],
  ["98s", 0.5083],
  ["J6s", 0.5076],
  ["T7s", 0.5076],
  ["K2o", 0.5069],
  ["22", 0.5046],
  ["Q5o", 0.5030],
  ["Q2s", 0.5029],
  ["J5s", 0.5017],
  ["J7o", 0.4997],
  ["T8o", 0.4961],
  ["97s", 0.4957],
  ["Q4o", 0.4918],
  ["J4s", 0.4917],
  ["T6s", 0.4901],
  ["Q3o", 0.4834],
  ["J3s", 0.4833],
  ["87s", 0.4811],
  ["98o", 0.4808],
  ["T7o", 0.4801],
  ["J6o", 0.4799],
  ["96s", 0.4769],
  ["J2s", 0.4754],
  ["Q2o", 0.4740],
  ["J5o", 0.4736],
  ["T5s", 0.4727],
  ["97o", 0.4667],
  ["T4s", 0.4659],
  ["J4o", 0.4635],
  ["86s", 0.4626],
  ["T6o", 0.4617],
  ["95s", 0.4585],
  ["T3s", 0.4578],
  ["76s", 0.4547],
  ["J3o", 0.4543],
  ["87o", 0.4519],
  ["T2s", 0.4488],
  ["85s", 0.4474],
  ["96o", 0.4472],
  ["J2o", 0.4452],
  ["T5o", 0.4431],
  ["75s", 0.4397],
  ["94s", 0.4379],
  ["T4o", 0.4349],
  ["86o", 0.4329],
  ["65s", 0.4327],
  ["93s", 0.4322],
  ["95o", 0.4284],
  ["84s", 0.4272],
  ["T3o", 0.4262],
  ["92s", 0.4245],
  ["76o", 0.4236],
  ["74s", 0.4181],
  ["85o", 0.4170],
  ["T2o", 0.4166],
  ["54s", 0.4148],
  ["64s", 0.4133],
  ["83s", 0.4081],
  ["75o", 0.4079],
  ["94o", 0.4063],
  ["82s", 0.4029],
  ["73s", 0.4010],
  ["65o", 0.4005],
  ["93o", 0.3999],
  ["53s", 0.3989],
  ["63s", 0.3977],
  ["84o", 0.3952],
  ["92o", 0.3913],
  ["43s", 0.3885],
  ["74o", 0.3857],
  ["72s", 0.3834],
  ["52s", 0.3813],
  ["54o", 0.3812],
  ["64o", 0.3800],
  ["62s", 0.3782],
  ["83o", 0.3747],
  ["42s", 0.3704],
  ["82o", 0.3688],
  ["73o", 0.3666],
  ["53o", 0.3639],
  ["63o", 0.3628],
  ["32s", 0.3605],
  ["43o", 0.3534],
  ["72o", 0.3482],
  ["52o", 0.3456],
  ["62o", 0.3430],
  ["42o", 0.3342],
  ["32o", 0.3242],
];

/** Hand code -> equity vs a random hand. */
export const STRENGTH_BY_CODE = new Map(HAND_STRENGTH);

/** Hand code -> rank. 0 = AA (strongest), 168 = 32o (weakest). */
export const RANK_BY_CODE = new Map(HAND_STRENGTH.map(([code], i) => [code, i]));

/**
 * The strongest `percent` of starting hands, measured by combo count rather
 * than hand-code count: "top 15%" means 15% of the 1326 possible combos.
 *
 * @param {number} percent
 * @param {(code: string) => number} comboCounts combos for a given hand code
 * @returns {string[]}
 */
export const topPercentCodes = (percent, comboCounts) => {
  const target = (Math.max(0, Math.min(100, percent)) / 100) * 1326;
  const out = [];
  let combos = 0;
  for (const [code] of HAND_STRENGTH) {
    if (combos >= target) break;
    out.push(code);
    combos += comboCounts(code);
  }
  return out;
};
