/**
 * Card and deck helpers.
 *
 * Hand evaluation lives in src/engine/evaluator.js and is re-exported here so
 * existing callers keep working. The previous local implementation scored hands
 * with `tiebreakers.reduce((acc, v) => acc * 15 + v, rank)`, which multiplied by
 * 15 once per tiebreaker and so produced scores that were not comparable across
 * hand classes - ace-high outranked four of a kind. Every showdown resolved
 * incorrectly. See src/engine/evaluator.test.mjs for the validation.
 */

import {
  evaluateHand as engineEvaluateHand,
  formatCard as engineFormatCard,
  RANKS,
  SUITS,
} from "../engine/evaluator.js";

export { evaluateHand, cardToInt, intToCard } from "../engine/evaluator.js";

export const formatCard = engineFormatCard;

/** Full 52-card deck as two-character strings, e.g. "As". */
export const buildDeck = () =>
  SUITS.split("").flatMap((suit) => RANKS.split("").map((rank) => `${rank}${suit}`));

/**
 * Fisher-Yates shuffle, returning a new array.
 *
 * @param {string[]} deck
 * @param {() => number} [rng] injectable for reproducible deals
 */
export const shuffleDeck = (deck, rng = Math.random) => {
  const copy = [...deck];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

/** Take `count` cards off the top, returning the cards and the rest. */
export const dealCards = (deck, count) => ({
  dealt: deck.slice(0, count),
  remaining: deck.slice(count),
});

/** Re-exported so callers can score without importing the engine directly. */
export const scoreHand = (cards) => engineEvaluateHand(cards).score;
