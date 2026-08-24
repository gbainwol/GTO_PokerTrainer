/**
 * Multi-street CFR+ solver: flop, turn, and river subgames, range vs range.
 *
 * This is an actual equilibrium solver. It builds a betting tree for the
 * current street; where a street ends without a fold, a *chance node* deals the
 * next card and a fresh betting tree continues underneath it. CFR+ runs over
 * the whole thing in vector form, with a strategy per concrete hand combo
 * rather than per abstract hand class. Solve quality is reported as
 * exploitability, so output can be judged rather than taken on faith.
 *
 * Utilities use the split-pot convention: each player is treated as owning half
 * the pot already in the middle when the subgame starts. That makes the game
 * zero-sum, which CFR requires, and makes a chopped pot worth exactly 0.
 *
 *   fold by q:  u_p = +(P/2 + c_q),  u_q = -(P/2 + c_q)
 *   showdown:   u_winner = +(P/2 + c),  u_loser = -(P/2 + c),  tie = 0
 *
 * Card removal is exact everywhere. Two players cannot hold the same card, so
 * terminal values subtract opponent combos sharing a card with the hand being
 * valued, and a chance node cannot deal a card a player is already holding.
 *
 * Cost scales with the number of runouts below the tree, which is what limits
 * how deep an exact solve can go in a browser:
 *
 * Hole cards are private, so a chance node deals from 52 minus the board:
 *
 *   river  1 board            fractions of a megabyte
 *   turn   48 rivers          single-digit megabytes - solved exactly
 *   flop   49 x 48 = 2352     hundreds of megabytes - too big for a browser
 *
 * So a flop solve explores a weighted *sample* of runouts, shared across every
 * betting line that reaches the same board. That is an abstraction, and every
 * result says so (`result.exact`, `result.runouts`).
 */

import { evaluate } from "./evaluator.js";

export const OOP = 0;
export const IP = 1;

export const DECISION = 0;
export const TERMINAL_FOLD = 1;
export const TERMINAL_SHOWDOWN = 2;
export const CHANCE = 3;

/** Default tree shape. Sizes are fractions of the pot at the time of acting. */
export const DEFAULT_TREE_CONFIG = {
  betSizes: [0.5, 1.0],
  raiseSizes: [1.0],
  maxRaises: 1,
  allowAllIn: true,
  // Optional per-player overrides, mainly so a test can restrict one player.
  oopBetSizes: null,
  ipBetSizes: null,
  /**
   * Per-street overrides, keyed by board length (3 = flop, 4 = turn, 5 = river).
   * Later streets usually want fewer sizes: every extra branch multiplies
   * against every runout below it.
   */
  perStreet: null,
};

/**
 * How many cards a chance node explores, keyed by the street being dealt
 * (4 = the turn card, 5 = the river card). `Infinity` enumerates every card.
 *
 * Turn and river are exact by default. Dealing a turn from a flop is capped,
 * because that budget multiplies against the river budget beneath it.
 */
export const DEFAULT_RUNOUTS = { 4: Infinity, 5: Infinity };

const round2 = (n) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Ranges and per-board contexts
// ---------------------------------------------------------------------------

/**
 * Canonical hand list for a player: every combo that is not blocked by the
 * starting board. Order is stable and board-independent, because reach vectors
 * are indexed by it across every runout.
 */
export const prepareRange = (combos, weights, board) => {
  const dead = new Set(board);
  const cardA = [];
  const cardB = [];
  const weight = [];
  for (let i = 0; i < combos.length / 2; i += 1) {
    const a = combos[i * 2];
    const b = combos[i * 2 + 1];
    if (dead.has(a) || dead.has(b)) continue;
    cardA.push(a);
    cardB.push(b);
    weight.push(weights ? weights[i] : 1);
  }
  return {
    size: cardA.length,
    cardA: Int32Array.from(cardA),
    cardB: Int32Array.from(cardB),
    weight: Float64Array.from(weight),
  };
};

/**
 * Hand strengths on one complete board, plus the ascending-strength ordering
 * the showdown sweep walks. Built once per reachable board.
 */
