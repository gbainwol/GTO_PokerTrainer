/**
 * Hold'em range notation: parsing, expansion to concrete combos, and blocker
 * removal.
 *
 * Supported syntax (comma or whitespace separated):
 *   AA, AKs, AKo, AK          pair / suited / offsuit / both
 *   TT+, A5s+, KQo+           "and better" - pairs climb, kickers climb
 *   22-55, A2s-A5s            explicit spans
 *   AKs:0.5                   weighted (weight is parsed and retained)
 *
 * A "hand code" is one of the 169 strategically distinct starting hands
 * (13 pairs + 78 suited + 78 offsuit). A "combo" is a concrete pair of cards;
 * a pair code expands to 6 combos, suited to 4, offsuit to 12.
 */

import { RANKS, cardToInt } from "./evaluator.js";

/** Rank index 0..12 for a rank character, or -1. */
const rankIndex = (ch) => RANKS.indexOf(ch.toUpperCase());
const rankChar = (idx) => RANKS[idx];

export const ALL_SUITS = ["s", "h", "d", "c"];

/** Canonical code for two rank indices, e.g. (12, 11, true) -> "AKs". */
export const makeHandCode = (hi, lo, suited) => {
  if (hi === lo) return `${rankChar(hi)}${rankChar(hi)}`;
  const a = Math.max(hi, lo);
  const b = Math.min(hi, lo);
  return `${rankChar(a)}${rankChar(b)}${suited ? "s" : "o"}`;
};

/** All 169 distinct starting hands, strongest-looking first is NOT implied. */
export const ALL_HAND_CODES = (() => {
  const codes = [];
  for (let hi = 12; hi >= 0; hi -= 1) {
    codes.push(makeHandCode(hi, hi, false));
    for (let lo = hi - 1; lo >= 0; lo -= 1) {
      codes.push(makeHandCode(hi, lo, true));
      codes.push(makeHandCode(hi, lo, false));
    }
  }
  return codes;
})();

const HAND_CODE_SET = new Set(ALL_HAND_CODES);

/** Expand a hand code into its concrete two-card combos. */
export const handCodeToCombos = (code) => {
  const hi = rankIndex(code[0]);
  const lo = rankIndex(code[1]);
  if (hi < 0 || lo < 0) throw new Error(`Invalid hand code: ${code}`);
  const suffix = code[2];
  const combos = [];

  if (hi === lo) {
    for (let i = 0; i < 4; i += 1) {
      for (let j = i + 1; j < 4; j += 1) {
        combos.push([
          cardToInt(rankChar(hi) + ALL_SUITS[i]),
          cardToInt(rankChar(lo) + ALL_SUITS[j]),
        ]);
      }
    }
    return combos;
  }

  if (suffix !== "o") {
    for (const suit of ALL_SUITS) {
      combos.push([
        cardToInt(rankChar(hi) + suit),
        cardToInt(rankChar(lo) + suit),
      ]);
    }
  }
  if (suffix !== "s") {
    for (const s1 of ALL_SUITS) {
      for (const s2 of ALL_SUITS) {
        if (s1 === s2) continue;
        combos.push([
          cardToInt(rankChar(hi) + s1),
          cardToInt(rankChar(lo) + s2),
        ]);
      }
    }
  }
  return combos;
};

/** Expand "AK" (no suffix) into both "AKs" and "AKo". */
const expandBare = (hi, lo) =>
  hi === lo
    ? [makeHandCode(hi, hi, false)]
    : [makeHandCode(hi, lo, true), makeHandCode(hi, lo, false)];

