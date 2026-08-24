/**
 * Multiway preflop solver worker.
 *
 * A preflop solve depends only on the table shape - player count, stack depth,
 * blinds - and not on the cards the hero happens to hold. So a solve is cached
 * by that shape and every later hand at the same table is an instant lookup.
 * Without the cache a six-max solve costs seconds on every single hand; with
 * it, only the first hand pays.
 */

import { makeHoldemGame, seatExpectedValues, openingStrategy } from "./mccfrHoldem.js";
import { solveMCCFR, averageStrategy, evaluateStrategy, trainingQuality, makeRng } from "./mccfr.js";
import { cardsToHandCode, handCodeToCombos } from "./range.js";

/** Solved tables, keyed by shape. Bounded so a long session cannot grow it. */
const cache = new Map();
const MAX_CACHED = 12;

/**
 * Deepest stack this model may speak about.
 *
 * Push/fold assumes the hand is decided preflop and the board is checked down.
 * That is a good description of short-stack play and a bad one of deep play,
 * where the whole point is what happens after the flop. Left ungated, the
 * solver cheerfully advised shoving A7s for 80 big blinds - technically the
 * equilibrium of the game it was given, and terrible advice about poker.
 */
export const MAX_PUSHFOLD_BB = 25;

/**
 * Deep play needs real raise sizes, which explodes the number of betting
 * sequences. Measured at 120k iterations and 100bb:
 *
 *   2 players    1,690 info sets   median 421 visits    0% undertrained
 *   3 players   13,165 info sets   median  81 visits   23% undertrained
 *   4 players   71,223 info sets   median  19 visits   60% undertrained
 *   6 players  452,812 info sets   median   2 visits   94% undertrained
 *
 * Grouping the 169 starting hands into 24 classes cuts six-max to 85k sets but
 * leaves the median at three visits, because the bottleneck is the betting
 * sequences rather than the hands. So deep solving is offered up to three
 * players and refused beyond that.
 */
export const MAX_DEEP_PLAYERS = 3;

/** Stacks are bucketed: 11.4bb and 11.6bb do not deserve separate solves. */
const bucketStack = (stack) => {
  if (stack <= 6) return Math.max(2, Math.round(stack));
  if (stack <= 20) return Math.round(stack / 2) * 2;
  return Math.round(stack / 5) * 5;
};

const solveFor = ({ seats, buttonIndex, stack, smallBlind, bigBlind, iterations, pushFold, onProgress }) => {
  const key = `${seats.join(",")}|btn${buttonIndex}|${stack}|${smallBlind}/${bigBlind}|${iterations}|${pushFold ? "pf" : "deep"}`;
  const hit = cache.get(key);
  if (hit) return { ...hit, cached: true };

  const game = makeHoldemGame({
    seats: seats.map((seat) => ({ seat, stack })),
    buttonIndex,
    smallBlind,
    bigBlind,
    pushFold,
    raiseFractions: pushFold ? undefined : [1.0],
    maxRaises: pushFold ? undefined : 2,
  });

  const result = solveMCCFR(game, { iterations, seed: 0x51e4d0, onProgress });
  const average = averageStrategy(result.store);
  const evaluations = evaluateStrategy(game, result.store, { samples: 40000, seed: 0x2b1d });

  const entry = {
    game,
    labels: {},
    average,
    quality: trainingQuality(result.store),
    seatEv: seatExpectedValues(game, evaluations, bigBlind),
    iterations: result.iterations,
    infoSets: result.infoSets,
    elapsedMs: result.elapsedMs,
    pushFold,
    cached: false,
  };

  if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value);
  cache.set(key, entry);
  return entry;
};

/**
 * The hero's own decision: their seat's strategy for the hand they hold, at
 * the point they first act with nobody having raised.
 */
/**
 * The action labels available at a specific decision.
 *
 * Push/fold offers fold and shove; deep play also offers a call and a sized
 * raise, so assuming two branches drops half the deep-mode strategy. The
 * labels are read off the game by replaying the history that led to the
 * decision - walking only the fold branch, as an earlier version did, could
 * never reach a node like "BTN:allin" and returned nothing.
 *
 * Deals are resampled because a short stack can change which actions are
 * legal; with fixed stacks the first attempt succeeds.
 */
const labelsForDecision = (game, seat, history) => {
  const steps = !history || history === "-" ? [] : history.split(">");
  const rng = makeRng(0xabc123);

  for (let attempt = 0; attempt < 200; attempt += 1) {
    let state = game.root(rng);
    let reached = true;

    for (const step of steps) {
      if (game.isTerminal(state)) { reached = false; break; }
      const [wantSeat, wantLabel] = step.split(":");
      if (state.players[state.toAct].seat !== wantSeat) { reached = false; break; }
      const actions = game.actions(state);
      const index = actions.findIndex((a) => a.label === wantLabel);
      if (index < 0) { reached = false; break; }
      state = game.next(state, actions[index]);
    }
    if (!reached || game.isTerminal(state)) continue;

    const actions = game.actions(state);
    if (state.players[state.toAct].seat === seat && actions.length > 1) {
      return actions.map((a) => a.label);
    }
  }
  return null;
};

