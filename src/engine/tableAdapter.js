/**
 * Bridge between the betting engine and the React table.
 *
 * The engine (table.js) is the source of truth for chips, positions, and legal
 * actions. This module keeps that authority intact while presenting the shape
 * the existing UI already renders, so the view layer does not need to know
 * about side pots or minimum raises.
 */

import {
  createHand,
  applyAction,
  legalActions,
  potSize,
  amountToCall,
  STREET_NAMES,
} from "./table.js";
import { intToCard, handName, cardToInt } from "./evaluator.js";
import { decide } from "./opponent.js";

export { STREET_NAMES };

/** Build a shuffled deck of integer card codes. */
export const shuffledDeck = (rng = Math.random) => {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  for (let i = 51; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
};

/**
 * Project engine state into the view model the table components render.
 * Hole cards are exposed for everyone; the view decides what to show.
 */
export const toView = (hand, { id, heroSeat, villainSeat }) => {
  const revealAll = hand.complete && hand.reason === "showdown";
  const winnerSeats = hand.winners.map((i) => hand.players[i].seat);

  let winningHand = "";
  if (hand.complete) {
    if (!revealAll) winningHand = "Uncontested";
    else {
      const best = hand.winners
        .map((i) => hand.players[i])
        .find((p) => p.handScore != null);
      winningHand = best ? handName(best.handScore) : "";
    }
  }

  return {
    id,
    engine: hand,
    heroSeat,
    villainSeat,
    handPlayers: hand.players.map((p) => ({
      seat: p.seat,
      name: p.name,
      stack: p.stack,
      cards: p.hole.map(intToCard),
      inHand: !p.folded,
      allIn: p.allIn,
      isHero: p.seat === heroSeat,
      isVillain: p.seat === villainSeat,
      committed: p.committedStreet,
      lastAction: p.lastAction,
      isToAct: hand.toAct != null && hand.players[hand.toAct].seat === p.seat,
      won: hand.awards?.get(p.index) ?? 0,
    })),
    boardCards: hand.board.map(intToCard),
    burnPile: [],
    pot: potSize(hand),
    streetIndex: hand.street,
    showdown: hand.complete,
    revealAll,
    handWinners: winnerSeats,
    winningHand,
    toActSeat: hand.toAct != null ? hand.players[hand.toAct].seat : null,
    toCall: amountToCall(hand),
    legal: legalActions(hand),
    pots: hand.pots,
  };
};

/** Start a fresh hand and return its view. */
export const startHand = ({
  id,
  seats,
  stacks,
  buttonSeat,
  heroSeat,
  villainSeat,
  smallBlind = 0.5,
  bigBlind = 1,
  style,
  rng = Math.random,
}) => {
  const players = seats.map((seat) => ({
    seat,
    name: typeof stacks[seat] === "object" ? stacks[seat].name : seat,
    stack: typeof stacks[seat] === "object" ? stacks[seat].stack : stacks[seat],
  }));
  const buttonIndex = Math.max(0, seats.indexOf(buttonSeat));
  let hand = createHand({
    players,
    buttonIndex,
    deck: shuffledDeck(rng),
    smallBlind,
    bigBlind,
  });
  // Seats acting before the hero act immediately, so the hero opens on turn.
  hand = runBots(hand, { heroSeat, style, rng });
  return toView(hand, { id, heroSeat, villainSeat });
};

/**
 * Translate a bot's decision into a legal engine action.
 *
 * The opponent model reasons about "fold / check / call / raise"; the engine
 * enforces what is actually available and how much a raise must be. Where they
 * disagree the engine wins - a bot that wants to raise when it cannot will
 * call instead.
 */
const toEngineAction = (decision, legal) => {
  const has = (type) => legal.find((a) => a.type === type);
  const raise = has("raise") ?? has("bet");

  switch (decision.action) {
    case "fold":
      // Never fold when checking is free.
      return has("check") ? { type: "check" } : { type: "fold" };
    case "check":
      return has("check") ? { type: "check" } : has("call") ? { type: "call" } : { type: "fold" };
    case "call":
      return has("call") ? { type: "call" } : { type: "check" };
    case "raise":
    case "all-in": {
      if (!raise) return has("call") ? { type: "call" } : { type: "check" };
      // decision.amount is an increment over the pot; clamp into legal range.
      const want = decision.action === "all-in" ? raise.max : decision.amount;
      const amount = Math.min(raise.max, Math.max(raise.min, want));
      return { type: raise.type, amount: Math.round(amount * 100) / 100 };
    }
    default:
      return has("check") ? { type: "check" } : { type: "fold" };
  }
};

/**
 * Run bots until it is the hero's turn again (or the hand ends).
 * Returns the new engine state.
 */
export const runBots = (hand, { heroSeat, style, rng = Math.random }) => {
  let s = hand;
  let guard = 0;
  while (
    !s.complete &&
    s.toAct != null &&
    s.players[s.toAct].seat !== heroSeat &&
    guard < 250
  ) {
    guard += 1;
    const player = s.players[s.toAct];
    const legal = legalActions(s);
    if (legal.length === 0) break;

    const opponents = s.players.filter((p) => !p.folded && p.index !== player.index).length;
    const decision = decide({
      hole: player.hole,
      board: s.board,
      pot: potSize(s),
      toCall: amountToCall(s),
      stack: player.stack,
      minRaise: s.minRaise,
      opponents: Math.max(1, opponents),
      style,
      // Acting later in the order is a proxy for position.
      position: s.players.length > 1 ? player.index / (s.players.length - 1) : 0.5,
      rng,
    });

    try {
      s = applyAction(s, toEngineAction(decision, legal));
    } catch {
      // Should not happen, but never wedge the table on a rejected action.
      s = applyAction(s, legal.find((a) => a.type === "check") ? { type: "check" } : { type: "fold" });
    }
  }
  return s;
};

/**
 * Apply the hero's action, then let the bots respond.
 *
 * @param {object} view    current view (carries the engine state)
 * @param {string} move    "Fold" | "Check" | "Call" | "Bet" | "Raise"
 * @param {number} sizeTo  bet/raise target for this street
 */
export const heroAction = (view, move, sizeTo, { heroSeat, style, rng = Math.random }) => {
  const hand = view.engine;
  if (hand.complete) return view;
  if (hand.toAct == null || hand.players[hand.toAct].seat !== heroSeat) return view;

  const legal = legalActions(hand);
  const has = (type) => legal.find((a) => a.type === type);

  let action;
  switch (move) {
    case "Fold":
      action = has("fold") ? { type: "fold" } : { type: "check" };
      break;
    case "Check":
      action = has("check") ? { type: "check" } : has("call") ? { type: "call" } : { type: "fold" };
      break;
    case "Call":
      action = has("call") ? { type: "call" } : { type: "check" };
      break;
    case "Bet":
    case "Raise": {
      const sizing = has("raise") ?? has("bet");
      if (!sizing) {
        action = has("call") ? { type: "call" } : { type: "check" };
      } else {
        const amount = Math.min(sizing.max, Math.max(sizing.min, Number(sizeTo) || sizing.min));
        action = { type: sizing.type, amount: Math.round(amount * 100) / 100 };
      }
      break;
    }
    default:
      action = has("check") ? { type: "check" } : { type: "fold" };
  }

  let next = applyAction(hand, action);
  next = runBots(next, { heroSeat, style, rng });
  return toView(next, { id: view.id, heroSeat, villainSeat: view.villainSeat });
};

/** Hero cards as integer codes, or null. */
export const heroHoleInts = (view) => {
  const hero = view.handPlayers.find((p) => p.isHero);
  if (!hero || hero.cards.length < 2) return null;
  return hero.cards.map(cardToInt);
};
