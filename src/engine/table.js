/**
 * No-limit Hold'em betting engine.
 *
 * A pure state machine: no React, no DOM, no globals. `applyAction` returns a
 * new state, so hands can be replayed, tested headlessly, and diffed.
 *
 * The prototype's table had no betting model at all - every bot "called" a
 * single global slider value, nothing tracked what each player had put in, and
 * chips were neither conserved nor split into side pots. This implements the
 * actual rules:
 *
 *   - blinds, and correct first-to-act for heads-up vs multiway
 *   - a current bet each player must match, with a real minimum raise
 *   - all-in for less than a full raise does not reopen betting
 *   - side pots, so a short stack can only win what it covered
 *   - chips are conserved exactly at every step
 *
 * Card codes are integers throughout (see evaluator.js).
 */

import { evaluate } from "./evaluator.js";

export const PREFLOP = 0;
export const FLOP = 1;
export const TURN = 2;
export const RIVER = 3;
export const SHOWDOWN = 4;

export const STREET_NAMES = ["Preflop", "Flop", "Turn", "River", "Showdown"];

/** Cards revealed on entering each street. */
const CARDS_FOR_STREET = [0, 3, 1, 1];

const round2 = (n) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/**
 * Deal a new hand.
 *
 * @param {object} opts
 * @param {Array<{seat:string,name?:string,stack:number}>} opts.players seat order
 * @param {number} opts.buttonIndex index into players
 * @param {number[]} opts.deck shuffled integer card codes
 * @param {number} [opts.smallBlind]
 * @param {number} [opts.bigBlind]
 * @param {number} [opts.ante]
 */
export const createHand = ({
  players,
  buttonIndex = 0,
  deck,
  smallBlind = 0.5,
  bigBlind = 1,
  ante = 0,
}) => {
  if (players.length < 2) throw new Error("need at least two players");
  if (deck.length < players.length * 2 + 5) throw new Error("deck too small");

  let cursor = 0;
  const seated = players.map((p, index) => ({
    seat: p.seat,
    name: p.name ?? p.seat,
    index,
    startingStack: p.stack,
    stack: p.stack,
    hole: [],
    folded: false,
    allIn: false,
    committedStreet: 0,
    committedTotal: 0,
    hasActed: false,
    canRaise: true,
    lastAction: null,
  }));

  // Two cards each, dealt one at a time as at a real table. Cosmetic, but it
  // keeps the deck order meaningful if anyone replays a hand.
  for (let round = 0; round < 2; round += 1) {
    for (const player of seated) {
      player.hole.push(deck[cursor]);
      cursor += 1;
    }
  }

  let state = {
    players: seated,
    buttonIndex,
    board: [],
    deck,
    deckCursor: cursor,
    street: PREFLOP,
    currentBet: 0,
    minRaise: bigBlind,
    smallBlind,
    bigBlind,
    lastAggressor: null,
    toAct: null,
    complete: false,
    pots: [],
    winners: [],
    log: [],
    startingChips: seated.reduce((sum, p) => sum + p.stack, 0),
  };

  if (ante > 0) {
    for (const player of state.players) commit(state, player, ante, "ante");
  }

  const headsUp = players.length === 2;
  // Heads-up: the button posts the small blind. Otherwise blinds sit left of it.
  const sbIndex = headsUp ? buttonIndex : (buttonIndex + 1) % players.length;
  const bbIndex = headsUp
    ? (buttonIndex + 1) % players.length
    : (buttonIndex + 2) % players.length;

  commit(state, state.players[sbIndex], smallBlind, "small blind");
  commit(state, state.players[bbIndex], bigBlind, "big blind");
  state.currentBet = Math.max(
    state.players[sbIndex].committedStreet,
    state.players[bbIndex].committedStreet
  );
  state.minRaise = bigBlind;
  state.lastAggressor = bbIndex;

  // Preflop action starts left of the big blind; heads-up that is the button.
  state.toAct = headsUp
    ? buttonIndex
    : nextActiveFrom(state, (bbIndex + 1) % players.length);

  // Blinds are forced, not voluntary - they still owe an action.
  state.players.forEach((p) => { p.hasActed = false; });

  state = settleIfNoActionPossible(state);
  return state;
};