const heroAdvice = (average, seat, holeCards) => {
  if (!holeCards || holeCards.length !== 2) return null;
  const code = cardsToHandCode(holeCards[0], holeCards[1]);

  /*
   * Take the hero's *earliest* decision with this hand, not specifically the
   * opening one. Some seats never get an opening decision at all - the big
   * blind three-handed wins outright when both opponents fold, so no such
   * information set exists - and looking only for openings returned nulls that
   * the panel rendered as "Fold 0% / All-in 0%".
   *
   * The history is returned alongside so the spot being described is explicit
   * rather than assumed.
   */
  let best = null;
  for (const [key, probs] of average) {
    const [keySeat, keyCode, history] = key.split("|");
    if (keySeat !== seat || keyCode !== code) continue;
    const depth = history === "-" ? 0 : history.split(">").length;
    if (!best || depth < best.depth) {
      best = { depth, history, probs: Array.from(probs) };
    }
  }
  if (!best) return null;

  return {
    code,
    fold: best.probs[0] ?? 0,
    shove: best.probs[best.probs.length - 1] ?? 0,
    mix: best.probs,
    history: best.history,
    /** True when this really is "first in with nobody having raised". */
    opening:
      best.history === "-" ||
      best.history.split(">").every((h) => h.endsWith(":fold")),
  };
};

/** Combo-weighted share of all 1326 hands this seat shoves. */
const shoveShare = (average, seat) => {
  let shoved = 0;
  let total = 0;
  for (const row of openingStrategy(average, seat)) {
    const combos = handCodeToCombos(row.code).length;
    total += combos;
    shoved += combos * row.probs[row.probs.length - 1];
  }
  return total > 0 ? shoved / total : 0;
};

/**
 * Warm the JIT before the first real request, the same way solver.worker.js
 * does. A cold isolate ran a six-max push/fold solve in roughly twice the time
 * a warm one takes.
 */
try {
  const warm = makeHoldemGame({
    seats: [{ seat: "A", stack: 8 }, { seat: "B", stack: 8 }],
    buttonIndex: 0,
    pushFold: true,
  });
  solveMCCFR(warm, { iterations: 4000, seed: 1 });
} catch {
  // Best effort only; never let warmup break real requests.
}

self.onmessage = (event) => {
  const { id, payload } = event.data ?? {};
  if (id == null) return;

  try {
    const {
      seats,
      buttonIndex = 0,
      heroSeat,
      heroCards,
      stack,
      smallBlind = 0.5,
      bigBlind = 1,
      iterations,
    } = payload ?? {};

    if (!Array.isArray(seats) || seats.length < 2) {
      throw new Error("need at least two seats");
    }

    const effectiveBB = stack / bigBlind;
    const deep = effectiveBB > MAX_PUSHFOLD_BB;

    if (deep && seats.length > MAX_DEEP_PLAYERS) {
      self.postMessage({
        id,
        ok: true,
        result: {
          applicable: false,
          stackBB: Math.round(effectiveBB),
          maxBB: MAX_PUSHFOLD_BB,
          reason:
            `${Math.round(effectiveBB)}bb is too deep for the push/fold model, and ` +
            `${seats.length}-handed deep preflop does not converge here - the number of ` +
            `betting sequences outruns what the solver can train. Deep solving works up ` +
            `to ${MAX_DEEP_PLAYERS} players; below ${MAX_PUSHFOLD_BB}bb push/fold covers ` +
            `any table size.`,
        },
      });
      return;
    }

    const bucketed = bucketStack(effectiveBB);
    // A bigger tree needs more passes to train the same fraction of it, and a
    // deep tree is far bigger than a push/fold one at the same table size.
    const defaultIterations = deep
      ? Math.round(60000 * seats.length)
      : Math.round(20000 * seats.length);

    const solved = solveFor({
      seats,
      buttonIndex,
      stack: bucketed,
      smallBlind: smallBlind / bigBlind,
      bigBlind: 1,
      iterations: iterations ?? defaultIterations,
      pushFold: !deep,
      onProgress: (p) => self.postMessage({ id, progress: p }),
    });

    self.postMessage({
      id,
      ok: true,
      result: {
        hero: heroAdvice(solved.average, heroSeat, heroCards),
        actionLabels: (() => {
          const advice = heroAdvice(solved.average, heroSeat, heroCards);
          const cacheKey = `${heroSeat}|${advice?.history ?? "-"}`;
          return (
            solved.labels[cacheKey] ??
            (solved.labels[cacheKey] = labelsForDecision(
              solved.game, heroSeat, advice?.history ?? null
            ))
          );
        })(),
        heroShoveShare: shoveShare(solved.average, heroSeat),
        seatEv: solved.seatEv,
        stackBB: bucketed,
        players: seats.length,
        infoSets: solved.infoSets,
        iterations: solved.iterations,
        undertrained: solved.quality.undertrained,
        medianVisits: solved.quality.median,
        elapsedMs: solved.elapsedMs,
        cached: solved.cached,
        pushFold: solved.pushFold,
        model: solved.pushFold
          ? "push/fold, postflop checked down"
          : "sized raises, postflop checked down",
      },
    });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error.message });
  }
};
