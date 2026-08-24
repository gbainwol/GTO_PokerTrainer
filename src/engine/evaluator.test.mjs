/**
 * Validation for the hand evaluator.
 *
 *  1. Exhaustive: all C(52,5) = 2,598,960 five-card hands must produce the
 *     textbook category frequencies. This pins down every classification path.
 *  2. Cross-check: random 7-card hands are compared against an independently
 *     written brute-force reference (best of all 21 five-card subsets), on both
 *     category and pairwise ordering.
 *  3. Spot checks for the ordering bugs that broke the original implementation.
 */
import {
  evaluate,
  categoryOf,
  handName,
  cardsToInts,
  CATEGORY_NAMES,
} from "./evaluator.js";

let failures = 0;
const check = (label, actual, expected) => {
  const ok = actual === expected;
  if (!ok) {
    failures += 1;
    console.log(`  FAIL ${label}: got ${actual}, expected ${expected}`);
  }
  return ok;
};

// --- 1. Exhaustive 5-card category frequencies --------------------------

const EXPECTED_COUNTS = {
  "Straight Flush": 40,
  "Four of a Kind": 624,
  "Full House": 3744,
  Flush: 5108,
  Straight: 10200,
  "Three of a Kind": 54912,
  "Two Pair": 123552,
  "One Pair": 1098240,
  "High Card": 1302540,
};

const counts = new Array(9).fill(0);
const hand = new Int32Array(5);
let total = 0;
for (let a = 0; a < 52; a += 1) {
  hand[0] = a;
  for (let b = a + 1; b < 52; b += 1) {
    hand[1] = b;
    for (let c = b + 1; c < 52; c += 1) {
      hand[2] = c;
      for (let d = c + 1; d < 52; d += 1) {
        hand[3] = d;
        for (let e = d + 1; e < 52; e += 1) {
          hand[4] = e;
          counts[categoryOf(evaluate(hand, 5))] += 1;
          total += 1;
        }
      }
    }
  }
}

console.log("1. Exhaustive 5-card category frequencies");
check("total hands", total, 2598960);
CATEGORY_NAMES.forEach((name, idx) => {
  check(name.padEnd(16), counts[idx], EXPECTED_COUNTS[name]);
});

// --- 2. Brute-force reference cross-check -------------------------------

// Independent, deliberately naive 5-card evaluator returning a comparable
// array [category, ...tiebreakers]. Written from scratch to avoid sharing
// bugs with the implementation under test.
const refEval5 = (cards) => {
  const ranks = cards.map((c) => c >> 2).sort((x, y) => y - x);
  const suits = cards.map((c) => c & 3);
  const isFlush = suits.every((s) => s === suits[0]);

  const uniq = [...new Set(ranks)];
  let straightHigh = -1;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
    else if (uniq[0] === 12 && uniq[1] === 3) straightHigh = 3; // wheel
  }

  const freq = new Map();
  ranks.forEach((r) => freq.set(r, (freq.get(r) ?? 0) + 1));
  // Sort by count desc, then rank desc.
  const groups = [...freq.entries()].sort((p, q) => q[1] - p[1] || q[0] - p[0]);
  const shape = groups.map((g) => g[1]).join("");
  const byRank = groups.map((g) => g[0]);

  if (isFlush && straightHigh >= 0) return [8, straightHigh];
  if (shape === "41") return [7, byRank[0], byRank[1]];
  if (shape === "32") return [6, byRank[0], byRank[1]];
  if (isFlush) return [5, ...ranks];
  if (straightHigh >= 0) return [4, straightHigh];
  if (shape === "311") return [3, byRank[0], byRank[1], byRank[2]];
  if (shape === "221") return [2, byRank[0], byRank[1], byRank[2]];
  if (shape === "2111") return [1, byRank[0], byRank[1], byRank[2], byRank[3]];
  return [0, ...ranks];
};

const cmpArr = (x, y) => {
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    const dx = (x[i] ?? 0) - (y[i] ?? 0);
    if (dx !== 0) return Math.sign(dx);
  }
  return 0;
};

// Best 5 of 7 via all 21 subsets.
const SUBSETS = [];
for (let a = 0; a < 7; a += 1)
  for (let b = a + 1; b < 7; b += 1)
    for (let c = b + 1; c < 7; c += 1)
      for (let d = c + 1; d < 7; d += 1)
        for (let e = d + 1; e < 7; e += 1) SUBSETS.push([a, b, c, d, e]);