/** Move chips from a player's stack into the pot. Never exceeds the stack. */
const commit = (state, player, amount, label) => {
  const paid = Math.min(round2(amount), player.stack);
  player.stack = round2(player.stack - paid);
  player.committedStreet = round2(player.committedStreet + paid);
  player.committedTotal = round2(player.committedTotal + paid);
  if (player.stack <= 0) player.allIn = true;
  if (label) state.log.push({ street: state.street, seat: player.seat, action: label, amount: paid });
  return paid;
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Total chips in the middle, across all streets. */
export const potSize = (state) =>
  round2(state.players.reduce((sum, p) => sum + p.committedTotal, 0));

export const activePlayers = (state) => state.players.filter((p) => !p.folded);

/** Players who can still make a decision (not folded, not all-in). */
const actionablePlayers = (state) =>
  state.players.filter((p) => !p.folded && !p.allIn);

const nextActiveFrom = (state, start) => {
  const n = state.players.length;
  for (let i = 0; i < n; i += 1) {
    const idx = (start + i) % n;
    const p = state.players[idx];
    if (!p.folded && !p.allIn) return idx;
  }
  return null;
};

/**
 * Legal actions for whoever is to act, with amounts.
 *
 * `raise` amounts are "raise to" totals for the street, matching how players
 * think and how the tree in solver.js is built.
 */
export const legalActions = (state) => {
  if (state.complete || state.toAct == null) return [];
  const player = state.players[state.toAct];
  const toCall = round2(state.currentBet - player.committedStreet);
  const actions = [];

  if (toCall > 0) {
    actions.push({ type: "fold" });
    actions.push({ type: "call", amount: Math.min(toCall, player.stack) });
  } else {
    actions.push({ type: "check" });
  }

  const maxTo = round2(player.committedStreet + player.stack);

  if (toCall <= 0) {
    // Nothing to call. That is an opening bet postflop, but preflop the big
    // blind's option is a *raise* over its own posted blind - so the minimum
    // is currentBet + minRaise, not one big blind.
    if (maxTo > state.currentBet && player.canRaise) {
      const opening = state.currentBet <= 0;
      const min = Math.min(
        opening ? round2(state.bigBlind) : round2(state.currentBet + state.minRaise),
        maxTo
      );
      actions.push({ type: opening ? "bet" : "raise", min, max: maxTo });
    }
  } else if (maxTo > state.currentBet && player.canRaise) {
    // Raising: full raise is currentBet + minRaise, but a short stack may
    // shove for less (which does not reopen betting - see applyAction).
    const min = Math.min(round2(state.currentBet + state.minRaise), maxTo);
    actions.push({ type: "raise", min, max: maxTo });
  }

  return actions;
};

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

const clone = (state) => ({
  ...state,
  players: state.players.map((p) => ({ ...p, hole: [...p.hole] })),
  board: [...state.board],
  pots: state.pots.map((pot) => ({ ...pot, eligible: [...pot.eligible] })),
  winners: [...state.winners],
  log: [...state.log],
});

/**
 * Apply an action for the player to act.
 *
 * @param {object} state
 * @param {{type:string, amount?:number}} action
 *        `amount` is the raise-to / bet-to total for bet and raise.
 */
export const applyAction = (state, action) => {
  if (state.complete) throw new Error("hand is complete");
  if (state.toAct == null) throw new Error("nobody is to act");

  const next = clone(state);
  const player = next.players[next.toAct];
  const toCall = round2(next.currentBet - player.committedStreet);

  switch (action.type) {
    case "fold": {
      player.folded = true;
      player.hasActed = true;
      player.lastAction = { type: "fold" };
      next.log.push({ street: next.street, seat: player.seat, action: "fold", amount: 0 });
      break;
    }

    case "check": {
      if (toCall > 0) throw new Error(`cannot check facing ${toCall}`);
      player.hasActed = true;
      player.lastAction = { type: "check" };
      next.log.push({ street: next.street, seat: player.seat, action: "check", amount: 0 });
      break;
    }

    case "call": {
      if (toCall <= 0) throw new Error("nothing to call");
      commit(next, player, toCall, "call");
      player.hasActed = true;
      player.lastAction = { type: "call", amount: toCall };
      break;
    }

    case "bet":
    case "raise": {
      const target = round2(action.amount);
      const maxTo = round2(player.committedStreet + player.stack);
      if (target > maxTo + 1e-9) {
        throw new Error(`cannot ${action.type} to ${target}, max is ${maxTo}`);
      }
      if (target <= next.currentBet && target < maxTo - 1e-9) {
        throw new Error(`${action.type} to ${target} does not exceed ${next.currentBet}`);
      }
      if (!player.canRaise) {
        throw new Error("betting was not reopened - only call or fold");
      }
      // Below the minimum is legal only when shoving the whole stack.
      const minTarget = next.currentBet > 0
        ? round2(next.currentBet + next.minRaise)
        : round2(next.bigBlind);
      if (target < minTarget - 1e-9 && target < maxTo - 1e-9) {
        throw new Error(`${action.type} to ${target} is below the minimum of ${minTarget}`);
      }

      const increment = round2(target - next.currentBet);
      commit(next, player, round2(target - player.committedStreet), action.type);

      // A raise smaller than the minimum (only possible when shoving a short
      // stack) does not reopen the betting for players who already acted.
      const isFullRaise = increment >= next.minRaise - 1e-9;
      if (isFullRaise) {
        next.minRaise = increment;
        next.players.forEach((p) => {
          if (p.index !== player.index && !p.folded && !p.allIn) {
            p.hasActed = false;
            p.canRaise = true;
          }
        });
        next.lastAggressor = player.index;
      } else {
        // An all-in below a full raise still has to be called, but it does not
        // reopen betting: anyone who already acted may only call or fold.
        next.players.forEach((p) => {
          if (p.index !== player.index && !p.folded && !p.allIn && p.hasActed) {
            p.canRaise = false;
          }
        });
      }
      next.currentBet = Math.max(next.currentBet, player.committedStreet);
      player.hasActed = true;
      player.lastAction = { type: action.type, amount: target };
      break;
    }

    default:
      throw new Error(`unknown action: ${action.type}`);
  }

  return advance(next);
};

/** Has everyone still in the hand either matched the bet or run out of chips? */
const bettingRoundComplete = (state) => {
  const live = actionablePlayers(state);
  if (live.length === 0) return true;
  // One player left with chips and nothing to call - no one left to act against.
  if (live.length === 1 && live[0].committedStreet >= state.currentBet) {
    const others = state.players.filter((p) => !p.folded && p.index !== live[0].index);
    if (others.every((p) => p.allIn)) return true;
  }
  return live.every((p) => p.hasActed && p.committedStreet >= state.currentBet - 1e-9);
};

/** Fold everyone out? Then the last player standing takes it. */
const advance = (state) => {
  const remaining = activePlayers(state);
  if (remaining.length === 1) {
    return finish(state, [remaining[0].index], "uncontested");
  }

  if (!bettingRoundComplete(state)) {
    state.toAct = nextActiveFrom(state, (state.toAct + 1) % state.players.length);
    // Everyone else is all-in; nobody can act.
    if (state.toAct != null && state.players[state.toAct].hasActed &&
        state.players[state.toAct].committedStreet >= state.currentBet) {
      return closeStreet(state);
    }
    return state;
  }

  return closeStreet(state);
};

/** End the street: collect bets, deal the next board card(s), reset action. */
const closeStreet = (state) => {
  for (const player of state.players) {
    player.committedStreet = 0;
    player.hasActed = false;
    player.canRaise = true;
  }
  state.currentBet = 0;
  state.minRaise = state.bigBlind;
  state.lastAggressor = null;

  if (state.street >= RIVER) return showdown(state);

  const nextStreet = state.street + 1;
  const count = CARDS_FOR_STREET[nextStreet];
  for (let i = 0; i < count; i += 1) {
    state.board.push(state.deck[state.deckCursor]);
    state.deckCursor += 1;
  }
  state.street = nextStreet;

  // If at most one player can still act, run the board out to showdown.
  if (actionablePlayers(state).length <= 1) {
    const contested = activePlayers(state).length > 1;
    if (contested) return closeStreet(state);
  }

  state.toAct = nextActiveFrom(state, firstToActPostflop(state));
  return state;
};

const firstToActPostflop = (state) => {
  const headsUp = state.players.length === 2;
  // Heads-up the button acts last postflop, so action starts with the other seat.
  return headsUp
    ? (state.buttonIndex + 1) % state.players.length
    : (state.buttonIndex + 1) % state.players.length;
};

// ---------------------------------------------------------------------------
// Pots and showdown
// ---------------------------------------------------------------------------

/**
 * Split the pot into a main pot plus one side pot per distinct all-in level.
 * A player is eligible only for the pots they actually contributed to, which
 * is what stops a short stack from winning chips it never covered.
 */
export const buildPots = (state) => {
  const contributions = state.players.map((p) => ({
    index: p.index,
    amount: p.committedTotal,
    folded: p.folded,
  }));

  const levels = [...new Set(contributions.filter((c) => c.amount > 0).map((c) => c.amount))]
    .sort((a, b) => a - b);

  const pots = [];
  let previous = 0;
  for (const level of levels) {
    const slice = round2(level - previous);
    let amount = 0;
    const eligible = [];
    for (const c of contributions) {
      if (c.amount <= previous) continue;
      amount = round2(amount + Math.min(slice, round2(c.amount - previous)));
      // Folded players' chips stay in the pot but win nothing.
      if (!c.folded && c.amount >= level) eligible.push(c.index);
    }
    if (amount > 0) pots.push({ amount, eligible });
    previous = level;
  }

  // Merge adjacent pots with identical eligibility - purely cosmetic.
  const merged = [];
  for (const pot of pots) {
    const last = merged[merged.length - 1];
    if (last && last.eligible.length === pot.eligible.length &&
        last.eligible.every((v, i) => v === pot.eligible[i])) {
      last.amount = round2(last.amount + pot.amount);
    } else {
      merged.push(pot);
    }
  }
  return merged;
};

const handValue = (player, board) => {
  const cards = [...player.hole, ...board];
  return evaluate(cards, cards.length);
};

const showdown = (state) => {
  state.street = SHOWDOWN;

  // Any board cards still owed (everyone all-in earlier) get dealt now.
  while (state.board.length < 5) {
    state.board.push(state.deck[state.deckCursor]);
    state.deckCursor += 1;
  }

  const contenders = activePlayers(state);
  for (const player of contenders) {
    player.handScore = handValue(player, state.board);
  }

  return finish(state, null, "showdown");
};

/**
 * Award the pots and close the hand.
 * `forcedWinners` short-circuits evaluation when everyone else folded.
 */
const finish = (state, forcedWinners, reason) => {
  const pots = buildPots(state);
  state.pots = pots;

  const awards = new Map();
  const add = (index, amount) => {
    awards.set(index, round2((awards.get(index) ?? 0) + amount));
  };

  for (const pot of pots) {
    let winners;
    if (forcedWinners) {
      winners = forcedWinners.filter((i) => pot.eligible.includes(i));
      if (winners.length === 0) winners = pot.eligible;
    } else {
      let best = -Infinity;
      winners = [];
      for (const index of pot.eligible) {
        const score = state.players[index].handScore;
        if (score > best) { best = score; winners = [index]; }
        else if (score === best) winners.push(index);
      }
    }
    if (winners.length === 0) continue;

    // Split as evenly as the chip granularity allows, then hand any remainder
    // to the first eligible seat left of the button, as a casino would.
    const share = Math.floor((pot.amount / winners.length) * 100) / 100;
    let distributed = 0;
    winners.forEach((index) => { add(index, share); distributed = round2(distributed + share); });
    const remainder = round2(pot.amount - distributed);
    if (remainder > 0) add(winners[0], remainder);
  }

  for (const [index, amount] of awards) {
    state.players[index].stack = round2(state.players[index].stack + amount);
  }

  state.winners = [...awards.keys()];
  state.awards = awards;
  state.complete = true;
  state.settled = true;
  state.reason = reason;
  state.toAct = null;
  return state;
};

/** Nobody can act (everyone all-in preflop): run it out immediately. */
const settleIfNoActionPossible = (state) => {
  if (actionablePlayers(state).length === 0 && activePlayers(state).length > 1) {
    return closeStreet(state);
  }
  return state;
};

// ---------------------------------------------------------------------------
// Introspection helpers
// ---------------------------------------------------------------------------

/**
 * Chips in the system. Constant for the life of a hand.
 *
 * While the hand is live that is stacks plus everything committed to the
 * middle. Once pots are awarded the chips are back in stacks, so counting
 * committedTotal as well would double them.
 */
export const totalChips = (state) =>
  state.settled
    ? round2(state.players.reduce((sum, p) => sum + p.stack, 0))
    : round2(state.players.reduce((sum, p) => sum + p.stack + p.committedTotal, 0));

/** Amount the player to act must put in to continue. */
export const amountToCall = (state) => {
  if (state.toAct == null) return 0;
  const player = state.players[state.toAct];
  return round2(Math.max(0, state.currentBet - player.committedStreet));
};

/** Best five-card hand description for each player still in at showdown. */
export const showdownSummary = (state) =>
  activePlayers(state).map((p) => ({
    seat: p.seat,
    hole: p.hole,
    score: p.handScore,
    won: round2(state.awards?.get(p.index) ?? 0),
  }));