export const makeContext = (range, board) => {
  const buf = new Int32Array(7);
  for (let i = 0; i < 5; i += 1) buf[2 + i] = board[i];
  const strength = new Int32Array(range.size);
  for (let i = 0; i < range.size; i += 1) {
    buf[0] = range.cardA[i];
    buf[1] = range.cardB[i];
    strength[i] = evaluate(buf, 7);
  }
  const order = Int32Array.from({ length: range.size }, (_, i) => i);
  // Ascending: the sweep accumulates "opponent hands I beat" as it advances.
  order.sort((x, y) => strength[x] - strength[y]);
  return { strength, order };
};

/**
 * Index of the identical combo in the other player's range, or -1.
 * A combo counted under both of its cards during card removal is subtracted
 * twice and has to be added back once.
 */
export const buildSelfIndex = (mine, theirs) => {
  const key = (a, b) => (a < b ? a * 52 + b : b * 52 + a);
  const lookup = new Map();
  for (let j = 0; j < theirs.size; j += 1) {
    lookup.set(key(theirs.cardA[j], theirs.cardB[j]), j);
  }
  const out = new Int32Array(mine.size).fill(-1);
  for (let i = 0; i < mine.size; i += 1) {
    const j = lookup.get(key(mine.cardA[i], mine.cardB[i]));
    if (j !== undefined) out[i] = j;
  }
  return out;
};

// ---------------------------------------------------------------------------
// Terminal values
// ---------------------------------------------------------------------------

/**
 * Showdown values for every hand of `me` on one board, given the opponent's
 * reach. Sweeps both ranges in strength order with per-card accumulators so
 * blocked opponent combos are excluded exactly - O(n + m) per call.
 *
 * value[i] = payoff * (reach of worse hands - reach of better hands)
 */
export const showdownValues = (me, opp, meCtx, oppCtx, oppReach, payoff, selfIndex, out) => {
  const cardWorse = new Float64Array(52);
  const cardTotal = new Float64Array(52);
  let totalSum = 0;

  for (let j = 0; j < opp.size; j += 1) {
    const w = oppReach[j];
    if (w === 0) continue;
    totalSum += w;
    cardTotal[opp.cardA[j]] += w;
    cardTotal[opp.cardB[j]] += w;
  }

  let worseSum = 0;
  let j = 0;

  for (let k = 0; k < me.size; k += 1) {
    const i = meCtx.order[k];
    const s = meCtx.strength[i];

    // Advance over every opponent hand strictly worse than mine.
    while (j < opp.size) {
      const jj = oppCtx.order[j];
      if (oppCtx.strength[jj] >= s) break;
      const w = oppReach[jj];
      if (w !== 0) {
        worseSum += w;
        cardWorse[opp.cardA[jj]] += w;
        cardWorse[opp.cardB[jj]] += w;
      }
      j += 1;
    }

    // Ties pay nothing but must be kept out of "better".
    let tieSum = 0;
    let tieCardA = 0;
    let tieCardB = 0;
    let tieSelf = 0;
    let k2 = j;
    while (k2 < opp.size) {
      const jj = oppCtx.order[k2];
      if (oppCtx.strength[jj] !== s) break;
      const w = oppReach[jj];
      if (w !== 0) {
        tieSum += w;
        if (opp.cardA[jj] === me.cardA[i] || opp.cardB[jj] === me.cardA[i]) tieCardA += w;
        if (opp.cardA[jj] === me.cardB[i] || opp.cardB[jj] === me.cardB[i]) tieCardB += w;
        if (jj === selfIndex[i]) tieSelf += w;
      }
      k2 += 1;
    }

    const a = me.cardA[i];
    const b = me.cardB[i];
    const self = selfIndex[i] >= 0 ? oppReach[selfIndex[i]] : 0;

    // The identical combo always ties with itself, so it only needs correcting
    // in the tie and total terms - never in the "worse" sweep.
    const worseAdj = worseSum - cardWorse[a] - cardWorse[b];
    const tieAdj = tieSum - tieCardA - tieCardB + tieSelf;
    const totalAdj = totalSum - cardTotal[a] - cardTotal[b] + self;
    const betterAdj = totalAdj - worseAdj - tieAdj;

    out[i] = payoff * (worseAdj - betterAdj);
  }
  return out;
};

