/**
 * Multiway hold'em as an MCCFR game.
 *
 * The rules come from the betting engine in table.js rather than a second
 * implementation: blinds, position, minimum raises, all-in-for-less, and side
 * pots are already validated there against 3000 random hands with chips
 * conserved after every action. This module only supplies the three things
 * MCCFR needs on top of that - an abstraction of the cards, an abstraction of
 * the bet sizes, and a payoff.
 *
 * Scope: preflop. Once preflop betting closes the remaining streets are
 * checked down and the hand is decided at showdown, which is the standard
 * preflop model and exactly right for push/fold and open-shove work. It is a
 * real approximation for deep-stacked play, where postflop betting changes
 * preflop incentives, and `postflop: "checkdown"` in the result says so.
 *
 * Why preflop is the multiway case worth solving: it is the only street that
 * is reliably multiway, and the one where the heads-up vector solver in
 * solver.js cannot help at all.
 */

import {
  createHand,
  applyAction,
  legalActions,
  potSize,
  amountToCall,
  PREFLOP,
} from "./table.js";
import { cardsToHandCode } from "./range.js";
import { RANK_BY_CODE } from "./handStrength.js";

/**
 * Group the 169 starting hands into fewer strategic classes.
 *
 * Deep-stacked play with real raise sizes has far too many betting sequences
 * for every hand to get its own strategy, so hands are grouped. Uniform
 * grouping is wrong at the top - AA and 99 are five ranks apart and would land
 * together - so the strongest `exactTop` hands keep their own class and only
 * the tail is grouped.
 *
 * Returns a function from hand code to class label.
 */
export const makeHandBucketer = (buckets, exactTop = 20) => {
  if (!buckets) return (code) => code;
  const tailBuckets = Math.max(1, buckets - exactTop);
  const tailSize = Math.ceil((169 - exactTop) / tailBuckets);
  return (code) => {
    const rank = RANK_BY_CODE.get(code) ?? 168;
    if (rank < exactTop) return code;
    return `b${Math.floor((rank - exactTop) / tailSize)}`;
  };
};

/** Raise sizes as a fraction of the pot after calling. Kept short on purpose. */
export const DEFAULT_RAISE_FRACTIONS = [1.0];

const round2 = (n) => Math.round(n * 100) / 100;

