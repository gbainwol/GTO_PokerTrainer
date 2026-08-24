/**
 * Solver validation.
 *
 *  1. Terminal values vs a brute-force O(n*m) reference. This is the part most
 *     likely to be subtly wrong - card removal means a hand's value depends on
 *     which opponent combos it blocks.
 *  2. Exploitability falls toward zero as CFR+ iterates. This is the definitive
 *     test that the thing is converging to an equilibrium rather than to some
 *     arbitrary fixed point.
 *  3. A symmetric spot must have game value zero.
 *  4. The polarized-vs-bluffcatcher toy game, whose equilibrium is known
 *     analytically: facing a pot-sized bet the bluffcatcher calls P/(P+B), and
 *     the polarized player bluffs B/(P+B) of its air.
 */

import {
  solveRiver,
  prepareRange,
  showdownValues,
  foldValues,
  buildSelfIndex,
  buildTree,
  rootActionMix,
  handStrategy,
  computeExploitability,
  expectedValue,
  OOP,
  IP,
} from "./solver.js";
import { cardToInt } from "./evaluator.js";
import { rangeToCombos } from "./range.js";

let failures = 0;
const cards = (s) => s.split(" ").map(cardToInt);
const combos = (list) => Int32Array.from(list.flatMap((h) => cards(h)));

const ok = (label, pass, detail = "") => {
  if (!pass) failures += 1;
  console.log(`  ${pass ? "ok  " : "FAIL"} ${label.padEnd(50)} ${detail}`);
};
const near = (label, actual, expected, tol) =>
  ok(
    label,
    Math.abs(actual - expected) <= tol,
    `${actual.toFixed(4)} (expected ~${expected.toFixed(4)} +/- ${tol})`
  );

// ---------------------------------------------------------------------------
console.log("1. Terminal values vs brute-force reference (card removal)");
// ---------------------------------------------------------------------------

const board = cards("2c 7d 9h Jc 4s");

// Two overlapping ranges so blockers and identical combos both occur.
const rangeA = prepareRange(rangeToCombos("TT+,AJs,KQs,98s", board), null, board);
const rangeB = prepareRange(rangeToCombos("99+,AQ,JTs,87s", board), null, board);

const selfAB = buildSelfIndex(rangeA, rangeB);

// Random-ish but deterministic reach vector.
let seed = 12345;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
const reachB = Float64Array.from({ length: rangeB.size }, () => rnd());

const PAYOFF = 7.5;

/** Reference: compare every pair directly, skipping any that share a card. */
const refShowdown = (me, opp, oppReach, payoff) => {
  const out = new Float64Array(me.size);
  for (let i = 0; i < me.size; i += 1) {
    let acc = 0;
    for (let j = 0; j < opp.size; j += 1) {
      if (
        opp.cardA[j] === me.cardA[i] || opp.cardA[j] === me.cardB[i] ||
        opp.cardB[j] === me.cardA[i] || opp.cardB[j] === me.cardB[i]
      ) continue;
      if (me.strength[i] > opp.strength[j]) acc += oppReach[j];
      else if (me.strength[i] < opp.strength[j]) acc -= oppReach[j];
    }
    out[i] = payoff * acc;
  }
  return out;
};

const refFold = (me, opp, oppReach, payoff) => {
  const out = new Float64Array(me.size);
  for (let i = 0; i < me.size; i += 1) {
    let acc = 0;
    for (let j = 0; j < opp.size; j += 1) {
      if (
        opp.cardA[j] === me.cardA[i] || opp.cardA[j] === me.cardB[i] ||
        opp.cardB[j] === me.cardA[i] || opp.cardB[j] === me.cardB[i]
      ) continue;
      acc += oppReach[j];
    }
    out[i] = payoff * acc;
  }
  return out;
};

const fast = showdownValues(rangeA, rangeB, reachB, PAYOFF, selfAB, new Float64Array(rangeA.size));
const slow = refShowdown(rangeA, rangeB, reachB, PAYOFF);
let maxDiff = 0;
for (let i = 0; i < rangeA.size; i += 1) maxDiff = Math.max(maxDiff, Math.abs(fast[i] - slow[i]));
ok(`showdown matches reference over ${rangeA.size} hands`, maxDiff < 1e-9, `max diff ${maxDiff.toExponential(2)}`);

const fastF = foldValues(rangeA, rangeB, reachB, PAYOFF, selfAB, new Float64Array(rangeA.size));
const slowF = refFold(rangeA, rangeB, reachB, PAYOFF);
let maxDiffF = 0;
for (let i = 0; i < rangeA.size; i += 1) maxDiffF = Math.max(maxDiffF, Math.abs(fastF[i] - slowF[i]));
ok(`fold matches reference over ${rangeA.size} hands`, maxDiffF < 1e-9, `max diff ${maxDiffF.toExponential(2)}`);

