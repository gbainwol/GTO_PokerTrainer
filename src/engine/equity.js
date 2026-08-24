/**
 * Hold'em equity engine.
 *
 * Adaptive by design: when the number of distinct deals is small enough to
 * enumerate, it enumerates and returns an exact answer. Otherwise it runs a
 * seeded Monte Carlo simulation with a convergence cutoff and reports a
 * standard error, so callers can distinguish "exactly 46.2%" from
 * "46.2% +/- 0.3%".
 *
 * All cards are integer codes (see evaluator.js). Nothing here touches the DOM,
 * so it runs identically on the main thread or inside a worker.
 */

import { evaluate } from "./evaluator.js";

export const EXACT_DEAL_LIMIT = 2_600_000;
const DEFAULT_MAX_ITERATIONS = 200_000;
const DEFAULT_TARGET_STDERR = 0.0008; // ~0.08 equity points
const BATCH = 4096;

const combinations = (n, k) => {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 0; i < k; i += 1) result = (result * (n - i)) / (i + 1);
  return Math.round(result);
};

/** Number of distinct deals a full enumeration would have to visit. */
export const countDeals = ({ availableCount, boardNeed, opponents, rangeSizes }) => {
  let deals = combinations(availableCount, boardNeed);
  let remaining = availableCount - boardNeed;
  for (let i = 0; i < opponents; i += 1) {
    // A range restricts the opponent to its combos; an unknown opponent can
    // hold any two remaining cards.
    const size = rangeSizes?.[i];
    deals *= size != null ? size : combinations(remaining, 2);
    remaining -= 2;
    if (!Number.isFinite(deals) || deals > Number.MAX_SAFE_INTEGER) return Infinity;
  }
  return deals;
};

/** xorshift32 - small, fast, and seedable so runs are reproducible. */
const makeRng = (seed) => {
  let state = seed >>> 0 || 0x9e3779b9;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    return state / 0x100000000;
  };
};

/**
 * Score one complete deal and return hero's share: 1 for an outright win,
 * 1/n for an n-way tie at the top, 0 for a loss.
 */
const heroShare = (heroBuf, oppBuf, opponents, oppHoles) => {
  const heroScore = evaluate(heroBuf, 7);
  let tied = 1;
  for (let o = 0; o < opponents; o += 1) {
    oppBuf[0] = oppHoles[o * 2];
    oppBuf[1] = oppHoles[o * 2 + 1];
    const score = evaluate(oppBuf, 7);
    if (score > heroScore) return 0;
    if (score === heroScore) tied += 1;
  }
  return 1 / tied;
};

/**
 * Exhaustive enumeration over every board completion and opponent holding.
 * Only called when countDeals says the space is small enough.
 */
