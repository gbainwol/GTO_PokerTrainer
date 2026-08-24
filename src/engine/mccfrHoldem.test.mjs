/**
 * Multiway hold'em MCCFR validation.
 *
 * There is no closed-form answer here - that is what the Kuhn tests in
 * mccfr.test.mjs are for. What can be checked is that the solver reproduces
 * poker facts that must hold at any equilibrium, that its numbers are
 * internally consistent, and - the sharpest test - that its mixing hands sit
 * exactly at the pot-odds indifference point when measured by the separately
 * validated equity engine.
 */

import { makeHoldemGame, seatExpectedValues, openingStrategy } from "./mccfrHoldem.js";
import { solveMCCFR, averageStrategy, evaluateStrategy, trainingQuality } from "./mccfr.js";
import { handCodeToCombos } from "./range.js";
import { calculateEquity } from "./equity.js";

let failures = 0;
const ok = (label, pass, detail = "") => {
  if (!pass) failures += 1;
  console.log(`  ${pass ? "ok  " : "FAIL"} ${label.padEnd(52)} ${detail}`);
};
const near = (label, a, b, tol) =>
  ok(label, Math.abs(a - b) <= tol, `${a.toFixed(4)} (expected ~${b.toFixed(4)} +/- ${tol})`);

const SEATS = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];
const table = (n, stack) => SEATS.slice(0, n).map((seat) => ({ seat, stack }));
/** Button sits three from the end, so SB and BB are always the last two seats. */
const buttonFor = (n) => Math.max(0, n - 3);

const solveTable = (n, stack, iterations, opts = {}) => {
  const game = makeHoldemGame({
    seats: table(n, stack),
    buttonIndex: buttonFor(n),
    pushFold: true,
    ...opts,
  });
  const result = solveMCCFR(game, { iterations, seed: opts.seed ?? 0xABCDEF });
  return { game, result, average: averageStrategy(result.store) };
};

/** Combo-weighted frequency, so AA counts 6 and AKo counts 12. */
const weighted = (rows, pick) => {
  let hit = 0;
  let total = 0;
  for (const row of rows) {
    const combos = handCodeToCombos(row.code).length;
    total += combos;
    hit += combos * pick(row.probs);
  }
  return total > 0 ? hit / total : 0;
};

/** Every decision a seat faces after somebody has shoved. */
const facingShove = (average, seat) => {
  const rows = [];
  for (const [key, probs] of average) {
    const [keySeat, code, history] = key.split("|");
    if (keySeat !== seat || !history.includes("allin")) continue;
    rows.push({ code, probs: Array.from(probs) });
  }
  return rows;
};

// ---------------------------------------------------------------------------
console.log("1. Zero sum, and how well trained the solve is");
// ---------------------------------------------------------------------------

for (const n of [2, 3, 6]) {
  const { game, result } = solveTable(n, 10, 40000);
  const evs = evaluateStrategy(game, result.store, { samples: 40000, seed: 0x1111 });
  const quality = trainingQuality(result.store);
  console.log(
    `       ${n} players: ${quality.infoSets} info sets, median ${quality.median} visits, ` +
    `${(quality.undertrained * 100).toFixed(0)}% undertrained, ${result.elapsedMs}ms`
  );
  console.log(
    "         " + seatExpectedValues(game, evs)
      .map((e) => `${e.seat} ${e.evBB >= 0 ? "+" : ""}${e.evBB.toFixed(3)}`).join("  ")
  );
  near(`${n}-handed payoffs sum to zero`, evs.reduce((s, e) => s + e.ev, 0), 0, 1e-6);
  ok(`${n}-handed solve is adequately trained`, quality.undertrained < 0.05,
     `${(quality.undertrained * 100).toFixed(1)}% below ${quality.minVisits} visits`);
}

// ---------------------------------------------------------------------------
console.log("\n2. Position: blinds pay, everyone else collects");
// ---------------------------------------------------------------------------

{
  const { game, result } = solveTable(6, 12, 80000);
  const evs = evaluateStrategy(game, result.store, { samples: 80000, seed: 0x2222 });
  const bySeat = Object.fromEntries(seatExpectedValues(game, evs).map((e) => [e.seat, e]));
  console.log(
    "       " + Object.values(bySeat)
      .map((e) => `${e.seat} ${e.evBB >= 0 ? "+" : ""}${e.evBB.toFixed(3)}`).join("  ")
  );
  ok("big blind loses money", bySeat.BB.evBB < 0, `${bySeat.BB.evBB.toFixed(3)} bb/hand`);
  ok("small blind loses money", bySeat.SB.evBB < 0, `${bySeat.SB.evBB.toFixed(3)} bb/hand`);
  ok("big blind loses more than small blind", bySeat.BB.evBB < bySeat.SB.evBB,
     `BB ${bySeat.BB.evBB.toFixed(3)} vs SB ${bySeat.SB.evBB.toFixed(3)}`);
  ok("the button is profitable", bySeat.BTN.evBB > 0, `${bySeat.BTN.evBB.toFixed(3)} bb/hand`);
}

