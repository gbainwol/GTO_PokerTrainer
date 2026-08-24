/**
 * Report engine validation.
 *
 * These numbers get shown to a player as "you are losing 2bb/100 calling turns
 * from the big blind", so the arithmetic behind them has to be right. The
 * combo weighting in particular is easy to get wrong and impossible to spot by
 * eye - there are six ways to hold aces and twelve to hold ace-king offsuit.
 */

import {
  HAND_GRID,
  GRID_RANKS,
  buildRangeGrid,
  aggregateMix,
  vpipOf,
  scoreDecision,
  buildSessionReport,
  buildLeakReport,
  compareRanges,
  comboCount,
} from "./report.js";
import { ALL_HAND_CODES, handCodeToCombos } from "./range.js";

let failures = 0;
const ok = (label, pass, detail = "") => {
  if (!pass) failures += 1;
  console.log(`  ${pass ? "ok  " : "FAIL"} ${label.padEnd(52)} ${detail}`);
};
const near = (label, a, b, tol = 1e-9) =>
  ok(label, Math.abs(a - b) <= tol, `${a.toFixed(4)} (expected ~${b.toFixed(4)})`);

// ---------------------------------------------------------------------------
console.log("1. The 13x13 grid covers every hand exactly once");
// ---------------------------------------------------------------------------

{
  const flat = HAND_GRID.flat();
  ok("grid is 13x13", HAND_GRID.length === 13 && HAND_GRID.every((r) => r.length === 13));
  ok("169 cells", flat.length === 169, `${flat.length}`);
  ok("no duplicates", new Set(flat).size === 169, `${new Set(flat).size} distinct`);
  ok("matches the canonical hand list",
     new Set(flat).size === new Set(ALL_HAND_CODES).size &&
     flat.every((c) => ALL_HAND_CODES.includes(c)));

  // Layout convention: pairs on the diagonal, suited above, offsuit below.
  ok("pairs run down the diagonal",
     GRID_RANKS.every((r, i) => HAND_GRID[i][i] === `${r}${r}`));
  ok("suited hands sit above the diagonal", HAND_GRID[0][1] === "AKs", HAND_GRID[0][1]);
  ok("offsuit hands sit below the diagonal", HAND_GRID[1][0] === "AKo", HAND_GRID[1][0]);

  const combos = flat.reduce((sum, code) => sum + comboCount(code), 0);
  ok("the whole grid is 1326 combos", combos === 1326, `${combos}`);
}

// ---------------------------------------------------------------------------
console.log("\n2. Aggregate frequencies weight by combos, not by hand count");
// ---------------------------------------------------------------------------

{
  /*
   * AA is 6 combos and always raises; AKo is 12 combos and always folds.
   * Counting hands equally would report 50% raise. Weighting by combos gives
   * the truth: 6 of 18 combos raise, so 33.3%.
   */
  const rows = [
    { code: "AA", probs: [0, 1] },
    { code: "AKo", probs: [1, 0] },
  ];
  const mix = aggregateMix(rows, ["fold", "raise"]);
  near("raise frequency is combo-weighted", mix[1].frequency, 6 / 18, 1e-9);
  near("fold frequency is combo-weighted", mix[0].frequency, 12 / 18, 1e-9);
  near("frequencies sum to one", mix.reduce((s, m) => s + m.frequency, 0), 1);
  near("VPIP agrees with the raise frequency", vpipOf(rows), 6 / 18, 1e-9);

  // A full-range check: playing everything must read as 100% of 1326 combos.
  const everything = ALL_HAND_CODES.map((code) => ({ code, probs: [0, 1] }));
  near("playing every hand is 100% VPIP", vpipOf(everything), 1, 1e-9);
  const grid = buildRangeGrid(everything, ["fold", "raise"]);
  ok("grid reports full coverage", grid.covered === 1326, `${grid.covered}/1326`);
}

// ---------------------------------------------------------------------------
console.log("\n3. EV loss is measured against the best action");
// ---------------------------------------------------------------------------

{
  const options = [
    { action: "Fold", ev: 0, frequency: 0.1 },
    { action: "Call", ev: 1.2, frequency: 0.3 },
    { action: "Raise", ev: 1.5, frequency: 0.6 },
  ];

  near("taking the best action costs nothing",
       scoreDecision({ action: "Raise", options }).evLoss, 0);
  near("a near-tie costs the difference only",
       scoreDecision({ action: "Call", options }).evLoss, 0.3, 1e-9);
  near("the worst action costs the full gap",
       scoreDecision({ action: "Fold", options }).evLoss, 1.5, 1e-9);

  /*
   * Scoring against the *most frequent* action instead of the best one would
   * punish correct mixing. Here Call is taken only 30% of the time but is worth
   * almost as much as Raise, so it must register as a small loss, not a large
   * one.
   */
  ok("mixing is not treated as a mistake",
     scoreDecision({ action: "Call", options }).evLoss < 0.5, "0.30 lost");
  ok("a small loss on a mixed action is not a blunder",
     scoreDecision({ action: "Call", options }).blunder === false);
  ok("a big loss on a near-never action is a blunder",
     scoreDecision({
       action: "Fold",
       options: [
         { action: "Fold", ev: 0, frequency: 0.01 },
         { action: "Raise", ev: 2.0, frequency: 0.99 },
       ],
     }).blunder === true);

  ok("an unknown action scores nothing rather than guessing",
     scoreDecision({ action: "Straddle", options }) === null);
  ok("no options means no score", scoreDecision({ action: "Fold", options: [] }) === null);
}

