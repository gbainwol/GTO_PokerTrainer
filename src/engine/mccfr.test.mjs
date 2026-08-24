/**
 * MCCFR validation.
 *
 * The core is checked against Kuhn poker, which is small enough to have a
 * closed-form equilibrium. That pins down the algorithm itself - regret
 * matching, external sampling, average-strategy accumulation - before it is
 * pointed at hold'em, where there is no reference answer to compare against.
 *
 * Kuhn: three cards (J < Q < K), one each, both ante 1, one betting round.
 * Its equilibria form a one-parameter family in a = P1's bluff frequency with
 * the jack, a in [0, 1/3]. Several facts hold for every member of that family,
 * and those are what is asserted here:
 *
 *   game value to player 1 = -1/18
 *   P1 never bets the queen
 *   P1 bets the king exactly 3a as often as the jack
 *   P2 bets 1/3 of the time with the jack when checked to
 *   P2 calls a bet 1/3 of the time with the queen
 *   P2 never folds the king, never calls with the jack
 */

import { solveMCCFR, averageStrategy, evaluateStrategy } from "./mccfr.js";

let failures = 0;
const ok = (label, pass, detail = "") => {
  if (!pass) failures += 1;
  console.log(`  ${pass ? "ok  " : "FAIL"} ${label.padEnd(52)} ${detail}`);
};
const near = (label, a, b, tol) =>
  ok(label, Math.abs(a - b) <= tol, `${a.toFixed(4)} (expected ~${b.toFixed(4)} +/- ${tol})`);

// ---------------------------------------------------------------------------
// Kuhn poker
// ---------------------------------------------------------------------------

const TERMINALS = new Set(["pp", "pbp", "pbb", "bp", "bb"]);
const CARD_NAMES = ["J", "Q", "K"];