// ---------------------------------------------------------------------------
console.log("\n3. Hand quality drives the strategy");
// ---------------------------------------------------------------------------

{
  const { average } = solveTable(6, 12, 150000);
  const rows = openingStrategy(average, "UTG");
  const byCode = Object.fromEntries(rows.map((r) => [r.code, r.probs]));
  const shove = (code) => (byCode[code] ? byCode[code][byCode[code].length - 1] : NaN);
  console.log(
    `       UTG shove:  AA ${(shove("AA") * 100).toFixed(1)}%  KK ${(shove("KK") * 100).toFixed(1)}%  ` +
    `AKs ${(shove("AKs") * 100).toFixed(1)}%  72o ${(shove("72o") * 100).toFixed(1)}%  ` +
    `32o ${(shove("32o") * 100).toFixed(1)}%`
  );
  // Pure frequencies are approached asymptotically rather than reached: 32o
  // shoves 10.3% at 80k iterations, 6.3% at 200k, 4.3% at 400k, while AA
  // climbs 96.1% -> 98.2%. The thresholds allow for that tail.
  ok("aces are always shoved", shove("AA") > 0.95, `${(shove("AA") * 100).toFixed(1)}%`);
  ok("kings are always shoved", shove("KK") > 0.95, `${(shove("KK") * 100).toFixed(1)}%`);
  ok("32o is folded from under the gun", shove("32o") < 0.12, `${(shove("32o") * 100).toFixed(1)}%`);
  ok("aces outrank trash by a mile", shove("AA") - shove("32o") > 0.8);
}

// ---------------------------------------------------------------------------
console.log("\n4. Heads-up push/fold vs published Nash charts");
// ---------------------------------------------------------------------------

/*
 * Nash shoving frequencies for the small blind are well established and stable
 * across sources. Strictness matters: an earlier version of this model also
 * allowed limping, which is not part of the push/fold game the charts
 * describe, and shoving came out 6-9 points light at every depth.
 */
const NASH_SB_SHOVE = { 5: 0.71, 10: 0.59, 15: 0.50, 20: 0.44 };
const shoveByStack = [];
for (const stack of [5, 10, 15, 20]) {
  const { average } = solveTable(2, stack, 150000);
  const freq = weighted(openingStrategy(average, "UTG"), (p) => p[p.length - 1]);
  shoveByStack.push(freq);
  const expected = NASH_SB_SHOVE[stack];
  console.log(`       ${String(stack).padStart(2)}bb -> shoves ${(freq * 100).toFixed(1)}%  (Nash ${(expected * 100).toFixed(0)}%)`);
  near(`${stack}bb shove frequency matches Nash`, freq, expected, 0.05);
}
ok("shoving loosens as stacks shorten",
   shoveByStack.every((v, i) => i === 0 || v <= shoveByStack[i - 1]),
   shoveByStack.map((v) => `${(v * 100).toFixed(0)}%`).join(" > "));

// ---------------------------------------------------------------------------
console.log("\n5. Calling threshold sits at the pot odds");
// ---------------------------------------------------------------------------