// ---------------------------------------------------------------------------
console.log("\n4. Session report adds up");
// ---------------------------------------------------------------------------

const opts = (best, other) => [
  { action: "Call", ev: other, frequency: 0.4 },
  { action: "Raise", ev: best, frequency: 0.6 },
];

{
  const decisions = [
    { action: "Raise", options: opts(2, 1), street: "Flop", position: "BTN" },
    { action: "Call", options: opts(2, 1), street: "Flop", position: "BTN" },   // -1
    { action: "Call", options: opts(3, 1), street: "Turn", position: "BB" },    // -2
    { action: "Raise", options: opts(2, 1), street: "Turn", position: "BB" },
  ];
  const report = buildSessionReport(decisions);

  near("total EV loss is the sum of the parts", report.overall.evLoss, 3, 1e-9);
  near("EV loss per decision", report.overall.evLossPerHand, 0.75, 1e-9);
  near("accuracy counts the decisions that cost nothing", report.overall.accuracy, 0.5, 1e-9);
  ok("every decision is scored", report.overall.count === 4, `${report.overall.count}`);

  const streetLoss = Object.fromEntries(report.byStreet.map((s) => [s.value, s.evLoss]));
  near("flop losses attributed to the flop", streetLoss.Flop, 1, 1e-9);
  near("turn losses attributed to the turn", streetLoss.Turn, 2, 1e-9);
  ok("breakdowns are ordered worst-first", report.byStreet[0].value === "Turn");
  near("street losses sum to the total",
       report.byStreet.reduce((s, x) => s + x.evLoss, 0), report.overall.evLoss, 1e-9);
  near("position losses sum to the total",
       report.byPosition.reduce((s, x) => s + x.evLoss, 0), report.overall.evLoss, 1e-9);

  ok("worst decisions come first",
     report.worst[0].evLoss >= report.worst[1].evLoss, `${report.worst[0].evLoss}`);

  const empty = buildSessionReport([]);
  ok("an empty session does not divide by zero",
     empty.overall.count === 0 && empty.overall.evLossPerHand === 0);
}

// ---------------------------------------------------------------------------
console.log("\n5. Leak report finds the recurring mistake");
// ---------------------------------------------------------------------------

{
  const decisions = [];
  // A small error made five times: 2.5 lost in total.
  for (let i = 0; i < 5; i += 1) {
    decisions.push({ action: "Call", options: opts(2, 1.5), street: "Turn", position: "BB" });
  }
  // A larger error made once: 2.0 lost.
  decisions.push({ action: "Call", options: opts(3, 1), street: "River", position: "BTN" });
  // And a spot played correctly, repeatedly.
  for (let i = 0; i < 4; i += 1) {
    decisions.push({ action: "Raise", options: opts(2, 1), street: "Flop", position: "CO" });
  }

  const leaks = buildLeakReport(decisions, { minSamples: 3 });
  console.log("       " + leaks.map((l) => `${l.key} = ${l.evLoss.toFixed(1)}`).join("  |  "));

  ok("only repeated spots are reported", leaks.every((l) => l.count >= 3));
  ok("the recurring small error ranks first",
     leaks[0].street === "Turn" && leaks[0].position === "BB",
     `${leaks[0].key}`);
  near("its total cost is counted", leaks[0].evLoss, 2.5, 1e-9);
  ok("the one-off larger error is not listed as a leak",
     !leaks.some((l) => l.street === "River"), "needs 3 samples");
  ok("a well-played spot says so",
     leaks.find((l) => l.street === "Flop").suggestion.includes("well"),
     leaks.find((l) => l.street === "Flop").suggestion);
  ok("the leak names the better action",
     leaks[0].suggestion.includes("Raise"), leaks[0].suggestion);
}

// ---------------------------------------------------------------------------
console.log("\n6. Range comparison finds specific hands");
// ---------------------------------------------------------------------------

{
  const solved = [
    { code: "AA", probs: [0, 1] },
    { code: "72o", probs: [1, 0] },
    { code: "KQs", probs: [0.5, 0.5] },
  ];
  const played = [
    { code: "AA", probs: [0, 1] },
    { code: "72o", probs: [0, 1] },      // played every time, solver never does
    { code: "KQs", probs: [1, 0] },      // never played, solver mixes
  ];
  const diff = compareRanges(played, solved);

  ok("hands played too often are named", diff.tooLoose.some((r) => r.code === "72o"),
     diff.tooLoose.map((r) => r.code).join(","));
  ok("hands played too rarely are named", diff.tooTight.some((r) => r.code === "KQs"),
     diff.tooTight.map((r) => r.code).join(","));
  ok("hands played correctly are not flagged",
     !diff.tooLoose.some((r) => r.code === "AA") && !diff.tooTight.some((r) => r.code === "AA"));

  // VPIP over these three codes only: AA 6 + 72o 12 of 6+12+4 = 22 combos.
  near("played VPIP is combo-weighted", diff.playedVpip, 18 / 22, 1e-9);
  near("solved VPIP is combo-weighted", diff.solvedVpip, (6 + 0.5 * 4) / 22, 1e-9);
  ok("rows are ordered by how wrong they are",
     Math.abs(diff.rows[0].delta) >= Math.abs(diff.rows[diff.rows.length - 1].delta));
}

console.log(
  failures === 0 ? "\nAll report checks passed." : `\n${failures} check(s) FAILED.`
);
process.exit(failures === 0 ? 0 : 1);
