/**
 * Opponent decision engine.
 *
 * The prototype's NPCs rolled `Math.random()` against a fixed fold/call/bet
 * profile and never looked at their cards. These bots instead compute their
 * actual equity, compare it to the pot odds they are being offered, and act on
 * the resulting EV - with a style profile controlling how loose, aggressive,
 * and bluff-happy they are, and a mixed strategy so they stay unexploitable
 * enough to be worth practising against.
 *
 * Preflop uses the precomputed strength table (a map lookup, no simulation).
 * Postflop runs a short Monte Carlo, which at a few thousand trials costs well
 * under a millisecond.
 */

import { calculateEquity } from "./equity.js";
import { cardsToHandCode } from "./range.js";
import { STRENGTH_BY_CODE, RANK_BY_CODE } from "./handStrength.js";

/**
 * Style profiles.
 *  vpip        - fraction of hands played preflop (drives the opening range)
 *  aggression  - how often a +EV spot becomes a raise rather than a call
 *  bluff       - how often a hopeless hand fires anyway
 *  callMargin  - equity edge required over raw pot odds before calling.
 *                Positive = tight//cautious, negative = calls too wide.
 */
export const STYLES = {
  nit: { label: "Nit", vpip: 0.12, aggression: 0.30, bluff: 0.02, callMargin: 0.06 },
  tag: { label: "TAG", vpip: 0.22, aggression: 0.58, bluff: 0.09, callMargin: 0.02 },
  lag: { label: "LAG", vpip: 0.34, aggression: 0.76, bluff: 0.20, callMargin: -0.02 },
  station: { label: "Station", vpip: 0.52, aggression: 0.15, bluff: 0.02, callMargin: -0.12 },
  maniac: { label: "Maniac", vpip: 0.62, aggression: 0.88, bluff: 0.32, callMargin: -0.06 },
};

export const DEFAULT_STYLE = "tag";

/** Postflop Monte Carlo budget. Small on purpose - bots decide in real time. */
const POSTFLOP_ITERATIONS = 3000;

/** xorshift32, so a table can be replayed deterministically from one seed. */
export const makeRng = (seed) => {
  let state = seed >>> 0 || 0x6d2b79f5;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    return state / 0x100000000;
  };
};

/**
 * Equity a bot assigns itself in the current spot.
 * Preflop this is a table lookup; postflop it is a short simulation.
 */
export const estimateEquity = ({ hole, board, opponents, iterations = POSTFLOP_ITERATIONS, seed }) => {
  // Heads-up preflop is a table lookup: exact enough and effectively free.
  if (board.length === 0 && opponents <= 1) {
    return STRENGTH_BY_CODE.get(cardsToHandCode(hole[0], hole[1])) ?? 0.4;
  }
  // Everything else simulates. forceMonteCarlo matters: left to its own
  // devices the engine would enumerate a flop exactly (~1.07M deals, ~60ms),
  // which is correct but far too slow to run for every bot on every street.
  return calculateEquity({
    hero: hole,
    board,
    opponents,
    maxIterations: iterations,
    targetStdErr: 0.004,
    forceMonteCarlo: true,
    seed,
  }).equity;
};

/**
 * Decide an action.
 *
 * @param {object}   spot
 * @param {number[]} spot.hole       bot's two hole cards (integer codes)
 * @param {number[]} [spot.board]    community cards
 * @param {number}   spot.pot        current pot size
 * @param {number}   spot.toCall     amount the bot must put in to continue (0 = can check)
 * @param {number}   spot.stack      bot's remaining stack
 * @param {number}   [spot.minRaise] minimum legal raise increment
 * @param {number}   [spot.opponents] live opponents still to act against
 * @param {string}   [spot.style]    key into STYLES
 * @param {number}   [spot.position] 0 = earliest, 1 = latest (button)
 * @param {Function} [spot.rng]      injectable RNG for reproducibility
 * @returns {{action:string, amount:number, equity:number, potOdds:number,
 *            callEV:number, reason:string}}
 */