/** Fold values: the whole unblocked opponent range pays, regardless of strength. */
export const foldValues = (me, opp, oppReach, payoff, selfIndex, out) => {
  const cardTotal = new Float64Array(52);
  let totalSum = 0;
  for (let j = 0; j < opp.size; j += 1) {
    const w = oppReach[j];
    if (w === 0) continue;
    totalSum += w;
    cardTotal[opp.cardA[j]] += w;
    cardTotal[opp.cardB[j]] += w;
  }
  for (let i = 0; i < me.size; i += 1) {
    const self = selfIndex[i] >= 0 ? oppReach[selfIndex[i]] : 0;
    out[i] = payoff * (totalSum - cardTotal[me.cardA[i]] - cardTotal[me.cardB[i]] + self);
  }
  return out;
};

// ---------------------------------------------------------------------------
// Tree construction
// ---------------------------------------------------------------------------

/** Deterministic sampler, so a sampled flop solve is reproducible. */
const makeRng = (seed) => {
  let s = seed >>> 0 || 0x9e3779b9;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0x100000000;
  };
};

/**
 * Choose which cards a chance node explores.
 * Enumerates everything when the budget allows; otherwise takes an evenly
 * spaced sample and weights each pick by how many cards it stands for, so the
 * branch probabilities still sum correctly.
 */
