/**
 * Multiway postflop as an MCCFR game.
 *
 * The vector solver in solver.js solves postflop exactly, but only heads-up:
 * it carries one reach vector per player and sweeps two ranges against each
 * other at showdown, which does not extend to three or more live ranges. This
 * fills that gap.
 *
 * Two things make multiway postflop tractable here where enumeration is not:
 *
 *   Runouts are sampled, not enumerated. External sampling draws one turn and
 *   river per traversal, so the cost does not multiply by 49x48 the way an
 *   exact flop tree does - that was what made flop enumeration need hundreds of
 *   megabytes.
 *
 *   Hands are bucketed by strength on the visible board, so a six-way pot does
 *   not need a strategy for every one of 1326 holdings per player per node.
 *
 * The bucketing is a real abstraction and it does lose information: two hands
 * in the same bucket are played identically. `bucketMode: "exact"` turns it
 * off, which is what the tests use to check this solver against the exact
 * heads-up one on the same spot.
 */

import { createPostflopHand, applyAction, legalActions, potSize, amountToCall } from "./table.js";
import { evaluate } from "./evaluator.js";

const round2 = (n) => Math.round(n * 100) / 100;

const SCRATCH = new Int32Array(7);

/**
 * Coarse hand bucket on the visible board.
 *
 * Category alone is too blunt - "one pair" covers top pair and bottom pair,
 * which play nothing alike - so the primary tiebreaker splits each category
 * into three tiers. That is 27 buckets, computed with two bit-shifts off a
 * score the evaluator already produced.
 */
export const coarseBucket = (hole, board) => {
  SCRATCH[0] = hole[0];
  SCRATCH[1] = hole[1];
  for (let i = 0; i < board.length; i += 1) SCRATCH[2 + i] = board[i];
  const score = evaluate(SCRATCH, 2 + board.length);
  const category = score >>> 20;
  const primary = (score >> 16) & 0xf;
  const tier = primary >= 10 ? 2 : primary >= 6 ? 1 : 0;
  return category * 3 + tier;
};

/** Unabstracted: the full hand score, so every distinct holding is its own set. */
export const exactBucket = (hole, board) => {
  SCRATCH[0] = hole[0];
  SCRATCH[1] = hole[1];
  for (let i = 0; i < board.length; i += 1) SCRATCH[2 + i] = board[i];
  return evaluate(SCRATCH, 2 + board.length);
};

/**
 * Build a multiway postflop subgame.
 *
 * @param {object} opts
 * @param {number[]} opts.board            3, 4, or 5 community cards
 * @param {Array<{seat:string, stack:number, range:Int32Array}>} opts.players
 *        listed in postflop action order: players[0] acts first
 * @param {number} opts.pot                chips already in the middle
 * @param {number[]} [opts.betSizes]       fractions of pot
 * @param {number} [opts.maxRaises]
 * @param {boolean} [opts.allowAllIn]
 * @param {"coarse"|"exact"} [opts.bucketMode]
 */
