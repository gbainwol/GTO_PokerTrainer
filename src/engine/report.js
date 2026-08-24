/**
 * Analysis surfaces: range grids, aggregate frequencies, and leak reports.
 *
 * Pure functions over solver output and recorded decisions - no DOM, no React,
 * no fetching - so every number here is testable without a browser.
 *
 * The organising idea is that a strategy is only useful if you can see it and
 * be scored against it. The 13x13 grid is how a strategy is read; the EV-loss
 * report is how a session is scored.
 */

import { handCodeToCombos, makeHandCode, cardsToHandCode } from "./range.js";
import { RANK_BY_CODE } from "./handStrength.js";

/** Ranks in grid order, strongest first. */
export const GRID_RANKS = "AKQJT98765432".split("");

/**
 * The canonical 13x13 starting-hand layout: pairs down the diagonal, suited
 * above it, offsuit below. Every poker range chart uses this arrangement, so
 * the grid is recognisable at a glance.
 */
export const HAND_GRID = GRID_RANKS.map((rowRank, row) =>
  GRID_RANKS.map((colRank, col) => {
    if (row === col) return `${rowRank}${rowRank}`;
    return row < col ? `${rowRank}${colRank}s` : `${colRank}${rowRank}o`;
  })
);

/** Combos per hand code: 6 for a pair, 4 suited, 12 offsuit. */
export const comboCount = (code) => handCodeToCombos(code).length;

/**
 * Turn per-hand strategy rows into a grid ready to render.
 *
 * @param {Array<{code: string, probs: number[]}>} rows
 * @param {string[]} actionLabels
 * @returns {{grid: object[][], actions: string[], covered: number, total: number}}
 */
export const buildRangeGrid = (rows, actionLabels = []) => {
  const byCode = new Map(rows.map((r) => [r.code, r.probs]));
  let covered = 0;

  const grid = HAND_GRID.map((gridRow) =>
    gridRow.map((code) => {
      const probs = byCode.get(code);
      const combos = comboCount(code);
      if (probs) covered += combos;
      return {
        code,
        combos,
        probs: probs ? Array.from(probs) : null,
        /** Everything except the fold branch, which is what "playing" means. */
        played: probs ? 1 - (probs[0] ?? 0) : null,
        strengthRank: RANK_BY_CODE.get(code) ?? null,
      };
    })
  );

  return { grid, actions: actionLabels, covered, total: 1326 };
};

/**
 * Overall action frequencies across a range, weighted by combo count.
 *
 * Hand-count averages are misleading here: there are 6 ways to hold aces and
 * 12 to hold ace-king offsuit, so treating each of the 169 codes equally
 * overstates the pairs by a factor of two.
 */
export const aggregateMix = (rows, actionLabels = []) => {
  let mass = 0;
  const totals = [];
  for (const row of rows) {
    const combos = comboCount(row.code);
    mass += combos;
    row.probs.forEach((p, i) => {
      totals[i] = (totals[i] ?? 0) + combos * p;
    });
  }
  return totals.map((total, i) => ({
    action: actionLabels[i] ?? `Action ${i + 1}`,
    frequency: mass > 0 ? total / mass : 0,
    combos: total,
  }));
};

/** Share of the supplied range's combos that take any action other than folding. */
export const vpipOf = (rows) => {
  let played = 0;
  let total = 0;
  for (const row of rows) {
    const combos = comboCount(row.code);
    total += combos;
    played += combos * (1 - (row.probs[0] ?? 0));
  }
  return total > 0 ? played / total : 0;
};

// ---------------------------------------------------------------------------
// Decision scoring
// ---------------------------------------------------------------------------

/**
 * Score one decision against the solved strategy.
 *
 * EV loss is measured against the *best* available action, not against the
 * solver's most frequent one. A mixed strategy means several actions are close
 * to equal value, so taking the less-frequent side of a genuine mix should
 * cost almost nothing - and this reports almost nothing. Scoring against
 * frequency instead would punish correct mixing.
 *
 * @param {object} decision
 * @param {string} decision.action        what the player did
 * @param {Array<{action: string, ev: number, frequency: number}>} decision.options
 * @returns {{evLoss: number, best: string, chosenEv: number, bestEv: number,
 *            frequency: number, blunder: boolean}|null}
 */
export const scoreDecision = ({ action, options }) => {
  if (!options || options.length === 0) return null;
  const chosen = options.find((o) => o.action === action);
  if (!chosen) return null;

  const best = options.reduce((a, b) => (b.ev > a.ev ? b : a));
  const evLoss = Math.max(0, best.ev - chosen.ev);

  return {
    evLoss,
    best: best.action,
    chosenEv: chosen.ev,
    bestEv: best.ev,
    frequency: chosen.frequency ?? 0,
    /** A large loss on an action the solver essentially never takes. */
    blunder: evLoss > 0.5 && (chosen.frequency ?? 0) < 0.05,
  };
};