const chooseRunouts = (available, budget, rng) => {
  if (!Number.isFinite(budget) || budget >= available.length) {
    return { cards: available, weights: available.map(() => 1), exact: true };
  }
  const picked = [];
  const pool = [...available];
  for (let i = 0; i < budget && pool.length > 0; i += 1) {
    picked.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  picked.sort((a, b) => a - b);
  const share = available.length / picked.length;
  return { cards: picked, weights: picked.map(() => share), exact: false };
};

/**
 * Build the full subgame tree from `board` onward.
 *
 * Returns { root, nodeCount, decisionCount, boards, exact }, where `boards` is
 * the list of complete boards reachable at showdown (indexed by `boardKey` on
 * showdown nodes).
 */
export const buildTree = (board, pot, effectiveStack, config = DEFAULT_TREE_CONFIG, options = {}) => {
  const cfg = { ...DEFAULT_TREE_CONFIG, ...config };
  const runoutBudget = { ...DEFAULT_RUNOUTS, ...(options.runouts ?? {}) };
  const rng = makeRng(options.seed ?? 0x5eed1234);
  const deadFromStart = new Set(board);

  let nodeCount = 0;
  let decisionCount = 0;
  let exact = true;

  const boards = [];
  const boardKeys = new Map();
  const runoutCache = new Map();
  const keyForBoard = (b) => {
    const k = b.join(",");
    let idx = boardKeys.get(k);
    if (idx === undefined) {
      idx = boards.length;
      boards.push([...b]);
      boardKeys.set(k, idx);
    }
    return idx;
  };

  const betSizesFor = (player, streetBoard) => {
    const perStreet = cfg.perStreet?.[streetBoard.length];
    if (perStreet?.betSizes) return perStreet.betSizes;
    const override = player === OOP ? cfg.oopBetSizes : cfg.ipBetSizes;
    return override ?? cfg.betSizes;
  };
  const settingsFor = (streetBoard) => ({
    ...cfg,
    ...(cfg.perStreet?.[streetBoard.length] ?? {}),
  });

  /**
   * The street's betting is over with chips still contested. On the river that
   * is a showdown; earlier it is a chance node dealing the next card, with a
   * fresh betting tree beneath each branch.
   */
  const afterBetting = (streetBoard, basePot, baseStack, c0, c1) => {
    const carried = round2(basePot + Math.min(c0, c1) * 2);
    const remaining = round2(baseStack - Math.min(c0, c1));

    if (streetBoard.length >= 5) {
      return {
        id: nodeCount++,
        type: TERMINAL_SHOWDOWN,
        payoff: basePot / 2 + Math.min(c0, c1),
        boardKey: keyForBoard(streetBoard),
      };
    }

    // Cards still in the deck. Hole cards are unknown, so they stay available
    // here; a hand simply cannot reach the branch that deals one of its own.
    const dead = new Set([...deadFromStart, ...streetBoard]);
    const available = [];
    for (let c = 0; c < 52; c += 1) if (!dead.has(c)) available.push(c);

    const cacheKey = streetBoard.join(",");
    let chosen = runoutCache.get(cacheKey);
    if (!chosen) {
      chosen = chooseRunouts(
        available,
        runoutBudget[streetBoard.length + 1] ?? Infinity,
        rng
      );
      runoutCache.set(cacheKey, chosen);
    }
    const { cards, weights, exact: branchExact } = chosen;
    if (!branchExact) exact = false;

    const node = {
      id: nodeCount++,
      type: CHANCE,
      cards: Int32Array.from(cards),
      weights: Float64Array.from(weights),
      totalCards: available.length,
      children: [],
    };
    for (const card of cards) {
      // No chips are outstanding at the start of a new street.
      node.children.push(build([...streetBoard, card], carried, remaining, OOP, 0, 0, 0, 0, false));
    }
    return node;
  };

  /**
   * @param streetBoard board at this point in the tree
   * @param basePot     pot carried into this street
   * @param baseStack   effective stack at the start of this street
   * @param player      whose turn it is
   * @param c0,c1       chips committed this street
   * @param facing      amount the acting player must call (0 = may check)
   * @param raises      raises used this street
   * @param checked     previous player checked, so a check here ends the street
   */
  const build = (streetBoard, basePot, baseStack, player, c0, c1, facing, raises, checked) => {
    const settings = settingsFor(streetBoard);
    const node = {
      id: nodeCount++,
      type: DECISION,
      player,
      board: streetBoard,
      actions: [],
      children: [],
    };
    decisionCount += 1;

    const myC = player === OOP ? c0 : c1;
    const remaining = round2(baseStack - myC);
    const potNow = round2(basePot + c0 + c1);

    const terminalFold = (folder, n0, n1) => ({
      id: nodeCount++,
      type: TERMINAL_FOLD,
      folder,
      // The folder forfeits what it put in; the winner also takes the dead pot.
      payoff: basePot / 2 + (folder === OOP ? n0 : n1),
    });

    if (facing === 0) {
      node.actions.push({ label: "Check", type: "check" });
      node.children.push(
        checked
          ? afterBetting(streetBoard, basePot, baseStack, c0, c1)
          : build(streetBoard, basePot, baseStack, 1 - player, c0, c1, 0, raises, true)
      );

      const seen = new Set();
      for (const fraction of betSizesFor(player, streetBoard)) {
        const size = round2(Math.min(remaining, potNow * fraction));
        if (size <= 0 || seen.has(size)) continue;
        seen.add(size);
        const [n0, n1] = player === OOP ? [round2(c0 + size), c1] : [c0, round2(c1 + size)];
        node.actions.push({ label: `Bet ${fraction}x`, type: "bet", size });
        node.children.push(
          build(streetBoard, basePot, baseStack, 1 - player, n0, n1, size, raises, false)
        );
      }
      // A player configured with no bet sizes has no betting line at all.
      if (settings.allowAllIn && betSizesFor(player, streetBoard).length > 0 &&
          remaining > 0 && !seen.has(remaining)) {
        const [n0, n1] = player === OOP ? [round2(c0 + remaining), c1] : [c0, round2(c1 + remaining)];
        node.actions.push({ label: "All-in", type: "bet", size: remaining });
        node.children.push(
          build(streetBoard, basePot, baseStack, 1 - player, n0, n1, remaining, raises, false)
        );
      }
      return node;
    }

    // Facing a bet: fold / call / raise.
    node.actions.push({ label: "Fold", type: "fold" });
    node.children.push(terminalFold(player, c0, c1));

    const callAmount = Math.min(facing, remaining);
    const [k0, k1] = player === OOP ? [round2(c0 + callAmount), c1] : [c0, round2(c1 + callAmount)];
    node.actions.push({ label: "Call", type: "call" });
    node.children.push(afterBetting(streetBoard, basePot, baseStack, k0, k1));

    if (raises < settings.maxRaises) {
      const seen = new Set();
      for (const fraction of settings.raiseSizes) {
        const target = round2(
          Math.min(remaining, callAmount + (potNow + callAmount) * fraction)
        );
        if (target <= callAmount || seen.has(target)) continue;
        seen.add(target);
        const [n0, n1] = player === OOP ? [round2(c0 + target), c1] : [c0, round2(c1 + target)];
        node.actions.push({ label: `Raise ${fraction}x`, type: "raise", size: target });
        node.children.push(
          build(streetBoard, basePot, baseStack, 1 - player, n0, n1,
                round2(Math.abs(n0 - n1)), raises + 1, false)
        );
      }
      if (settings.allowAllIn && remaining > callAmount && !seen.has(remaining)) {
        const [n0, n1] = player === OOP ? [round2(c0 + remaining), c1] : [c0, round2(c1 + remaining)];
        node.actions.push({ label: "All-in", type: "raise", size: remaining });
        node.children.push(
          build(streetBoard, basePot, baseStack, 1 - player, n0, n1,
                round2(Math.abs(n0 - n1)), raises + 1, false)
        );
      }
    }

    return node;
  };

  const root = build(board, pot, effectiveStack, OOP, 0, 0, 0, 0, false);
  return { root, nodeCount, decisionCount, boards, exact };
};

// ---------------------------------------------------------------------------
// CFR+
// ---------------------------------------------------------------------------

const allocate = (node, ranges, store) => {
  if (node.type === DECISION) {
    const n = ranges[node.player].size;
    const a = node.actions.length;
    store.set(node.id, {
      regret: new Float64Array(n * a),
      sum: new Float64Array(n * a),
      strategy: new Float64Array(n * a).fill(1 / a),
      n,
      a,
    });
    node.children.forEach((child) => allocate(child, ranges, store));
    return;
  }
  if (node.type === CHANCE) {
    node.children.forEach((child) => allocate(child, ranges, store));
  }
};

/** Regret matching. CFR+ keeps accumulated regrets non-negative. */
const updateStrategy = (data) => {
  const { regret, strategy, n, a } = data;
  for (let i = 0; i < n; i += 1) {
    const base = i * a;
    let total = 0;
    for (let k = 0; k < a; k += 1) total += regret[base + k] > 0 ? regret[base + k] : 0;
    if (total > 0) {
      for (let k = 0; k < a; k += 1) {
        strategy[base + k] = regret[base + k] > 0 ? regret[base + k] / total : 0;
      }
    } else {
      for (let k = 0; k < a; k += 1) strategy[base + k] = 1 / a;
    }
  }
};

/** Copy a reach vector with every hand holding `card` zeroed out. */
const withoutCard = (reach, range, card) => {
  const out = new Float64Array(reach.length);
  for (let i = 0; i < reach.length; i += 1) {
    out[i] = range.cardA[i] === card || range.cardB[i] === card ? 0 : reach[i];
  }
  return out;
};

/**
 * Values at a chance node.
 *
 * Given a hand, the next card is uniform over the cards it does not itself
 * hold, so each hand averages only over the branches it can actually see.
 * Branch weights carry the sampling factor when runouts are sampled.
 */
const chanceValues = (node, target, reach, ctx, recurse) => {
  const me = ctx.ranges[target];
  const opp = ctx.ranges[1 - target];
  const num = new Float64Array(me.size);

  for (let b = 0; b < node.cards.length; b += 1) {
    const card = node.cards[b];
    const weight = node.weights[b];

    const savedMe = reach[target];
    const savedOpp = reach[1 - target];
    reach[target] = withoutCard(savedMe, me, card);
    reach[1 - target] = withoutCard(savedOpp, opp, card);
    const childValue = recurse(node.children[b], target, reach, ctx);
    reach[target] = savedMe;
    reach[1 - target] = savedOpp;

    for (let i = 0; i < me.size; i += 1) {
      // A branch dealing one of my own cards is impossible given I hold this
      // hand, and its child value is meaningless - skip it entirely.
      if (me.cardA[i] === card || me.cardB[i] === card) continue;
      num[i] += weight * childValue[i];
    }
  }

  /*
   * The divisor is a constant, not a per-hand count.
   *
   * Holding hand i, the next card is uniform over the N - 2 cards I do not
   * hold. For any particular opponent hand j, two more of those are cards j
   * holds; the opponent's reach is zeroed on those branches so they contribute
   * nothing. Every surviving pair therefore averages over exactly N - 4
   * branches, whichever hands they are.
   *
   * Using each hand's own branch count instead scales values by (N-2)/(N-4) -
   * on the turn that is 46/44, a 4.5% error - and because the factor differs
   * per hand once runouts are sampled, it also breaks zero-sum.
   */
  const divisor = node.totalCards - 4;
  const out = new Float64Array(me.size);
  if (divisor > 0) {
    for (let i = 0; i < me.size; i += 1) out[i] = num[i] / divisor;
  }
  return out;
};

/** One CFR traversal returning counterfactual values for `target`. */
const traverse = (node, target, reach, ctx) => {
  const { ranges, store, selfIndex, contexts } = ctx;
  const me = ranges[target];
  const opp = ranges[1 - target];
  const oppReach = reach[1 - target];

  if (node.type === TERMINAL_SHOWDOWN) {
    return showdownValues(
      me, opp,
      contexts[target][node.boardKey], contexts[1 - target][node.boardKey],
      oppReach, node.payoff, selfIndex[target], new Float64Array(me.size)
    );
  }
  if (node.type === TERMINAL_FOLD) {
    const sign = node.folder === target ? -1 : 1;
    return foldValues(me, opp, oppReach, sign * node.payoff, selfIndex[target], new Float64Array(me.size));
  }
  if (node.type === CHANCE) {
    return chanceValues(node, target, reach, ctx, traverse);
  }

  const out = new Float64Array(me.size);
  const data = store.get(node.id);
  updateStrategy(data);
  const { strategy, regret, sum, a } = data;

  if (node.player === target) {
    // Counterfactual values are conditional on holding the hand, so our own
    // reach never enters them - the children are weighted by our mix here.
    const childValues = [];
    for (let k = 0; k < a; k += 1) {
      childValues.push(traverse(node.children[k], target, reach, ctx));
    }
    const myReach = reach[target];
    for (let i = 0; i < me.size; i += 1) {
      const base = i * a;
      let nodeValue = 0;
      for (let k = 0; k < a; k += 1) nodeValue += strategy[base + k] * childValues[k][i];
      out[i] = nodeValue;
      for (let k = 0; k < a; k += 1) {
        const r = regret[base + k] + childValues[k][i] - nodeValue;
        regret[base + k] = r > 0 ? r : 0;
        sum[base + k] += myReach[i] * strategy[base + k];
      }
    }
    return out;
  }

  // Opponent node: fold their mix into their reach and sum the children.
  for (let k = 0; k < a; k += 1) {
    const saved = reach[1 - target];
    const scaled = new Float64Array(opp.size);
    for (let i = 0; i < opp.size; i += 1) scaled[i] = saved[i] * strategy[i * a + k];
    reach[1 - target] = scaled;
    const childValue = traverse(node.children[k], target, reach, ctx);
    reach[1 - target] = saved;
    for (let i = 0; i < me.size; i += 1) out[i] += childValue[i];
  }
  return out;
};

/** Best response for `target` against the opponent's average strategy. */
const bestResponse = (node, target, reach, ctx) => {
  const { ranges, selfIndex, average, contexts } = ctx;
  const me = ranges[target];
  const opp = ranges[1 - target];
  const oppReach = reach[1 - target];

  if (node.type === TERMINAL_SHOWDOWN) {
    return showdownValues(
      me, opp,
      contexts[target][node.boardKey], contexts[1 - target][node.boardKey],
      oppReach, node.payoff, selfIndex[target], new Float64Array(me.size)
    );
  }
  if (node.type === TERMINAL_FOLD) {
    const sign = node.folder === target ? -1 : 1;
    return foldValues(me, opp, oppReach, sign * node.payoff, selfIndex[target], new Float64Array(me.size));
  }
  if (node.type === CHANCE) {
    return chanceValues(node, target, reach, ctx, bestResponse);
  }

  const out = new Float64Array(me.size);
  const a = node.actions.length;

  if (node.player === target) {
    const childValues = [];
    for (let k = 0; k < a; k += 1) {
      childValues.push(bestResponse(node.children[k], target, reach, ctx));
    }
    for (let i = 0; i < me.size; i += 1) {
      let best = -Infinity;
      for (let k = 0; k < a; k += 1) if (childValues[k][i] > best) best = childValues[k][i];
      out[i] = best;
    }
    return out;
  }

  const strat = average.get(node.id);
  for (let k = 0; k < a; k += 1) {
    const saved = reach[1 - target];
    const scaled = new Float64Array(opp.size);
    for (let i = 0; i < opp.size; i += 1) scaled[i] = saved[i] * strat[i * a + k];
    reach[1 - target] = scaled;
    const childValue = bestResponse(node.children[k], target, reach, ctx);
    reach[1 - target] = saved;
    for (let i = 0; i < me.size; i += 1) out[i] += childValue[i];
  }
  return out;
};

/** Value under both players' average strategies. */
const averageWalk = (node, target, reach, ctx) => {
  const { ranges, selfIndex, average, contexts } = ctx;
  const me = ranges[target];
  const opp = ranges[1 - target];
  const oppReach = reach[1 - target];

  if (node.type === TERMINAL_SHOWDOWN) {
    return showdownValues(
      me, opp,
      contexts[target][node.boardKey], contexts[1 - target][node.boardKey],
      oppReach, node.payoff, selfIndex[target], new Float64Array(me.size)
    );
  }
  if (node.type === TERMINAL_FOLD) {
    const sign = node.folder === target ? -1 : 1;
    return foldValues(me, opp, oppReach, sign * node.payoff, selfIndex[target], new Float64Array(me.size));
  }
  if (node.type === CHANCE) {
    return chanceValues(node, target, reach, ctx, averageWalk);
  }

  const out = new Float64Array(me.size);
  const avg = average.get(node.id);
  const a = node.actions.length;

  if (node.player === target) {
    for (let k = 0; k < a; k += 1) {
      const childValue = averageWalk(node.children[k], target, reach, ctx);
      for (let i = 0; i < me.size; i += 1) out[i] += avg[i * a + k] * childValue[i];
    }
    return out;
  }

  for (let k = 0; k < a; k += 1) {
    const saved = reach[1 - target];
    const scaled = new Float64Array(opp.size);
    for (let i = 0; i < opp.size; i += 1) scaled[i] = saved[i] * avg[i * a + k];
    reach[1 - target] = scaled;
    const childValue = averageWalk(node.children[k], target, reach, ctx);
    reach[1 - target] = saved;
    for (let i = 0; i < me.size; i += 1) out[i] += childValue[i];
  }
  return out;
};

/** Normalise accumulated strategy sums into the average strategy. */
const averageStrategy = (store) => {
  const out = new Map();
  for (const [id, data] of store) {
    const { sum, n, a } = data;
    const avg = new Float64Array(n * a);
    for (let i = 0; i < n; i += 1) {
      const base = i * a;
      let total = 0;
      for (let k = 0; k < a; k += 1) total += sum[base + k];
      for (let k = 0; k < a; k += 1) avg[base + k] = total > 0 ? sum[base + k] / total : 1 / a;
    }
    out.set(id, avg);
  }
  return out;
};

/**
 * Normalising divisor for a value vector: the mass of dealable (my hand,
 * their hand) pairs. Counterfactual values carry the opponent's unnormalised
 * reach, so this - not my own range mass - is the right denominator.
 */
const pairMassFor = (ranges, selfIndex, target) => {
  const me = ranges[target];
  const oppMass = foldValues(
    me, ranges[1 - target], ranges[1 - target].weight, 1, selfIndex[target],
    new Float64Array(me.size)
  );
  let mass = 0;
  for (let i = 0; i < me.size; i += 1) mass += me.weight[i] * oppMass[i];
  return mass;
};

const freshReach = (ranges) => [
  Float64Array.from(ranges[0].weight),
  Float64Array.from(ranges[1].weight),
];

/**
 * Exploitability: how much each player gains by best-responding to the other's
 * average strategy. Zero at equilibrium.
 */
export const computeExploitability = (tree, ranges, store, pot, contexts, selfIndex) => {
  const average = averageStrategy(store);
  const ctx = { ranges, store, average, selfIndex, contexts };

  let total = 0;
  for (const target of [OOP, IP]) {
    const values = bestResponse(tree.root, target, freshReach(ranges), ctx);
    const me = ranges[target];
    let value = 0;
    for (let i = 0; i < me.size; i += 1) value += me.weight[i] * values[i];
    const mass = pairMassFor(ranges, selfIndex, target);
    total += mass > 0 ? value / mass : 0;
  }

  const exploitable = total / 2;
  return { exploitable, percentOfPot: pot > 0 ? (exploitable / pot) * 100 : 0 };
};

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

/**
 * Solve a postflop subgame.
 *
 * @param {object} opts
 * @param {number[]} opts.board          3, 4, or 5 community cards
 * @param {Int32Array} opts.oopCombos    flat combo list, out of position
 * @param {Int32Array} opts.ipCombos     flat combo list, in position
 * @param {number} opts.pot
 * @param {number} opts.effectiveStack
 * @param {number} [opts.iterations]
 * @param {object} [opts.treeConfig]
 * @param {object} [opts.runouts]        per-street chance budget, see DEFAULT_RUNOUTS
 * @param {number} [opts.seed]
 */
export const solveSubgame = ({
  board,
  oopCombos,
  ipCombos,
  oopWeights = null,
  ipWeights = null,
  pot,
  effectiveStack,
  iterations = 300,
  treeConfig = DEFAULT_TREE_CONFIG,
  runouts,
  seed = 0x5eed1234,
  onProgress,
}) => {
  if (![3, 4, 5].includes(board.length)) {
    throw new Error(`board must have 3, 4, or 5 cards (got ${board.length})`);
  }

  const ranges = [
    prepareRange(oopCombos, oopWeights, board),
    prepareRange(ipCombos, ipWeights, board),
  ];
  if (!ranges[0].size || !ranges[1].size) {
    throw new Error("both ranges must contain at least one playable combo");
  }

  const built = Date.now();
  const tree = buildTree(board, pot, effectiveStack, treeConfig, { runouts, seed });

  // Strengths for every board the tree can actually reach.
  const contexts = [
    tree.boards.map((b) => makeContext(ranges[0], b)),
    tree.boards.map((b) => makeContext(ranges[1], b)),
  ];
  const selfIndex = [
    buildSelfIndex(ranges[0], ranges[1]),
    buildSelfIndex(ranges[1], ranges[0]),
  ];

  const store = new Map();
  allocate(tree.root, ranges, store);

  const ctx = { ranges, store, selfIndex, contexts };
  const started = Date.now();
  for (let iter = 0; iter < iterations; iter += 1) {
    for (const target of [OOP, IP]) {
      traverse(tree.root, target, freshReach(ranges), ctx);
    }
    if (onProgress && iter % 25 === 0) onProgress({ iteration: iter, iterations });
  }

  const average = averageStrategy(store);
  const exploitability = computeExploitability(tree, ranges, store, pot, contexts, selfIndex);

  return {
    tree,
    ranges,
    contexts,
    selfIndex,
    average,
    exploitability,
    iterations,
    street: board.length,
    /** False when any chance node sampled its runouts instead of enumerating. */
    exact: tree.exact,
    runouts: tree.boards.length,
    buildMs: started - built,
    elapsedMs: Date.now() - started,
  };
};

/** River-only convenience wrapper. */
export const solveRiver = (opts) => {
  if (opts.board.length !== 5) {
    throw new Error("solveRiver needs a complete 5-card board");
  }
  return solveSubgame(opts);
};

/** Expected value of the subgame for one player, in chips. */
export const expectedValue = (result, player = OOP) => {
  const { tree, ranges, average, contexts, selfIndex } = result;
  const ctx = { ranges, average, selfIndex, contexts };
  const values = averageWalk(tree.root, player, freshReach(ranges), ctx);
  const me = ranges[player];
  let value = 0;
  for (let i = 0; i < me.size; i += 1) value += me.weight[i] * values[i];
  const mass = pairMassFor(ranges, selfIndex, player);
  return mass > 0 ? value / mass : 0;
};

/** Overall action frequencies at the root, weighted by range. */
export const rootActionMix = (result, player = OOP) => {
  const { tree, ranges, average } = result;
  const node = tree.root;
  if (node.player !== player) throw new Error("root does not belong to that player");
  const avg = average.get(node.id);
  const range = ranges[player];
  const a = node.actions.length;

  let mass = 0;
  const totals = new Float64Array(a);
  for (let i = 0; i < range.size; i += 1) {
    const w = range.weight[i];
    mass += w;
    for (let k = 0; k < a; k += 1) totals[k] += w * avg[i * a + k];
  }

  return node.actions.map((action, k) => ({
    action: action.label,
    type: action.type,
    size: action.size ?? 0,
    frequency: mass > 0 ? totals[k] / mass : 0,
  }));
};

/** Strategy for one specific hand at the root. */
export const handStrategy = (result, player, cardA, cardB) => {
  const { tree, ranges, average } = result;
  const node = tree.root;
  const range = ranges[player];
  const avg = average.get(node.id);
  const a = node.actions.length;
  const lo = Math.min(cardA, cardB);
  const hi = Math.max(cardA, cardB);

  for (let i = 0; i < range.size; i += 1) {
    const x = Math.min(range.cardA[i], range.cardB[i]);
    const y = Math.max(range.cardA[i], range.cardB[i]);
    if (x === lo && y === hi) {
      return node.actions.map((action, k) => ({
        action: action.label,
        type: action.type,
        size: action.size ?? 0,
        frequency: avg[i * a + k],
      }));
    }
  }
  return null;
};