const shuffledDeck = (rng) => {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  for (let i = 51; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
};

/**
 * Build the game.
 *
 * @param {object} opts
 * @param {Array<{seat: string, stack: number}>} opts.seats  in seat order
 * @param {number} [opts.buttonIndex]
 * @param {number} [opts.smallBlind]
 * @param {number} [opts.bigBlind]
 * @param {number[]} [opts.raiseFractions]
 * @param {number} [opts.maxRaises]  cap on preflop raises, to bound the tree
 * @param {boolean} [opts.allowAllIn]
 * @param {boolean} [opts.pushFold]  restrict to fold / call / all-in
 */
export const makeHoldemGame = ({
  seats,
  buttonIndex = 0,
  smallBlind = 0.5,
  bigBlind = 1,
  raiseFractions = DEFAULT_RAISE_FRACTIONS,
  maxRaises = 3,
  allowAllIn = true,
  pushFold = false,
  handBuckets = null,
}) => {
  const players = seats.map((s) => ({ seat: s.seat, stack: s.stack }));
  const bucketOf = makeHandBucketer(handBuckets);

  /**
   * Abstract the legal actions into a small, stable set.
   *
   * Stable labels matter as much as the sizes: an information set is keyed by
   * the action history, so "raise-1x" has to mean the same kind of decision
   * every time even though the chip amount behind it differs.
   */
  const abstractActions = (state) => {
    if (state.street > PREFLOP) {
      // Preflop model: nobody bets after the flop, so the hand checks down.
      // A single option is not a decision, and MCCFR skips it entirely.
      return [{ label: "check", concrete: { type: "check" } }];
    }

    const legal = legalActions(state);
    if (legal.length === 0) return [];
    const has = (t) => legal.find((a) => a.type === t);
    const sizing = has("raise") ?? has("bet");
    const out = [];

    /*
     * Push/fold: shove or fold, with calling allowed only against a shove.
     *
     * Strictness matters. An earlier version also offered "call" when first in,
     * which is a limp - and limping is not part of the push/fold game that
     * published Nash charts describe. With limps available the solver parked
     * medium hands in the limp, and heads-up shoving frequencies came out
     * 6-9 points below the charts at every stack depth.
     */
    if (pushFold) {
      const facingRaise = state.currentBet > bigBlind + 1e-9;
      if (has("fold")) out.push({ label: "fold", concrete: { type: "fold" } });
      if (facingRaise && has("call")) out.push({ label: "call", concrete: { type: "call" } });
      if (!facingRaise && sizing) {
        out.push({ label: "allin", concrete: { type: sizing.type, amount: sizing.max } });
      }
      // Nothing else to do (everyone folded round to the big blind).
      if (out.length === 0 && has("check")) out.push({ label: "check", concrete: { type: "check" } });
      return out;
    }

    if (has("fold")) out.push({ label: "fold", concrete: { type: "fold" } });
    if (has("check")) out.push({ label: "check", concrete: { type: "check" } });
    if (has("call")) out.push({ label: "call", concrete: { type: "call" } });

    if (sizing && state.raiseCount < maxRaises) {
      const pot = potSize(state);
      const toCall = amountToCall(state);
      const seen = new Set();
      for (const fraction of raiseFractions) {
        const target = round2(
          Math.min(sizing.max, Math.max(sizing.min, toCall + (pot + toCall) * fraction))
        );
        if (seen.has(target)) continue;
        seen.add(target);
        // A "raise" that has to shove anyway is the all-in branch, not a size.
        if (target >= sizing.max) continue;
        out.push({
          label: `raise-${fraction}x`,
          concrete: { type: sizing.type, amount: target },
        });
      }
      if (allowAllIn) {
        out.push({
          label: "allin",
          concrete: { type: sizing.type, amount: sizing.max },
        });
      }
    }

    return out;
  };

  return {
    numPlayers: players.length,
    seats: players.map((p) => p.seat),
    postflop: "checkdown",
    model: pushFold ? "push-fold" : "sized-raises",
    handBuckets,

    root(rng) {
      const hand = createHand({
        players,
        buttonIndex,
        deck: shuffledDeck(rng),
        smallBlind,
        bigBlind,
      });
      hand.history = [];
      hand.raiseCount = 0;
      return hand;
    },

    isTerminal: (s) => s.complete,

    /** Net chips won or lost, which is zero-sum across the table. */
    utility: (s, player) => round2(s.players[player].stack - s.players[player].startingStack),

    currentPlayer: (s) => s.toAct,

    /**
     * What the acting player can actually see: their seat, their two cards as
     * one of the 169 distinct starting hands, and the betting so far.
     *
     * The hand code is a lossless preflop abstraction - AhKh and AsKs really do
     * play identically before any board exists - so no strategic information is
     * thrown away here.
     */
    infoSet(s) {
      const player = s.players[s.toAct];
      const code = bucketOf(cardsToHandCode(player.hole[0], player.hole[1]));
      return `${player.seat}|${code}|${s.history.join(">") || "-"}`;
    },

    actions: (s) => abstractActions(s),

    next(s, action) {
      const next = applyAction(s, action.concrete);
      const actor = s.players[s.toAct].seat;
      next.history = [...s.history, `${actor}:${action.label}`];
      next.raiseCount =
        s.raiseCount + (action.label.startsWith("raise") || action.label === "allin" ? 1 : 0);
      return next;
    },
  };
};

/**
 * Per-seat expected value under the solved strategy, in big blinds per hand.
 *
 * This is the number the "multiway EV" question actually wants: what each
 * position wins or loses per hand when everybody plays the solved strategy.
 * It is sampled, so it carries a standard error.
 */
export const seatExpectedValues = (game, evaluations, bigBlind = 1) =>
  evaluations.map((e) => ({
    seat: game.seats[e.player],
    evChips: e.ev,
    evBB: e.ev / bigBlind,
    stdErr: e.stdErr / bigBlind,
    confidence95: e.confidence95 / bigBlind,
  }));

/**
 * Opening strategy for one seat: the action mix for each starting hand at the
 * point where that seat first acts with nobody having raised.
 */
export const openingStrategy = (average, seat) => {
  const rows = [];
  for (const [key, probs] of average) {
    const [keySeat, code, history] = key.split("|");
    if (keySeat !== seat) continue;
    // First decision: either nobody has acted, or only folds so far.
    if (history !== "-" && !history.split(">").every((h) => h.endsWith(":fold"))) continue;
    rows.push({ code, probs: Array.from(probs) });
  }
  return rows;
};