const kuhn = {
  numPlayers: 2,

  root(rng) {
    // Deal two distinct cards from three.
    const deck = [0, 1, 2];
    for (let i = 2; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return { cards: [deck[0], deck[1]], history: "" };
  },

  isTerminal: (s) => TERMINALS.has(s.history),

  utility(s, player) {
    const { history, cards } = s;
    const winnerByCard = cards[0] > cards[1] ? 0 : 1;
    let value;
    if (history === "bp") value = player === 0 ? 1 : -1;        // P2 folded
    else if (history === "pbp") value = player === 1 ? 1 : -1;  // P1 folded
    else {
      const stake = history === "pp" ? 1 : 2;                   // showdown size
      value = winnerByCard === player ? stake : -stake;
    }
    return value;
  },

  currentPlayer: (s) => s.history.length % 2,
  infoSet: (s) => `${CARD_NAMES[s.cards[s.history.length % 2]]}:${s.history || "-"}`,
  actions: () => ["p", "b"],
  next: (s, a) => ({ cards: s.cards, history: s.history + a }),
};

console.log("1. Kuhn poker: known analytic equilibrium");

const solved = solveMCCFR(kuhn, { iterations: 120000, seed: 0xC0FFEE });
console.log(`       ${solved.iterations} iterations, ${solved.infoSets} information sets, ${solved.elapsedMs}ms`);
ok("all 12 information sets discovered", solved.infoSets === 12, `${solved.infoSets}`);

const avg = averageStrategy(solved.store);
// Index 0 = pass (check or fold), index 1 = bet (bet or call).
const freq = (key) => (avg.get(key) ? avg.get(key)[1] : NaN);

const jackBet = freq("J:-");
const queenBet = freq("Q:-");
const kingBet = freq("K:-");
console.log(
  `       P1 opening bet:  J ${(jackBet * 100).toFixed(1)}%  Q ${(queenBet * 100).toFixed(1)}%  K ${(kingBet * 100).toFixed(1)}%`
);

near("P1 never bets the queen", queenBet, 0, 0.03);
ok("P1 bluffs the jack within the valid range", jackBet >= -0.01 && jackBet <= 1 / 3 + 0.03,
   `${jackBet.toFixed(4)} (0 .. 0.3333)`);
// The value-to-bluff ratio is fixed across the whole equilibrium family.
near("P1 bets the king exactly 3x as often as the jack", kingBet, 3 * jackBet, 0.05);

const p2JackBet = freq("J:p");
const p2QueenCall = freq("Q:b");
const p2KingBet = freq("K:p");
const p2KingCall = freq("K:b");
const p2JackCall = freq("J:b");
console.log(
  `       P2: bets J after check ${(p2JackBet * 100).toFixed(1)}%, calls with Q ${(p2QueenCall * 100).toFixed(1)}%`
);
near("P2 bets the jack 1/3 when checked to", p2JackBet, 1 / 3, 0.04);
near("P2 calls a bet with the queen 1/3", p2QueenCall, 1 / 3, 0.04);
near("P2 always bets the king when checked to", p2KingBet, 1, 0.03);
near("P2 always calls with the king", p2KingCall, 1, 0.03);
near("P2 never calls with the jack", p2JackCall, 0, 0.03);

// The value of the game is the sharpest single check: it is -1/18 for player 1
// at every equilibrium, so hitting it means the whole strategy profile is right.
const evs = evaluateStrategy(kuhn, solved.store, { samples: 400000, seed: 0x5EED });
console.log(
  `       game value to P1: ${evs[0].ev.toFixed(4)} +/- ${evs[0].confidence95.toFixed(4)}  (exact -1/18 = ${(-1 / 18).toFixed(4)})`
);
near("game value to player 1 is -1/18", evs[0].ev, -1 / 18, 0.005);
near("Kuhn is zero sum", evs[0].ev + evs[1].ev, 0, 1e-9);

/*
 * Exact exploitability, by enumeration rather than sampling.
 *
 * Kuhn is small enough to compute this properly: walk all six deals with known
 * probabilities to get the exact value of any strategy profile, then take the
 * best of all 64 pure strategies available to a player (6 information sets,
 * two actions each). No Monte Carlo noise, and no clairvoyance bias.
 */
const DEALS = [];
for (let a = 0; a < 3; a += 1) {
  for (let b = 0; b < 3; b += 1) if (a !== b) DEALS.push([a, b]);
}

/** Exact EV to player 0 when both players follow the given behaviour rules. */
const exactValue = (rules) => {
  const walk = (cards, history, prob) => {
    if (TERMINALS.has(history)) {
      return prob * kuhn.utility({ cards, history }, 0);
    }
    const actor = history.length % 2;
    const key = `${CARD_NAMES[cards[actor]]}:${history || "-"}`;
    const [pPass, pBet] = rules[actor](key);
    return (
      (pPass > 0 ? walk(cards, `${history}p`, prob * pPass) : 0) +
      (pBet > 0 ? walk(cards, `${history}b`, prob * pBet) : 0)
    );
  };
  return DEALS.reduce((sum, cards) => sum + walk(cards, "", 1 / DEALS.length), 0);
};

/** The six information sets a given player owns, in a fixed order. */
const infoSetsFor = (player) => {
  const histories = player === 0 ? ["-", "pb"] : ["p", "b"];
  const keys = [];
  for (const h of histories) for (const c of CARD_NAMES) keys.push(`${c}:${h}`);
  return keys;
};

const fromAverage = (player) => (key) => {
  const a = avg.get(key);
  return a ? [a[0], a[1]] : [0.5, 0.5];
};

/** Best of all 2^6 pure strategies for `player`, against the solved average. */
const exactBestResponse = (player) => {
  const keys = infoSetsFor(player);
  let best = -Infinity;
  for (let mask = 0; mask < 1 << keys.length; mask += 1) {
    const pure = new Map();
    keys.forEach((key, i) => pure.set(key, (mask >> i) & 1 ? [0, 1] : [1, 0]));
    const rules = [fromAverage(0), fromAverage(1)];
    rules[player] = (key) => pure.get(key) ?? [1, 0];
    const value = exactValue(rules);
    const forPlayer = player === 0 ? value : -value;
    if (forPlayer > best) best = forPlayer;
  }
  return best;
};

const exactGameValue = exactValue([fromAverage(0), fromAverage(1)]);
console.log(`       exact value of the solved profile: ${exactGameValue.toFixed(5)}`);
near("exact game value is -1/18", exactGameValue, -1 / 18, 0.002);

let totalExploitability = 0;
for (const p of [0, 1]) {
  const br = exactBestResponse(p);
  const current = p === 0 ? exactGameValue : -exactGameValue;
  const gain = br - current;
  totalExploitability += gain;
  console.log(`       player ${p + 1}: best response ${br.toFixed(5)} vs ${current.toFixed(5)} -> gain ${gain.toFixed(5)}`);
  ok(`player ${p + 1} has almost nothing to gain by deviating`, gain < 0.01, `${gain.toFixed(5)} chips/hand`);
}
console.log(`       exploitability ${(totalExploitability / 2).toFixed(5)} chips/hand`);
ok("profile is within 0.005 chips/hand of equilibrium", totalExploitability / 2 < 0.005,
   `${(totalExploitability / 2).toFixed(5)}`);

// ---------------------------------------------------------------------------
console.log("\n2. Convergence: more iterations, closer to the known value");
// ---------------------------------------------------------------------------

/*
 * The game value is a poor convergence signal here: Kuhn's value is so
 * insensitive that 2000 iterations already sits inside Monte Carlo noise of
 * -1/18. Strategy error is the sharper measure, and it is computed exactly.
 */
const errors = [];
for (const iters of [500, 5000, 60000]) {
  const r = solveMCCFR(kuhn, { iterations: iters, seed: 0xC0FFEE });
  const a = averageStrategy(r.store);
  const get = (k) => (a.get(k) ? a.get(k)[1] : 0.5);
  // Deviations from facts that hold at every equilibrium.
  const err =
    Math.abs(get("Q:-") - 0) +
    Math.abs(get("J:p") - 1 / 3) +
    Math.abs(get("Q:b") - 1 / 3) +
    Math.abs(get("K:-") - 3 * get("J:-")) +
    Math.abs(get("K:b") - 1) +
    Math.abs(get("J:b") - 0);
  errors.push(err);
  console.log(`       ${String(iters).padStart(6)} iters -> strategy error ${err.toFixed(4)}`);
}
ok("strategy error shrinks with iterations", errors[errors.length - 1] < errors[0] / 2,
   errors.map((e) => e.toFixed(4)).join(" -> "));

console.log(
  failures === 0 ? "\nAll MCCFR checks passed." : `\n${failures} check(s) FAILED.`
);
process.exit(failures === 0 ? 0 : 1);
