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
import { solveMCCFR, averageStrategy, evaluateStrategy, trainingQuality } from "./mccfr.js";
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

/** Stacks are bucketed: 11.4bb and 11.6bb do not deserve separate solves. */
const bucketStack = (stack) => {
  if (stack <= 6) return Math.max(2, Math.round(stack));
  if (stack <= 20) return Math.round(stack / 2) * 2;
  return Math.round(stack / 5) * 5;
};

const solveFor = ({ seats, buttonIndex, stack, smallBlind, bigBlind, iterations, onProgress }) => {
  const key = `${seats.join(",")}|btn${buttonIndex}|${stack}|${smallBlind}/${bigBlind}|${iterations}`;
  const hit = cache.get(key);
  if (hit) return { ...hit, cached: true };

  const game = makeHoldemGame({
    seats: seats.map((seat) => ({ seat, stack })),
    buttonIndex,
    smallBlind,
    bigBlind,
    pushFold: true,
  });

  const result = solveMCCFR(game, { iterations, seed: 0x51e4d0, onProgress });
  const average = averageStrategy(result.store);
  const evaluations = evaluateStrategy(game, result.store, { samples: 40000, seed: 0x2b1d });

  const entry = {
    game,
    average,
    quality: trainingQuality(result.store),
    seatEv: seatExpectedValues(game, evaluations, bigBlind),
    iterations: result.iterations,
    infoSets: result.infoSets,
    elapsedMs: result.elapsedMs,
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
const heroAdvice = (average, seat, holeCards) => {
  if (!holeCards || holeCards.length !== 2) return null;
  const code = cardsToHandCode(holeCards[0], holeCards[1]);
  for (const [key, probs] of average) {
    const [keySeat, keyCode, history] = key.split("|");
    if (keySeat !== seat || keyCode !== code) continue;
    if (history !== "-" && !history.split(">").every((h) => h.endsWith(":fold"))) continue;
    const list = Array.from(probs);
    // Push/fold always orders the branches fold-first, shove-last.
    return {
      code,
      fold: list[0] ?? 0,
      shove: list[list.length - 1] ?? 0,
    };
  }
  return { code, fold: null, shove: null };
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
    if (effectiveBB > MAX_PUSHFOLD_BB) {
      self.postMessage({
        id,
        ok: true,
        result: {
          applicable: false,
          stackBB: Math.round(effectiveBB),
          maxBB: MAX_PUSHFOLD_BB,
          reason:
            `Push/fold does not describe ${Math.round(effectiveBB)}bb play. This model ` +
            `assumes the hand ends preflop and the board is checked down, which only ` +
            `holds up to about ${MAX_PUSHFOLD_BB}bb. Deal a shorter stack, or use the ` +
            `postflop solver once there is a board.`,
        },
      });
      return;
    }

    const bucketed = bucketStack(effectiveBB);
    // Six-max needs more passes than heads-up to train the same fraction of a
    // much larger tree, so the budget scales with the player count.
    const defaultIterations = Math.round(20000 * seats.length);

    const solved = solveFor({
      seats,
      buttonIndex,
      stack: bucketed,
      smallBlind: smallBlind / bigBlind,
      bigBlind: 1,
      iterations: iterations ?? defaultIterations,
      onProgress: (p) => self.postMessage({ id, progress: p }),
    });

    self.postMessage({
      id,
      ok: true,
      result: {
        hero: heroAdvice(solved.average, heroSeat, heroCards),
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
        model: "push-fold, postflop checked down",
      },
    });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error.message });
  }
};