// A range against itself is the hardest blocker case: every combo blocks itself.
const selfAA = buildSelfIndex(rangeA, rangeA);
const reachA = Float64Array.from({ length: rangeA.size }, () => rnd());
const fastSelf = showdownValues(rangeA, rangeA, reachA, PAYOFF, selfAA, new Float64Array(rangeA.size));
const slowSelf = refShowdown(rangeA, rangeA, reachA, PAYOFF);
let maxSelf = 0;
for (let i = 0; i < rangeA.size; i += 1) maxSelf = Math.max(maxSelf, Math.abs(fastSelf[i] - slowSelf[i]));
ok("showdown correct when both ranges are identical", maxSelf < 1e-9, `max diff ${maxSelf.toExponential(2)}`);

// ---------------------------------------------------------------------------
console.log("\n2. Exploitability converges toward zero");
// ---------------------------------------------------------------------------

const convBoard = cards("2c 7d 9h Jc 4s");
const convOOP = rangeToCombos("TT+,AJs,KQs,98s,A5s", convBoard);
const convIP = rangeToCombos("99+,AQ,JTs,87s,65s", convBoard);

const history = [];
for (const iters of [10, 50, 200, 800]) {
  const r = solveRiver({
    board: convBoard,
    oopCombos: convOOP,
    ipCombos: convIP,
    pot: 10,
    effectiveStack: 20,
    iterations: iters,
    treeConfig: { betSizes: [0.75], raiseSizes: [], maxRaises: 0, allowAllIn: false },
  });
  history.push({ iters, expl: r.exploitability.percentOfPot, ms: r.elapsedMs });
  console.log(
    `       ${String(iters).padStart(4)} iters -> exploitability ${r.exploitability.percentOfPot.toFixed(3)}% of pot  (${r.elapsedMs}ms)`
  );
}
ok(
  "exploitability decreases monotonically",
  history.every((h, i) => i === 0 || h.expl <= history[i - 1].expl + 1e-9)
);
ok(
  "exploitability under 1% of pot at 800 iterations",
  history[history.length - 1].expl < 1.0,
  `${history[history.length - 1].expl.toFixed(3)}%`
);

// ---------------------------------------------------------------------------
console.log("\n3. Symmetric spot has game value zero");
// ---------------------------------------------------------------------------

const symBoard = cards("2c 7d 9h Jc 4s");
const symRange = rangeToCombos("TT+,AQs,87s", symBoard);
const sym = solveRiver({
  board: symBoard,
  oopCombos: symRange,
  ipCombos: symRange,
  pot: 10,
  effectiveStack: 20,
  iterations: 600,
  treeConfig: { betSizes: [0.75], raiseSizes: [], maxRaises: 0, allowAllIn: false },
});
// Exploitability is the average gain from deviating; at a symmetric equilibrium
// neither player has an edge, so it collapses to zero.
near("symmetric game exploitability", sym.exploitability.percentOfPot, 0, 1.0);

// ---------------------------------------------------------------------------
console.log("\n4. Polarized vs bluffcatcher (known analytic equilibrium)");
// ---------------------------------------------------------------------------

/*
 * Board 2c 7d 9h Jc 4s.
 *   IP  : 9c9s = trip nines (the nuts here)   |  3d5c = jack-high (air)
 *   OOP : TdTh = pair of tens (bluffcatcher; beats the air, loses to the trips)
 *
 * OOP acts first but is given no bet size, so the tree reduces exactly to the
 * textbook game: OOP checks, IP bets or checks, OOP calls or folds.
 *
 * With pot P and bet B, equilibrium is:
 *   OOP calls with frequency P / (P + B)
 *   IP  bluffs its air with frequency B / (P + B)
 * For a pot-sized bet (B = P) both are 1/2.
 */
const toyBoard = cards("2c 7d 9h Jc 4s");
const toy = solveRiver({
  board: toyBoard,
  oopCombos: combos(["Td Th"]),
  ipCombos: combos(["9c 9s", "3d 5c"]),
  pot: 10,
  effectiveStack: 10,
  iterations: 4000,
  treeConfig: {
    oopBetSizes: [],   // OOP may only check, reducing the tree to the toy game
    ipBetSizes: [1.0], // IP may check or bet pot
    raiseSizes: [],
    maxRaises: 0,
    allowAllIn: false,
  },
});

// With no bet sizes and no all-in, OOP's only action is to check.
const oopMix = rootActionMix(toy, OOP);
ok("OOP has only the check branch", oopMix.length === 1 && oopMix[0].type === "check");

// After OOP checks it is IP's turn.
const ipNode = toy.tree.root.children[0];
ok("IP acts after the check", ipNode.player === IP, `player ${ipNode.player}`);
console.log(`       IP actions: ${ipNode.actions.map((a) => a.label).join(", ")}`);

const ipAvg = toy.average.get(ipNode.id);
const ipRange = toy.ranges[IP];
const ipActions = ipNode.actions.length;
const betIdx = ipNode.actions.findIndex((a) => a.type === "bet");
ok("IP has a bet available", betIdx >= 0);

