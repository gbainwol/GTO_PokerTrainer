/**
 * Fast, exact 5-7 card Texas Hold'em hand evaluator.
 *
 * Cards are encoded as integers 0..51: `rank * 4 + suit`, where rank is an
 * index 0..12 (0 = deuce, 12 = ace) and suit is 0..3 (s, h, d, c).
 *
 * `evaluate` returns a single packed integer. Higher is strictly better, and
 * scores are directly comparable across every hand class:
 *
 *     (category << 20) | (t1 << 16) | (t2 << 12) | (t3 << 8) | (t4 << 4) | t5
 *
 * Every category emits exactly five tiebreaker nibbles (zero-padded), which is
 * what makes cross-category comparison sound. Rank indices max out at 12 and
 * categories at 8, so each field fits its nibble and the whole score stays well
 * inside a 32-bit signed int.
 */

export const RANKS = "23456789TJQKA";
export const SUITS = "shdc";
export const SUIT_SYMBOLS = { s: "♠", h: "♥", d: "♦", c: "♣" };
export const RED_SUITS = new Set(["h", "d"]);

export const HIGH_CARD = 0;
export const PAIR = 1;
export const TWO_PAIR = 2;
export const TRIPS = 3;
export const STRAIGHT = 4;
export const FLUSH = 5;
export const FULL_HOUSE = 6;
export const QUADS = 7;
export const STRAIGHT_FLUSH = 8;

export const CATEGORY_NAMES = [
  "High Card",
  "One Pair",
  "Two Pair",
  "Three of a Kind",
  "Straight",
  "Flush",
  "Full House",
  "Four of a Kind",
  "Straight Flush",
];

/**
 * STRAIGHT_HIGH[mask] -> rank index of the best straight's high card, or -1.
 * `mask` is a 13-bit set of distinct ranks. Precomputed once for all 8192
 * possible masks so straight detection is a single array read at runtime.
 */
const STRAIGHT_HIGH = new Int8Array(1 << 13).fill(-1);
for (let mask = 0; mask < 1 << 13; mask += 1) {
  // Walk high -> low so the first hit is the best straight.
  for (let high = 12; high >= 4; high -= 1) {
    const run = 0b11111 << (high - 4);
    if ((mask & run) === run) {
      STRAIGHT_HIGH[mask] = high;
      break;
    }
  }
  // Wheel (A-5-4-3-2): the ace plays low, so the straight is five-high (idx 3).
  if (STRAIGHT_HIGH[mask] === -1) {
    const wheel = (1 << 12) | 0b1111;
    if ((mask & wheel) === wheel) STRAIGHT_HIGH[mask] = 3;
  }
}

const POPCOUNT = new Uint8Array(1 << 13);
for (let i = 1; i < 1 << 13; i += 1) POPCOUNT[i] = POPCOUNT[i >> 1] + (i & 1);

/** Index of the highest set bit. */
const top = (mask) => 31 - Math.clz32(mask);

const pack = (cat, a = 0, b = 0, c = 0, d = 0, e = 0) =>
  (cat << 20) | (a << 16) | (b << 12) | (c << 8) | (d << 4) | e;

/** Pack the highest `n` ranks of `mask` as consecutive nibbles. */
const packTop = (cat, mask, n) => {
  let score = cat << 20;
  let shift = 16;
  let m = mask;
  for (let i = 0; i < n; i += 1) {
    const bit = top(m);
    score |= bit << shift;
    m &= ~(1 << bit);
    shift -= 4;
  }
  return score;
};

/**
 * Evaluate 5, 6, or 7 cards. `cards` is an array-like of integer card codes;
 * pass `len` to evaluate only a prefix. Allocation-free on the hot path.
 */