/** Group a set of scored decisions and summarise them. */
const summarise = (entries) => {
  const count = entries.length;
  if (count === 0) {
    return { count: 0, evLoss: 0, evLossPerHand: 0, accuracy: 0, blunders: 0 };
  }
  const evLoss = entries.reduce((sum, e) => sum + e.evLoss, 0);
  const matched = entries.filter((e) => e.evLoss <= 0.01).length;
  return {
    count,
    evLoss,
    evLossPerHand: evLoss / count,
    accuracy: matched / count,
    blunders: entries.filter((e) => e.blunder).length,
  };
};

/**
 * Full session report: overall accuracy, EV lost, and where it went.
 *
 * Breakdowns are by street, by position, and by the action taken, because
 * "you are losing 2bb/100" is not actionable but "you are losing it calling
 * turns from the big blind" is.
 *
 * @param {Array<{action, options, street?, position?, handCode?, id?}>} decisions
 */
export const buildSessionReport = (decisions) => {
  const scored = [];
  for (const decision of decisions) {
    const score = scoreDecision(decision);
    if (!score) continue;
    scored.push({ ...decision, ...score });
  }

  const groupBy = (key) => {
    const groups = new Map();
    for (const entry of scored) {
      const value = entry[key] ?? "unknown";
      if (!groups.has(value)) groups.set(value, []);
      groups.get(value).push(entry);
    }
    return [...groups.entries()]
      .map(([value, entries]) => ({ value, ...summarise(entries) }))
      .sort((a, b) => b.evLoss - a.evLoss);
  };

  return {
    overall: summarise(scored),
    byStreet: groupBy("street"),
    byPosition: groupBy("position"),
    byAction: groupBy("action"),
    /** Worst individual decisions, which is what a player wants to review. */
    worst: [...scored].sort((a, b) => b.evLoss - a.evLoss).slice(0, 10),
    decisions: scored,
  };
};

/**
 * Leak report: the biggest recurring sources of EV loss.
 *
 * Ranked by total EV given up rather than by rate, because a small error made
 * constantly costs more than a large one made once - and it is the one worth
 * fixing first.
 */
export const buildLeakReport = (decisions, { minSamples = 3 } = {}) => {
  const report = buildSessionReport(decisions);
  const buckets = new Map();

  for (const entry of report.decisions) {
    const key = `${entry.street ?? "?"} · ${entry.position ?? "?"} · ${entry.action}`;
    if (!buckets.has(key)) {
      buckets.set(key, { key, street: entry.street, position: entry.position, action: entry.action, entries: [] });
    }
    buckets.get(key).entries.push(entry);
  }

  return [...buckets.values()]
    .filter((b) => b.entries.length >= minSamples)
    .map((b) => ({
      ...b,
      ...summarise(b.entries),
      suggestion: describeLeak(b),
    }))
    .sort((a, b) => b.evLoss - a.evLoss);
};

/** Plain-language description of what a leak bucket is doing wrong. */
const describeLeak = (bucket) => {
  const alternatives = new Map();
  for (const entry of bucket.entries) {
    if (entry.evLoss <= 0.01) continue;
    alternatives.set(entry.best, (alternatives.get(entry.best) ?? 0) + 1);
  }
  if (alternatives.size === 0) return "Playing this spot well.";
  const [best] = [...alternatives.entries()].sort((a, b) => b[1] - a[1]);
  return `Prefer ${best[0]} here (${best[1]} of ${bucket.entries.length} spots).`;
};

// ---------------------------------------------------------------------------
// Range comparison
// ---------------------------------------------------------------------------

/**
 * Compare a player's realised range against the solved one.
 *
 * Positive delta means the hand is played more often than the solver plays it,
 * which is how "too loose from under the gun" shows up as a specific list of
 * hands rather than a vague feeling.
 */
export const compareRanges = (played, solved) => {
  const solvedBy = new Map(solved.map((r) => [r.code, 1 - (r.probs[0] ?? 0)]));
  const playedBy = new Map(played.map((r) => [r.code, 1 - (r.probs[0] ?? 0)]));

  const rows = [];
  for (const code of new Set([...solvedBy.keys(), ...playedBy.keys()])) {
    const theirs = solvedBy.get(code) ?? 0;
    const yours = playedBy.get(code) ?? 0;
    rows.push({
      code,
      solved: theirs,
      played: yours,
      delta: yours - theirs,
      combos: comboCount(code),
    });
  }

  const weighted = (pick) => {
    let sum = 0;
    let mass = 0;
    for (const row of rows) {
      mass += row.combos;
      sum += row.combos * pick(row);
    }
    return mass > 0 ? sum / mass : 0;
  };

  return {
    rows: rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
    playedVpip: weighted((r) => r.played),
    solvedVpip: weighted((r) => r.solved),
    tooLoose: rows.filter((r) => r.delta > 0.25).sort((a, b) => b.delta - a.delta),
    tooTight: rows.filter((r) => r.delta < -0.25).sort((a, b) => a.delta - b.delta),
  };
};

/** Hand code for two integer cards, re-exported so UIs need one import. */
export { cardsToHandCode, makeHandCode };