/*
 * The sharpest available test, and it needs no reference chart at all.
 *
 * At equilibrium the hands the big blind *mixes* between calling and folding
 * are the ones it is indifferent about, so their equity against the shoving
 * range must equal the pot odds being offered. Both sides of that come from
 * elsewhere: the shoving range from the solver, the equity from the equity
 * engine, which is validated separately against published all-in numbers.
 */
{
  const stack = 10;
  const { average } = solveTable(2, stack, 300000);

  /*
   * Rebuild the shoving range *weighted* by how often each hand is actually
   * shoved, by repeating each combo in proportion to its frequency. Taking
   * only the hands shoved at least half the time instead - a hard cutoff -
   * builds a range that is too tight, and measured the marginal hands at 41.6%
   * equity rather than 44.0%.
   */
  const WEIGHT_STEPS = 20;
  const shoveCombos = [];
  for (const row of openingStrategy(average, "UTG")) {
    const p = row.probs[row.probs.length - 1];
    const repeats = Math.round(p * WEIGHT_STEPS);
    for (let i = 0; i < repeats; i += 1) {
      for (const [a, b] of handCodeToCombos(row.code)) shoveCombos.push(a, b);
    }
  }
  const shoveRange = Int32Array.from(shoveCombos);

  // BB has 1 posted and calls `stack - 1` more into a final pot of 2*stack.
  const required = (stack - 1) / (2 * stack);
  const marginal = facingShove(average, "HJ")
    .map((r) => ({ code: r.code, call: r.probs.length >= 2 ? r.probs[1] : 0 }))
    .filter((r) => r.call > 0.3 && r.call < 0.7);

  let sum = 0;
  for (const hand of marginal) {
    const [a, b] = handCodeToCombos(hand.code)[0];
    sum += calculateEquity({
      hero: [a, b], opponents: 1, ranges: [shoveRange],
      maxIterations: 40000, forceMonteCarlo: true, seed: 0x77,
    }).equity;
  }
  const meanEquity = sum / marginal.length;

  console.log(
    `       weighted shoving range ${shoveCombos.length / 2} combo-slots; ` +
    `${marginal.length} hands mixing call/fold`
  );
  console.log(
    `       their mean equity ${(meanEquity * 100).toFixed(1)}% vs pot odds ${(required * 100).toFixed(1)}%`
  );
  ok("there is a genuine mixing region", marginal.length >= 5, `${marginal.length} hands`);
  near("indifferent hands sit at the pot-odds threshold", meanEquity, required, 0.025);
}

// ---------------------------------------------------------------------------
console.log("\n6. Determinism, and the limits of the sized-raise model");
// ---------------------------------------------------------------------------

{
  const a = solveTable(3, 10, 20000, { seed: 0x777 });
  const b = solveTable(3, 10, 20000, { seed: 0x777 });
  const evA = evaluateStrategy(a.game, a.result.store, { samples: 20000, seed: 5 });
  const evB = evaluateStrategy(b.game, b.result.store, { samples: 20000, seed: 5 });
  ok("the same seed reproduces the same solve",
     evA.every((e, i) => Math.abs(e.ev - evB[i].ev) < 1e-12),
     evA.map((e) => e.ev.toFixed(6)).join(", "));

  /*
   * Deep-stacked play with real raise sizes, by player count.
   *
   * Push/fold only describes short stacks, so this is the model for anything
   * deeper. It converges heads-up and is usable three-handed; beyond that it
   * does not, and hand abstraction does not rescue it. Grouping the 169
   * starting hands into 24 classes cuts six-max information sets from 748k to
   * 85k but leaves the median visited three times, because the bottleneck is
   * the number of distinct betting sequences, not the number of hands.
   *
   * Note the opening decisions train fine even where the whole tree does not -
   * they are visited constantly - which is exactly why trainingQuality has to
   * be consulted rather than eyeballing a chart.
   */
  const deep = [];
  for (const n of [2, 3]) {
    const solved = solveTable(n, 100, 120000, { pushFold: false, maxRaises: 2 });
    const q = trainingQuality(solved.result.store);
    const evs = evaluateStrategy(solved.game, solved.result.store, { samples: 30000, seed: 11 });
    deep.push({ n, q });
    console.log(
      `       ${n}-handed at 100bb: ${q.infoSets} info sets, median ${q.median} visits, ` +
      `${(q.undertrained * 100).toFixed(0)}% undertrained, ${solved.result.elapsedMs}ms`
    );
    near(`${n}-handed deep payoffs sum to zero`, evs.reduce((a, e) => a + e.ev, 0), 0, 1e-6);
  }
  ok("heads-up deep preflop is fully trained", deep[0].q.undertrained < 0.02,
     `${(deep[0].q.undertrained * 100).toFixed(1)}%`);
  ok("three-handed deep preflop is usable", deep[1].q.median >= 50,
     `median ${deep[1].q.median} visits`);

  for (const iterations of [50000]) {
    const sized = solveTable(6, 100, iterations, { pushFold: false, maxRaises: 2 });
    const q = trainingQuality(sized.result.store);
    console.log(
      `       6-handed at 100bb, ${iterations} iters: ${q.infoSets} info sets, ` +
      `median ${q.median} visits, ${(q.undertrained * 100).toFixed(0)}% undertrained`
    );
    console.log("       (recorded, not asserted - six-max deep does not converge here)");
  }
}

console.log(
  failures === 0 ? "\nAll multiway hold'em checks passed." : `\n${failures} check(s) FAILED.`
);
process.exit(failures === 0 ? 0 : 1);
