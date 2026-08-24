const RANK_ORDER = "23456789TJQKA";
const RANK_VALUES = Object.fromEntries(
  RANK_ORDER.split("").map((rank, index) => [rank, index + 2])
);
const SUIT_SYMBOLS = { s: "♠", h: "♥", d: "♦", c: "♣" };

export const buildDeck = () => {
  const suits = ["s", "h", "d", "c"];
  return suits.flatMap((suit) =>
    RANK_ORDER.split("").map((rank) => `${rank}${suit}`)
  );
};

export const shuffleDeck = (deck) => {
  const copy = [...deck];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

export const dealCards = (deck, count) => {
  const dealt = deck.slice(0, count);
  const remaining = deck.slice(count);
  return { dealt, remaining };
};

export const formatCard = (card) => {
  if (!card) return "";
  const rank = card[0];
  const suit = SUIT_SYMBOLS[card[1]];
  return `${rank}${suit}`;
};

const groupBy = (cards, keyFn) => {
  return cards.reduce((acc, card) => {
    const key = keyFn(card);
    acc[key] = acc[key] ? [...acc[key], card] : [card];
    return acc;
  }, {});
};

const getStraightHigh = (ranks) => {
  const unique = Array.from(new Set(ranks)).sort((a, b) => b - a);
  if (unique.includes(14)) unique.push(1);
  let run = 1;
  for (let i = 1; i < unique.length; i += 1) {
    if (unique[i] === unique[i - 1] - 1) {
      run += 1;
      if (run >= 5) return unique[i - 4] === 1 ? 5 : unique[i - 4];
    } else {
      run = 1;
    }
  }
  return null;
};

const scoreHand = (rank, tiebreakers) => {
  return tiebreakers.reduce((acc, value) => acc * 15 + value, rank);
};

export const evaluateHand = (cards) => {
  const parsed = cards.map((card) => ({
    rank: RANK_VALUES[card[0]],
    suit: card[1],
  }));
  const ranks = parsed.map((c) => c.rank).sort((a, b) => b - a);
  const suits = groupBy(parsed, (c) => c.suit);
  const counts = groupBy(parsed, (c) => c.rank);

  const rankCounts = Object.entries(counts)
    .map(([rank, list]) => ({ rank: Number(rank), count: list.length }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank);

  const flushSuit = Object.keys(suits).find((suit) => suits[suit].length >= 5);
  const flushRanks = flushSuit
    ? suits[flushSuit].map((c) => c.rank).sort((a, b) => b - a)
    : null;
  const straightHigh = getStraightHigh(ranks);
  const straightFlushHigh = flushSuit
    ? getStraightHigh(flushRanks)
    : null;

  if (straightFlushHigh) {
    return {
      name: "Straight Flush",
      score: scoreHand(8, [straightFlushHigh]),
    };
  }

  if (rankCounts[0].count === 4) {
    const quad = rankCounts[0].rank;
    const kicker = rankCounts.find((item) => item.rank !== quad).rank;
    return { name: "Four of a Kind", score: scoreHand(7, [quad, kicker]) };
  }

  if (rankCounts[0].count === 3 && rankCounts[1].count >= 2) {
    return {
      name: "Full House",
      score: scoreHand(6, [rankCounts[0].rank, rankCounts[1].rank]),
    };
  }

  if (flushRanks) {
    return { name: "Flush", score: scoreHand(5, flushRanks.slice(0, 5)) };
  }

  if (straightHigh) {
    return { name: "Straight", score: scoreHand(4, [straightHigh]) };
  }

  if (rankCounts[0].count === 3) {
    const kickers = rankCounts
      .filter((item) => item.rank !== rankCounts[0].rank)
      .map((item) => item.rank)
      .slice(0, 2);
    return {
      name: "Three of a Kind",
      score: scoreHand(3, [rankCounts[0].rank, ...kickers]),
    };
  }

  if (rankCounts[0].count === 2 && rankCounts[1].count === 2) {
    const highPair = Math.max(rankCounts[0].rank, rankCounts[1].rank);
    const lowPair = Math.min(rankCounts[0].rank, rankCounts[1].rank);
    const kicker = rankCounts.find(
      (item) => item.rank !== highPair && item.rank !== lowPair
    ).rank;
    return {
      name: "Two Pair",
      score: scoreHand(2, [highPair, lowPair, kicker]),
    };
  }

  if (rankCounts[0].count === 2) {
    const pair = rankCounts[0].rank;
    const kickers = rankCounts
      .filter((item) => item.rank !== pair)
      .map((item) => item.rank)
      .slice(0, 3);
    return { name: "One Pair", score: scoreHand(1, [pair, ...kickers]) };
  }

  return { name: "High Card", score: scoreHand(0, ranks.slice(0, 5)) };
};