const exactEquity = ({ hero, board, opponents, ranges, available }) => {
  const boardNeed = 5 - board.length;

  const heroBuf = new Int32Array(7);
  const oppBuf = new Int32Array(7);
  heroBuf[0] = hero[0];
  heroBuf[1] = hero[1];

  const boardBuf = new Int32Array(5);
  for (let i = 0; i < board.length; i += 1) boardBuf[i] = board[i];

  const used = new Uint8Array(52);
  hero.forEach((c) => { used[c] = 1; });
  board.forEach((c) => { used[c] = 1; });

  const oppHoles = new Int32Array(opponents * 2);

  let totalShare = 0;
  let wins = 0;
  let ties = 0;
  let deals = 0;

  const scoreDeal = () => {
    for (let i = 0; i < 5; i += 1) {
      heroBuf[2 + i] = boardBuf[i];
      oppBuf[2 + i] = boardBuf[i];
    }
    const share = heroShare(heroBuf, oppBuf, opponents, oppHoles);
    totalShare += share;
    if (share === 1) wins += 1;
    else if (share > 0) ties += 1;
    deals += 1;
  };

  // Opponents are filled after the board is complete.
  const fillOpponent = (index) => {
    if (index === opponents) {
      scoreDeal();
      return;
    }
    const range = ranges?.[index];
    if (range) {
      for (let i = 0; i < range.length; i += 2) {
        const a = range[i];
        const b = range[i + 1];
        if (used[a] || used[b]) continue;
        used[a] = 1; used[b] = 1;
        oppHoles[index * 2] = a;
        oppHoles[index * 2 + 1] = b;
        fillOpponent(index + 1);
        used[a] = 0; used[b] = 0;
      }
      return;
    }
    for (let a = 0; a < 52; a += 1) {
      if (used[a]) continue;
      used[a] = 1;
      for (let b = a + 1; b < 52; b += 1) {
        if (used[b]) continue;
        used[b] = 1;
        oppHoles[index * 2] = a;
        oppHoles[index * 2 + 1] = b;
        fillOpponent(index + 1);
        used[b] = 0;
      }
      used[a] = 0;
    }
  };

  const fillBoard = (slot, start) => {
    if (slot === boardNeed) {
      fillOpponent(0);
      return;
    }
    for (let i = start; i < available.length; i += 1) {
      const card = available[i];
      if (used[card]) continue;
      used[card] = 1;
      boardBuf[board.length + slot] = card;
      fillBoard(slot + 1, i + 1);
      used[card] = 0;
    }
  };

  fillBoard(0, 0);

  return {
    method: "exact",
    equity: deals ? totalShare / deals : 0,
    win: deals ? wins / deals : 0,
    tie: deals ? ties / deals : 0,
    lose: deals ? (deals - wins - ties) / deals : 0,
    deals,
    stdErr: 0,
  };
};

/**
 * Seeded Monte Carlo with a convergence cutoff. Runs in batches and stops once
 * the standard error of the equity estimate drops below `targetStdErr`.
 */
const monteCarloEquity = ({
  hero,
  board,
  opponents,
  ranges,
  available,
  maxIterations,
  targetStdErr,
  seed,
}) => {
  const rng = makeRng(seed);
  const boardNeed = 5 - board.length;

  const heroBuf = new Int32Array(7);
  const oppBuf = new Int32Array(7);
  heroBuf[0] = hero[0];
  heroBuf[1] = hero[1];

  const boardBuf = new Int32Array(5);
  for (let i = 0; i < board.length; i += 1) boardBuf[i] = board[i];

  const oppHoles = new Int32Array(opponents * 2);
  const deck = Int32Array.from(available);
  const used = new Uint8Array(52);
  const picks = new Int32Array(boardNeed + 2 * opponents);

  let sum = 0;
  let sumSq = 0;
  let wins = 0;
  let ties = 0;
  let n = 0;
  let stdErr = Infinity;

  while (n < maxIterations) {
    for (let b = 0; b < BATCH && n < maxIterations; b += 1) {
      used.fill(0);
      let deckLen = deck.length;
      let ok = true;

      // Deal ranged opponents first via rejection sampling; a range can clash
      // with the known board, so give up on a trial rather than loop forever.
      for (let o = 0; o < opponents && ok; o += 1) {
        const range = ranges?.[o];
        if (!range) continue;
        let placed = false;
        for (let attempt = 0; attempt < 64; attempt += 1) {
          const pick = (Math.floor(rng() * (range.length / 2)) | 0) * 2;
          const a = range[pick];
          const c = range[pick + 1];
          if (used[a] || used[c]) continue;
          used[a] = 1; used[c] = 1;
          oppHoles[o * 2] = a;
          oppHoles[o * 2 + 1] = c;
          placed = true;
          break;
        }
        if (!placed) ok = false;
      }
      if (!ok) continue;

      // Partial Fisher-Yates over the remaining deck: draw only what we need.
      let drawn = 0;
      const need = picks.length;
      while (drawn < need && deckLen > 0) {
        const idx = (rng() * deckLen) | 0;
        const card = deck[idx];
        // Swap the drawn card past the live window either way, so a card
        // already claimed by a range is never offered again this trial.
        deckLen -= 1;
        deck[idx] = deck[deckLen];
        deck[deckLen] = card;
        if (used[card]) continue;
        used[card] = 1;
        picks[drawn] = card;
        drawn += 1;
      }
      if (drawn < need) continue;

      let p = 0;
      for (let i = 0; i < boardNeed; i += 1) boardBuf[board.length + i] = picks[p++];
      for (let o = 0; o < opponents; o += 1) {
        if (ranges?.[o]) continue;
        oppHoles[o * 2] = picks[p++];
        oppHoles[o * 2 + 1] = picks[p++];
      }

      for (let i = 0; i < 5; i += 1) {
        heroBuf[2 + i] = boardBuf[i];
        oppBuf[2 + i] = boardBuf[i];
      }

      const share = heroShare(heroBuf, oppBuf, opponents, oppHoles);
      sum += share;
      sumSq += share * share;
      if (share === 1) wins += 1;
      else if (share > 0) ties += 1;
      n += 1;
    }

    if (n > 0) {
      const mean = sum / n;
      const variance = Math.max(0, sumSq / n - mean * mean);
      stdErr = Math.sqrt(variance / n);
      if (stdErr <= targetStdErr) break;
    }
  }

  const equity = n ? sum / n : 0;
  return {
    method: "monte-carlo",
    equity,
    win: n ? wins / n : 0,
    tie: n ? ties / n : 0,
    lose: n ? (n - wins - ties) / n : 0,
    deals: n,
    stdErr,
    // 95% confidence half-width.
    confidence95: 1.96 * stdErr,
  };
};