const parseToken = (raw) => {
  const token = raw.trim();
  if (!token) return [];

  // Optional weight suffix, e.g. "AKs:0.5".
  const [body, weightText] = token.split(":");
  const weight = weightText != null ? Number(weightText) : 1;
  if (!Number.isFinite(weight) || weight < 0 || weight > 1) {
    throw new Error(`Invalid weight in "${token}"`);
  }

  const emit = (codes) => codes.map((code) => ({ code, weight }));

  // Span: "22-55", "A2s-A5s"
  if (body.includes("-")) {
    const [leftText, rightText] = body.split("-");
    const left = parseSingle(leftText);
    const right = parseSingle(rightText);
    if (!left || !right) throw new Error(`Invalid span: "${body}"`);
    if (left.hi !== right.hi && !(left.isPair && right.isPair)) {
      throw new Error(`Span endpoints must share a high card: "${body}"`);
    }
    if (left.suited !== right.suited) {
      throw new Error(`Span endpoints must match suitedness: "${body}"`);
    }

    const codes = [];
    if (left.isPair && right.isPair) {
      const from = Math.min(left.hi, right.hi);
      const to = Math.max(left.hi, right.hi);
      for (let r = from; r <= to; r += 1) codes.push(makeHandCode(r, r, false));
    } else {
      const from = Math.min(left.lo, right.lo);
      const to = Math.max(left.lo, right.lo);
      for (let r = from; r <= to; r += 1) {
        if (r === left.hi) continue;
        if (left.suffix) codes.push(makeHandCode(left.hi, r, left.suited));
        else codes.push(...expandBare(left.hi, r));
      }
    }
    return emit(codes);
  }

  // "and better": "TT+", "A5s+"
  if (body.endsWith("+")) {
    const base = parseSingle(body.slice(0, -1));
    if (!base) throw new Error(`Invalid token: "${body}"`);
    const codes = [];
    if (base.isPair) {
      for (let r = base.hi; r <= 12; r += 1) codes.push(makeHandCode(r, r, false));
    } else {
      // Kicker climbs up to one below the high card.
      for (let r = base.lo; r < base.hi; r += 1) {
        if (base.suffix) codes.push(makeHandCode(base.hi, r, base.suited));
        else codes.push(...expandBare(base.hi, r));
      }
    }
    return emit(codes);
  }

  const single = parseSingle(body);
  if (!single) throw new Error(`Invalid token: "${body}"`);
  if (single.suffix) return emit([makeHandCode(single.hi, single.lo, single.suited)]);
  return emit(expandBare(single.hi, single.lo));
};

const parseSingle = (text) => {
  const t = text.trim();
  if (t.length < 2 || t.length > 3) return null;
  const hi = rankIndex(t[0]);
  const lo = rankIndex(t[1]);
  if (hi < 0 || lo < 0) return null;
  const suffix = t.length === 3 ? t[2].toLowerCase() : "";
  if (suffix && suffix !== "s" && suffix !== "o") return null;
  const isPair = hi === lo;
  if (isPair && suffix) return null; // "AAs" is meaningless
  return {
    hi: Math.max(hi, lo),
    lo: Math.min(hi, lo),
    suited: suffix === "s",
    suffix,
    isPair,
  };
};

/**
 * Parse range notation into a Map of hand code -> weight (0..1).
 * Later tokens override earlier ones for the same hand.
 */
export const parseRange = (text) => {
  const weights = new Map();
  if (!text) return weights;
  for (const token of text.split(/[,\s]+/)) {
    if (!token) continue;
    for (const { code, weight } of parseToken(token)) {
      if (!HAND_CODE_SET.has(code)) throw new Error(`Unknown hand: ${code}`);
      if (weight > 0) weights.set(code, weight);
      else weights.delete(code);
    }
  }
  return weights;
};

/**
 * Expand a range into a flat Int32Array of combos [a,b,a,b,...], suitable for
 * the equity engine. Combos containing any `blockers` card are removed, which
 * is what makes range equity correct once cards are visible.
 *
 * Weighted hands are included if their weight exceeds `minWeight`; the engine
 * treats combos uniformly, so weights act as a threshold rather than a
 * sampling distribution.
 */
export const rangeToCombos = (text, blockers = [], minWeight = 0) => {
  const weights = typeof text === "string" ? parseRange(text) : text;
  const blocked = new Set(blockers);
  const out = [];
  for (const [code, weight] of weights) {
    if (weight <= minWeight) continue;
    for (const [a, b] of handCodeToCombos(code)) {
      if (blocked.has(a) || blocked.has(b)) continue;
      out.push(a, b);
    }
  }
  return Int32Array.from(out);
};

/** Total combos in a range, after blockers. */
export const countCombos = (text, blockers = []) =>
  rangeToCombos(text, blockers).length / 2;

/** Fraction of all 1326 starting combos the range covers. */
export const rangePercent = (text) => (countCombos(text) / 1326) * 100;

/** Render a weight map back to compact notation (one token per hand). */
export const formatRange = (weights) =>
  [...weights.entries()]
    .map(([code, w]) => (w === 1 ? code : `${code}:${w}`))
    .join(",");

/** Canonical hand code for two concrete cards, e.g. [As, Kh] -> "AKo". */
export const cardsToHandCode = (a, b) => {
  const ra = a >> 2;
  const rb = b >> 2;
  return makeHandCode(ra, rb, (a & 3) === (b & 3));
};