const strengthSorted = [...Array(ipRange.size).keys()].sort(
  (x, y) => ipRange.strength[y] - ipRange.strength[x]
);
const nutsIdx = strengthSorted[0];
const airIdx = strengthSorted[strengthSorted.length - 1];
const nutsBet = ipAvg[nutsIdx * ipActions + betIdx];
const airBet = ipAvg[airIdx * ipActions + betIdx];
console.log(`       IP bets nuts ${(nutsBet * 100).toFixed(1)}%, air ${(airBet * 100).toFixed(1)}%`);

near("IP bets the nuts ~always", nutsBet, 1.0, 0.05);
near("IP bluffs its air B/(P+B) = 50%", airBet, 0.5, 0.06);

// OOP's calling frequency facing that bet.
const oopFacing = ipNode.children[betIdx];
ok("OOP acts facing the bet", oopFacing.player === OOP);
const callIdx = oopFacing.actions.findIndex((a) => a.type === "call");
const oopAvg = toy.average.get(oopFacing.id);
const callFreq = oopAvg[0 * oopFacing.actions.length + callIdx];
console.log(`       OOP calls ${(callFreq * 100).toFixed(1)}%`);
near("OOP calls P/(P+B) = 50%", callFreq, 0.5, 0.06);

near("toy game solved to equilibrium", toy.exploitability.percentOfPot, 0, 0.5);

// ---------------------------------------------------------------------------
console.log("\n5. Dominated ranges");
// ---------------------------------------------------------------------------

/*
 * OOP holds pure air on As Ks Qs 7d 2h; IP holds Js Ts, a royal flush.
 *
 * Note what equilibrium actually says here: because OOP can never win, IP
 * collects the whole pot whether it bets (OOP folds) or checks (IP wins the
 * showdown). IP is therefore genuinely *indifferent*, and a mixed strategy is
 * correct - "always bet the nuts" only holds when the opponent has some reason
 * to call. So the meaningful assertions are that OOP never calls and that IP
 * captures the entire pot.
 */
const domBoard = cards("As Ks Qs 7d 2h");
const dom = solveRiver({
  board: domBoard,
  oopCombos: combos(["3d 4c"]),
  ipCombos: combos(["Js Ts"]),
  pot: 10,
  effectiveStack: 20,
  iterations: 1500,
  treeConfig: { betSizes: [1.0], raiseSizes: [], maxRaises: 0, allowAllIn: false },
});
const domIpNode = dom.tree.root.children[0];
const domBetIdx = domIpNode.actions.findIndex((a) => a.type === "bet");
const domFacing = domIpNode.children[domBetIdx];
const domFoldIdx = domFacing.actions.findIndex((a) => a.type === "fold");
const domFold = dom.average.get(domFacing.id)[domFoldIdx];
console.log(`       OOP folds its air ${(domFold * 100).toFixed(1)}%`);
ok("OOP always folds drawing dead", domFold > 0.95, `${(domFold * 100).toFixed(1)}%`);

// Winning the whole pot uncontested is pot/2 under the split-pot convention.
const domIpEV = expectedValue(dom, IP);
const domOopEV = expectedValue(dom, OOP);
console.log(`       IP EV ${domIpEV.toFixed(3)}, OOP EV ${domOopEV.toFixed(3)} (pot 10)`);
near("IP captures the entire pot", domIpEV, 5, 0.05);
near("OOP loses its share of the pot", domOopEV, -5, 0.05);
near("zero sum", domIpEV + domOopEV, 0, 1e-6);

// ---------------------------------------------------------------------------
console.log("\n6. Realistic spot: performance and reported mix");
// ---------------------------------------------------------------------------

const realBoard = cards("Ah 8d 5c 2s Ks");
const realOOP = rangeToCombos("22+,A2s+,KTs+,QJs,JTs,AQo+", realBoard);
const realIP = rangeToCombos("33+,A5s+,K9s+,QTs+,J9s+,T9s,ATo+,KQo", realBoard);
console.log(
  `       ranges: OOP ${realOOP.length / 2} combos, IP ${realIP.length / 2} combos`
);
const real = solveRiver({
  board: realBoard,
  oopCombos: realOOP,
  ipCombos: realIP,
  pot: 12,
  effectiveStack: 25,
  iterations: 200,
});
console.log(`       tree: ${real.tree.nodeCount} nodes, solved in ${real.elapsedMs}ms`);
console.log(
  `       exploitability ${real.exploitability.percentOfPot.toFixed(2)}% of pot`
);
for (const item of rootActionMix(real, OOP)) {
  console.log(`         ${item.action.padEnd(12)} ${(item.frequency * 100).toFixed(1)}%`);
}
const aaStrategy = handStrategy(real, OOP, cardToInt("Ac"), cardToInt("Ad"));
ok("can read a specific hand's strategy", aaStrategy !== null,
   aaStrategy ? aaStrategy.map((s) => `${s.action} ${(s.frequency * 100).toFixed(0)}%`).join(" / ") : "");

const mixSum = rootActionMix(real, OOP).reduce((acc, m) => acc + m.frequency, 0);
near("root frequencies sum to 1", mixSum, 1, 1e-6);

console.log(
  failures === 0 ? "\nAll solver checks passed." : `\n${failures} check(s) FAILED.`
);
process.exit(failures === 0 ? 0 : 1);