/**
 * Calculate hero's equity.
 *
 * @param {object}   opts
 * @param {number[]} opts.hero        Hero's two hole cards (integer codes).
 * @param {number[]} [opts.board]     0, 3, 4, or 5 board cards.
 * @param {number}   [opts.opponents] Number of opponents (default 1).
 * @param {Int32Array[]} [opts.ranges] Per-opponent flat [a,b,a,b,...] combo
 *                                     lists; null/undefined means any hand.
 * @param {boolean}  [opts.forceMonteCarlo]
 * @returns {{equity:number, win:number, tie:number, lose:number,
 *            method:string, deals:number, stdErr:number}}
 */
export const calculateEquity = ({
  hero,
  board = [],
  opponents = 1,
  ranges = null,
  maxIterations = DEFAULT_MAX_ITERATIONS,
  targetStdErr = DEFAULT_TARGET_STDERR,
  exactLimit = EXACT_DEAL_LIMIT,
  forceMonteCarlo = false,
  seed = 0x1a2b3c4d,
}) => {
  if (!hero || hero.length !== 2) throw new Error("hero must be exactly 2 cards");
  if (![0, 3, 4, 5].includes(board.length)) {
    throw new Error(`board must have 0, 3, 4, or 5 cards (got ${board.length})`);
  }
  if (opponents < 1) throw new Error("need at least one opponent");

  const seen = new Set([...hero, ...board]);
  if (seen.size !== hero.length + board.length) {
    throw new Error("duplicate cards between hero and board");
  }

  const available = [];
  for (let c = 0; c < 52; c += 1) if (!seen.has(c)) available.push(c);

  const boardNeed = 5 - board.length;
  const rangeSizes = ranges?.map((r) => (r ? r.length / 2 : null)) ?? null;
  const deals = countDeals({
    availableCount: available.length,
    boardNeed,
    opponents,
    rangeSizes,
  });

  const args = { hero, board, opponents, ranges, available };
  if (!forceMonteCarlo && deals <= exactLimit) return exactEquity(args);
  return monteCarloEquity({ ...args, maxIterations, targetStdErr, seed });
};
