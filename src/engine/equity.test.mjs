/**
 * Equity engine validation.
 *
 * Checks exact enumeration against published heads-up all-in equities, verifies
 * degenerate spots resolve to 0/1/0.5, and confirms Monte Carlo converges to
 * the exact answer within its own reported error bars.
 */
import { calculateEquity, countDeals } from "./equity.js";
import { cardToInt } from "./evaluator.js";

let failures = 0;
const c = (s) => s.split(" ").map(cardToInt);
const combo = (s) => Int32Array.from(c(s));

const near = (label, actual, expected, tol) => {
  const ok = Math.abs(actual - expected) <= tol;
  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${label.padEnd(42)} ${(actual * 100).toFixed(2)}%` +
      ` (expected ~${(expected * 100).toFixed(2)}%, tol ${(tol * 100).toFixed(2)})`
  );
  if (!ok) failures += 1;
};

const eq = (label, actual, expected) => {
  const ok = actual === expected;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label.padEnd(42)} ${actual}`);
  if (!ok) failures += 1;
};

console.log("1. Known heads-up preflop all-in equities (exact enumeration)");

// Published figures for these exact suit combinations.
const aaVsKk = calculateEquity({
  hero: c("As Ah"),
  opponents: 1,
  ranges: [combo("Ks Kd")],
});
eq("AA vs KK uses exact enumeration", aaVsKk.method, "exact");
eq("AA vs KK deal count", aaVsKk.deals, 1712304);
near("AA vs KK", aaVsKk.equity, 0.8206, 0.005);

const akVsQq = calculateEquity({
  hero: c("As Ks"),
  opponents: 1,
  ranges: [combo("Qh Qd")],
});
near("AKs vs QQ", akVsQq.equity, 0.4613, 0.006);

const akoVs22 = calculateEquity({
  hero: c("As Kh"),
  opponents: 1,
  ranges: [combo("2c 2d")],
});
near("AKo vs 22", akoVs22.equity, 0.4695, 0.006);

// Published equities for a hand *class* like "AKo vs AQo" are averaged over
// suit configurations - individual configurations differ by more than a point
// (74.02% all-offsuit vs 74.69% when the K and Q share a suit), so averaging
// over all 108 valid configurations is what the published number describes.
const SUITS_ALL = "shdc";
let dominatedSum = 0;
let dominatedN = 0;
for (const a1 of SUITS_ALL) {
  for (const k of SUITS_ALL) {
    if (a1 === k) continue;
    for (const a2 of SUITS_ALL) {
      for (const q of SUITS_ALL) {
        if (a2 === q || a1 === a2) continue;
        const hero = [`A${a1}`, `K${k}`];
        const vil = [`A${a2}`, `Q${q}`];
        if (new Set([...hero, ...vil]).size < 4) continue;
        dominatedSum += calculateEquity({
          hero: hero.map(cardToInt),
          opponents: 1,
          ranges: [Int32Array.from(vil.map(cardToInt))],
        }).equity;
        dominatedN += 1;
      }
    }
  }
}
eq("AKo vs AQo suit configurations enumerated", dominatedN, 108);
near("AKo vs AQo (suit-averaged)", dominatedSum / dominatedN, 0.743, 0.006);

console.log("\n2. Degenerate spots");

// Hero holds the nuts on a complete board - no card left to come.
const nuts = calculateEquity({
  hero: c("As Ks"),
  board: c("Qs Js Ts 2h 3d"),
  opponents: 1,
});
near("royal flush on the river", nuts.equity, 1.0, 0);

// Board plays: both players are guaranteed to chop with a board straight
// flush that neither can beat or improve on.
const chop = calculateEquity({
  hero: c("2h 3d"),
  board: c("As Ks Qs Js Ts"),
  opponents: 1,
  ranges: [combo("2c 4d")],
});
near("board royal flush chops", chop.equity, 0.5, 0);
eq("chop counts as a tie", chop.tie, 1);

// Drawing dead: hero cannot win or chop.
const dead = calculateEquity({
  hero: c("2h 3d"),
  board: c("As Ks Qs Js 9h"),
  opponents: 1,
  ranges: [combo("Ts 4d")],
});
near("drawing dead vs made royal", dead.equity, 0, 0);

console.log("\n3. Exact vs Monte Carlo agreement");

// Same flop spot computed both ways; MC must land inside its own error bars.
const heroCards = c("As Kd");
const boardCards = c("Qh 7s 2c");
const villain = [combo("Jc Jh")];

const exactFlop = calculateEquity({
  hero: heroCards,
  board: boardCards,
  opponents: 1,
  ranges: villain,
});
const mcFlop = calculateEquity({
  hero: heroCards,
  board: boardCards,
  opponents: 1,
  ranges: villain,
  forceMonteCarlo: true,
  maxIterations: 200000,
});

eq("exact path chosen for flop", exactFlop.method, "exact");
eq("forced MC path", mcFlop.method, "monte-carlo");
console.log(
  `       exact ${(exactFlop.equity * 100).toFixed(3)}%  |  MC ${(
    mcFlop.equity * 100
  ).toFixed(3)}% +/- ${(mcFlop.confidence95 * 100).toFixed(3)}% (n=${mcFlop.deals})`
);
const within = Math.abs(mcFlop.equity - exactFlop.equity) <= 4 * mcFlop.stdErr;
eq("MC within 4 standard errors of exact", within, true);

console.log("\n4. Multiway and method selection");

// vs a single random hand preflop the space is ~2.1e9 deals -> must use MC.
const vsRandom = calculateEquity({ hero: c("As Ah"), opponents: 1 });
eq("AA vs random opponent uses MC", vsRandom.method, "monte-carlo");
near("AA vs one random hand", vsRandom.equity, 0.8517, 0.006);

const vsFive = calculateEquity({ hero: c("As Ah"), opponents: 5, maxIterations: 120000 });
near("AA vs five random hands", vsFive.equity, 0.4937, 0.012);

// Probabilities must form a partition.
const sum = vsFive.win + vsFive.tie + vsFive.lose;
near("win+tie+lose = 1", sum, 1, 1e-9);

// River vs a random hand is tiny - should be exact.
const river = calculateEquity({
  hero: c("As Kd"),
  board: c("Qh 7s 2c 5d 9h"),
  opponents: 1,
});
eq("river vs random uses exact", river.method, "exact");
eq("river deal count = C(45,2)", river.deals, 990);

console.log("\n5. countDeals sanity");
eq(
  "preflop heads-up vs random is enormous",
  countDeals({ availableCount: 50, boardNeed: 5, opponents: 1 }) > 2e9,
  true
);

console.log(
  failures === 0 ? "\nAll equity checks passed." : `\n${failures} check(s) FAILED.`
);
process.exit(failures === 0 ? 0 : 1);