export const decide = ({
  hole,
  board = [],
  pot,
  toCall,
  stack,
  minRaise = 1,
  opponents = 1,
  style = DEFAULT_STYLE,
  position = 0.5,
  rng = Math.random,
  seed,
}) => {
  const profile = STYLES[style] ?? STYLES[DEFAULT_STYLE];
  const callAmount = Math.min(toCall, stack);

  // --- Preflop: play a position-adjusted slice of the strength ordering ----
  if (board.length === 0) {
    const code = cardsToHandCode(hole[0], hole[1]);
    const rank = RANK_BY_CODE.get(code) ?? 168;
    // Late position widens the opening range by up to 60%.
    const widened = profile.vpip * (0.7 + 0.6 * position);
    const inRange = rank / 169 <= widened;
    const premium = rank / 169 <= widened * 0.35;

    if (callAmount <= 0) {
      // Free to act: open with the range, otherwise check.
      if (inRange && rng() < profile.aggression) {
        return raiseAction({ pot, stack, minRaise, rng, profile, premium,
          equity: STRENGTH_BY_CODE.get(code) ?? 0.4, potOdds: 0,
          reason: `opens ${code} from ${position > 0.6 ? "late" : "early"} position` });
      }
      return { action: "check", amount: 0, equity: STRENGTH_BY_CODE.get(code) ?? 0.4,
        potOdds: 0, callEV: 0, reason: `checks ${code}` };
    }

    if (!inRange) {
      if (rng() < profile.bluff * 0.4) {
        return { action: "call", amount: callAmount, equity: STRENGTH_BY_CODE.get(code) ?? 0.4,
          potOdds: callAmount / (pot + callAmount), callEV: 0,
          reason: `floats ${code} out of range` };
      }
      return { action: "fold", amount: 0, equity: STRENGTH_BY_CODE.get(code) ?? 0.4,
        potOdds: callAmount / (pot + callAmount), callEV: 0,
        reason: `folds ${code}, outside a ${Math.round(widened * 100)}% range` };
    }

    if (premium && rng() < profile.aggression) {
      return raiseAction({ pot, stack, minRaise, rng, profile, premium,
        equity: STRENGTH_BY_CODE.get(code) ?? 0.4,
        potOdds: callAmount / (pot + callAmount),
        reason: `3-bets ${code} for value` });
    }
    return { action: "call", amount: callAmount, equity: STRENGTH_BY_CODE.get(code) ?? 0.4,
      potOdds: callAmount / (pot + callAmount), callEV: 0, reason: `calls with ${code}` };
  }

  // --- Postflop: real equity vs real pot odds -----------------------------
  const equity = estimateEquity({ hole, board, opponents, seed });
  const potOdds = callAmount > 0 ? callAmount / (pot + callAmount) : 0;
  const callEV = equity * (pot + callAmount) - (1 - equity) * callAmount;

  if (callAmount <= 0) {
    // Nothing to call: value bet when ahead, bluff at the profile's frequency.
    const valueThreshold = 0.62 - profile.aggression * 0.12;
    if (equity >= valueThreshold && rng() < profile.aggression) {
      return raiseAction({ pot, stack, minRaise, rng, profile, premium: equity > 0.8,
        equity, potOdds, reason: `value bets with ${(equity * 100).toFixed(0)}% equity` });
    }
    if (equity < 0.3 && rng() < profile.bluff) {
      return raiseAction({ pot, stack, minRaise, rng, profile, premium: false,
        equity, potOdds, reason: `bluffs with ${(equity * 100).toFixed(0)}% equity` });
    }
    return { action: "check", amount: 0, equity, potOdds, callEV: 0,
      reason: `checks with ${(equity * 100).toFixed(0)}% equity` };
  }

  // Facing a bet. The required equity is the pot odds plus the style's margin.
  const required = potOdds + profile.callMargin;

  if (equity < required) {
    if (rng() < profile.bluff * 0.5) {
      return raiseAction({ pot, stack, minRaise, rng, profile, premium: false,
        equity, potOdds, reason: `bluff-raises with ${(equity * 100).toFixed(0)}% equity` });
    }
    return { action: "fold", amount: 0, equity, potOdds, callEV,
      reason: `folds: ${(equity * 100).toFixed(0)}% equity vs ${(potOdds * 100).toFixed(0)}% pot odds` };
  }

  // Comfortably ahead of the odds - raise for value some of the time.
  if (equity > required + 0.18 && rng() < profile.aggression) {
    return raiseAction({ pot, stack, minRaise, rng, profile, premium: equity > 0.8,
      equity, potOdds, reason: `raises for value with ${(equity * 100).toFixed(0)}% equity` });
  }

  return { action: "call", amount: callAmount, equity, potOdds, callEV,
    reason: `calls: ${(equity * 100).toFixed(0)}% equity beats ${(potOdds * 100).toFixed(0)}% pot odds` };
};

/** Pick a bet/raise size from a small set of pot fractions. */
const raiseAction = ({ pot, stack, minRaise, rng, profile, premium, equity, potOdds, reason }) => {
  const sizings = premium ? [0.66, 0.75, 1.0] : [0.33, 0.5, 0.66];
  const fraction = sizings[Math.floor(rng() * sizings.length)];
  const raw = Math.max(minRaise, pot * fraction);
  const amount = Math.min(stack, Math.round(raw * 100) / 100);
  return {
    action: amount >= stack ? "all-in" : "raise",
    amount,
    equity,
    potOdds,
    callEV: 0,
    reason,
    sizing: fraction,
  };
};