export const makePostflopGame = ({
  board,
  players,
  pot,
  betSizes = [0.75],
  maxRaises = 1,
  allowAllIn = false,
  bucketMode = "coarse",
  bigBlind = 1,
  // Players are given in action order, so the button sits at the end of the
  // list. Left at the engine's default of 0 the *second* player would act
  // first, which silently models a different game than solver.js does.
  buttonIndex = players.length - 1,
}) => {
  const bucketOf = bucketMode === "exact" ? exactBucket : coarseBucket;

  // Combos per player, as pairs, with anything the board blocks removed.
  const ranges = players.map((p) => {
    const combos = [];
    for (let i = 0; i < p.range.length / 2; i += 1) {
      const a = p.range[i * 2];
      const b = p.range[i * 2 + 1];
      if (board.includes(a) || board.includes(b)) continue;
      combos.push([a, b]);
    }
    if (combos.length === 0) throw new Error(`${p.seat} has no playable combos`);
    return combos;
  });

  const abstractActions = (state) => {
    const legal = legalActions(state);
    if (legal.length === 0) return [];
    const has = (t) => legal.find((a) => a.type === t);
    const out = [];

    if (has("fold")) out.push({ label: "fold", concrete: { type: "fold" } });
    if (has("check")) out.push({ label: "check", concrete: { type: "check" } });
    if (has("call")) out.push({ label: "call", concrete: { type: "call" } });

    const sizing = has("raise") ?? has("bet");
    if (sizing && state.raiseCount < maxRaises) {
      const potNow = potSize(state);
      const toCall = amountToCall(state);
      const seen = new Set();
      for (const fraction of betSizes) {
        const target = round2(
          Math.min(sizing.max, Math.max(sizing.min, toCall + (potNow + toCall) * fraction))
        );
        if (seen.has(target) || target >= sizing.max) continue;
        seen.add(target);
        out.push({ label: `bet-${fraction}x`, concrete: { type: sizing.type, amount: target } });
      }
      if (allowAllIn) {
        out.push({ label: "allin", concrete: { type: sizing.type, amount: sizing.max } });
      }
    }
    return out;
  };

  return {
    numPlayers: players.length,
    seats: players.map((p) => p.seat),
    bucketMode,

    /**
     * Sample one deal: a holding for each player from their range, then a
     * runout. Rejection sampling handles card conflicts between ranges; the
     * loop is bounded so an impossible set of ranges fails loudly rather than
     * hanging.
     */
    root(rng) {
      /*
       * Resample the whole assignment on a conflict, rather than fixing the
       * earlier players and re-drawing only the later ones. Drawing in order
       * makes the first player's marginal uniform and the rest conditional,
       * which is not the same distribution as uniform over valid deals - hands
       * that block a lot of the other ranges would be over-represented.
       */
      let used = null;
      let hole = null;
      for (let attempt = 0; attempt < 500 && !hole; attempt += 1) {
        const taken = new Set(board);
        const draw = [];
        let ok = true;
        for (let p = 0; p < ranges.length && ok; p += 1) {
          const [a, b] = ranges[p][Math.floor(rng() * ranges[p].length)];
          if (taken.has(a) || taken.has(b)) { ok = false; break; }
          taken.add(a);
          taken.add(b);
          draw.push([a, b]);
        }
        if (ok) {
          hole = draw;
          used = taken;
        }
      }
      if (!hole) throw new Error("ranges conflict: could not deal all players");

      const rest = [];
      for (let c = 0; c < 52; c += 1) if (!used.has(c)) rest.push(c);
      // Only the runout is needed, so shuffle just the top of the deck.
      for (let i = 0; i < 2 && i < rest.length; i += 1) {
        const j = i + Math.floor(rng() * (rest.length - i));
        [rest[i], rest[j]] = [rest[j], rest[i]];
      }

      const state = createPostflopHand({
        players: players.map((p, i) => ({ seat: p.seat, stack: p.stack, hole: hole[i] })),
        board,
        pot,
        deck: rest,
        bigBlind,
        buttonIndex,
      });
      state.history = [];
      state.raiseCount = 0;
      return state;
    },

    isTerminal: (s) => s.complete,
    utility: (s, player) =>
      round2(s.players[player].stack - s.players[player].startingStack),
    currentPlayer: (s) => s.toAct,

    /**
     * What the actor can see: their seat, the street, their hand's bucket on
     * the board *as currently revealed*, and the betting so far. Using the
     * visible board matters - bucketing on the final river board would leak
     * the runout backwards into flop decisions.
     */
    infoSet(s) {
      const player = s.players[s.toAct];
      // The engine only appends board cards when the street advances, so the
      // board is already exactly what this player can see. Bucketing on the
      // final river board instead would leak the runout back into flop play.
      const bucket = bucketOf(player.hole, s.board);
      return `${player.seat}|${s.street}|${bucket}|${s.history.join(">") || "-"}`;
    },

    actions: (s) => abstractActions(s),

    next(s, action) {
      const next = applyAction(s, action.concrete);
      const actor = s.players[s.toAct].seat;
      next.history = [...s.history, `${actor}:${action.label}`];
      // A new street reopens betting, so the raise cap resets with it.
      next.raiseCount =
        next.street !== s.street
          ? 0
          : s.raiseCount + (action.label.startsWith("bet") || action.label === "allin" ? 1 : 0);
      return next;
    },
  };
};