const refEval7 = (cards) => {
  let best = null;
  for (const idx of SUBSETS) {
    const v = refEval5(idx.map((i) => cards[i]));
    if (best === null || cmpArr(v, best) > 0) best = v;
  }
  return best;
};

// Deterministic PRNG so failures are reproducible.
let seed = 0x2f6e2b1;
const rnd = () => {
  seed ^= seed << 13; seed >>>= 0;
  seed ^= seed >> 17;
  seed ^= seed << 5; seed >>>= 0;
  return seed / 0x100000000;
};

const randomHand7 = () => {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  for (let i = 51; i > 44; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck.slice(45);
};

console.log("\n2. 7-card cross-check vs brute-force reference");
const N = 30000;
const samples = [];
let catMismatch = 0;
for (let i = 0; i < N; i += 1) {
  const h = randomHand7();
  const fast = evaluate(h, 7);
  const ref = refEval7(h);
  if (categoryOf(fast) !== ref[0]) {
    if (catMismatch < 5) {
      console.log(
        `  FAIL category: ${h.join(",")} fast=${handName(fast)} ref=${CATEGORY_NAMES[ref[0]]}`
      );
    }
    catMismatch += 1;
  }
  samples.push({ fast, ref });
}
check(`category agreement over ${N} hands`, catMismatch, 0);

// Pairwise ordering must agree - this is what the old scoreHand got wrong.
let orderMismatch = 0;
for (let i = 0; i + 1 < samples.length; i += 1) {
  const x = samples[i];
  const y = samples[i + 1];
  if (Math.sign(x.fast - y.fast) !== cmpArr(x.ref, y.ref)) {
    if (orderMismatch < 5) {
      console.log(
        `  FAIL order: ${handName(x.fast)}(${x.fast}) vs ${handName(y.fast)}(${y.fast})`
      );
    }
    orderMismatch += 1;
  }
}
check(`pairwise ordering over ${samples.length - 1} pairs`, orderMismatch, 0);

// --- 3. Regression spot checks ------------------------------------------

console.log("\n3. Regression spot checks (bugs in the original evaluator)");
const s = (cards) => evaluate(cardsToInts(cards));

const quads = s(["As", "Ah", "Ad", "Ac", "Kd", "2h", "3s"]);
const flush = s(["2s", "5s", "7s", "9s", "Js", "3h", "4d"]);
const boat = s(["Ks", "Kh", "Kd", "Qc", "Qd", "2h", "3s"]);
const highCard = s(["As", "Kh", "Qd", "Jc", "9d", "3h", "2s"]);
const straight = s(["9s", "8h", "7d", "6c", "5d", "2h", "3s"]);

check("quads > flush", quads > flush, true);
check("quads > full house", quads > boat, true);
check("full house > flush", boat > flush, true);
check("flush > straight", flush > straight, true);
check("straight > high card", straight > highCard, true);
check("full house > high card", boat > highCard, true);

// Wheel is the *lowest* straight, not ace-high.
const wheel = s(["As", "2h", "3d", "4c", "5s", "Kh", "9d"]);
const sixHigh = s(["2h", "3d", "4c", "5s", "6h", "Kd", "9c"]);
check("wheel is a straight", handName(wheel), "Straight");
check("six-high straight > wheel", sixHigh > wheel, true);

// Steel wheel straight flush.
const steelWheel = s(["As", "2s", "3s", "4s", "5s", "Kh", "9d"]);
check("steel wheel is a straight flush", handName(steelWheel), "Straight Flush");

// Two pair with three pairs available: kicker must be the best remaining card,
// which may be an unpaired card ranked above the third pair.
const threePair = s(["Ks", "Kh", "5d", "5c", "3s", "3h", "Qd"]);
const refThreePair = refEval7(cardsToInts(["Ks", "Kh", "5d", "5c", "3s", "3h", "Qd"]));
check("three-pair kicker matches reference", categoryOf(threePair), refThreePair[0]);
check(
  "three-pair kicker is the queen, not the third pair",
  (threePair >> 8) & 0xf,
  10 // Q = index 10
);

// Two trips -> full house using the higher trips.
const twoTrips = s(["7s", "7h", "7d", "3s", "3h", "3d", "Kc"]);
check("two trips make a full house", handName(twoTrips), "Full House");
check("higher trips is the set", (twoTrips >> 16) & 0xf, 5); // 7 = index 5

console.log(
  failures === 0
    ? "\nAll evaluator checks passed."
    : `\n${failures} check(s) FAILED.`
);
process.exit(failures === 0 ? 0 : 1);