export const evaluate = (cards, len = cards.length) => {
  // seenN = bitmask of ranks appearing at least N times. Building these in one
  // pass avoids a per-call counts array, which matters in Monte Carlo loops.
  let seen1 = 0;
  let seen2 = 0;
  let seen3 = 0;
  let seen4 = 0;
  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  let s3 = 0;

  for (let i = 0; i < len; i += 1) {
    const card = cards[i];
    const r = card >> 2;
    const bit = 1 << r;
    if (seen3 & bit) seen4 |= bit;
    else if (seen2 & bit) seen3 |= bit;
    else if (seen1 & bit) seen2 |= bit;
    else seen1 |= bit;

    switch (card & 3) {
      case 0: s0 |= bit; break;
      case 1: s1 |= bit; break;
      case 2: s2 |= bit; break;
      default: s3 |= bit; break;
    }
  }

  // --- Flush family -------------------------------------------------------
  let flushMask = 0;
  if (POPCOUNT[s0] >= 5) flushMask = s0;
  else if (POPCOUNT[s1] >= 5) flushMask = s1;
  else if (POPCOUNT[s2] >= 5) flushMask = s2;
  else if (POPCOUNT[s3] >= 5) flushMask = s3;

  if (flushMask) {
    const sfHigh = STRAIGHT_HIGH[flushMask];
    if (sfHigh >= 0) return pack(STRAIGHT_FLUSH, sfHigh);
  }

  // --- Rank-count family --------------------------------------------------
  const quads = seen4;
  const trips = seen3 & ~seen4;
  const pairs = seen2 & ~seen3;

  if (quads) {
    const q = top(quads);
    // Kicker is the best card outside the quads, from all ranks present.
    const kicker = top(seen1 & ~(1 << q));
    return pack(QUADS, q, kicker);
  }

  if (trips) {
    const t = top(trips);
    // A second trips can serve as the pair (e.g. 333 + 777 -> 777 full of 333).
    const pairPool = pairs | (trips & ~(1 << t));
    if (pairPool) return pack(FULL_HOUSE, t, top(pairPool));
  }

  if (flushMask) return packTop(FLUSH, flushMask, 5);

  const straightHigh = STRAIGHT_HIGH[seen1];
  if (straightHigh >= 0) return pack(STRAIGHT, straightHigh);

  if (trips) return buildTrips(top(trips), seen1);

  if (pairs) {
    const hi = top(pairs);
    const rest = pairs & ~(1 << hi);
    if (rest) {
      const lo = top(rest);
      // Kicker may be a third pair or an unpaired card - take the best of all.
      const kicker = top(seen1 & ~(1 << hi) & ~(1 << lo));
      return pack(TWO_PAIR, hi, lo, kicker);
    }
    return buildPair(hi, seen1);
  }

  return packTop(HIGH_CARD, seen1, 5);
};

const buildTrips = (t, seen1) => {
  const rest = seen1 & ~(1 << t);
  const k1 = top(rest);
  const k2 = top(rest & ~(1 << k1));
  return pack(TRIPS, t, k1, k2);
};

const buildPair = (p, seen1) => {
  let rest = seen1 & ~(1 << p);
  const k1 = top(rest);
  rest &= ~(1 << k1);
  const k2 = top(rest);
  rest &= ~(1 << k2);
  const k3 = top(rest);
  return pack(PAIR, p, k1, k2, k3);
};

export const categoryOf = (score) => score >>> 20;
export const handName = (score) => CATEGORY_NAMES[categoryOf(score)];

// --- String <-> int conversion ------------------------------------------

export const cardToInt = (card) => {
  const r = RANKS.indexOf(card[0]);
  const s = SUITS.indexOf(card[1]);
  if (r < 0 || s < 0) throw new Error(`Invalid card: ${card}`);
  return r * 4 + s;
};

export const intToCard = (code) => RANKS[code >> 2] + SUITS[code & 3];

export const cardsToInts = (cards) => cards.map(cardToInt);

export const formatCard = (card) => {
  if (!card) return "";
  return `${card[0]}${SUIT_SYMBOLS[card[1]] ?? ""}`;
};

/**
 * Convenience wrapper matching the legacy string-based API.
 * Prefer `evaluate` with integer codes on hot paths.
 */
export const evaluateHand = (cards) => {
  const score = evaluate(cardsToInts(cards));
  return { name: handName(score), score };
};

/** Full 52-card deck as integer codes. */
export const buildDeckInts = () => {
  const deck = new Int32Array(52);
  for (let i = 0; i < 52; i += 1) deck[i] = i;
  return deck;
};
