/**
 * River subgame solver: CFR+ over a discretized betting tree, range vs range.
 *
 * This is an actual equilibrium solver, not a heuristic. It builds the betting
 * tree for a completed board, then runs vector-form CFR+ where every node
 * carries a strategy per hand combo rather than per abstract "hand class".
 * Convergence is measured by exploitability (the sum of both players' best
 * responses), which goes to zero at equilibrium - so the quality of a solve is
 * a reported number rather than a claim.
 *
 * Utilities use the split-pot convention: each player is treated as owning half
 * the pot that is already in the middle when the subgame starts. That makes the
 * game zero-sum, which CFR requires, and makes a chopped pot worth exactly 0.
 *
 *   fold by q:  u_p = +(P/2 + c_q),  u_q = -(P/2 + c_q)
 *   showdown:   u_winner = +(P/2 + c),  u_loser = -(P/2 + c),  tie = 0
 *
 * where P is the starting pot and c_x is x's contribution inside the subgame.
 *
 * Card removal is handled exactly. Two players cannot hold the same card, so
 * every terminal value subtracts the opponent combos that share a card with the
 * hand being valued.
 */

import { evaluate } from "./evaluator.js";

export const OOP = 0;
export const IP = 1;

const DECISION = 0;
const TERMINAL_FOLD = 1;
const TERMINAL_SHOWDOWN = 2;

/** Default tree shape. Sizes are fractions of the pot at the time of acting. */
export const DEFAULT_TREE_CONFIG = {
  betSizes: [0.5, 1.0],
  raiseSizes: [1.0],
  maxRaises: 1,
  allowAllIn: true,
  // Optional per-player overrides. Real solvers configure sizings per position;
  // this also lets a test restrict one player to a single line.
  oopBetSizes: null,
  ipBetSizes: null,
};

// ---------------------------------------------------------------------------
// Betting tree
// ---------------------------------------------------------------------------

/**
 * Build the betting tree for a river subgame.
 *
 * The tree depends only on pot, stack, and sizing config - never on the cards -
 * so it is built once and reused across every hand combo.
 */
export const buildTree = (pot, effectiveStack, config = DEFAULT_TREE_CONFIG) => {
  const cfg = { ...DEFAULT_TREE_CONFIG, ...config };
  let nodeCount = 0;

  const betSizesFor = (player) => {
    const override = player === OOP ? cfg.oopBetSizes : cfg.ipBetSizes;
    return override ?? cfg.betSizes;
  };

  /**
   * @param player   whose turn it is
   * @param c0,c1    chips already committed inside the subgame
   * @param facing   amount the acting player must call (0 = may check)
   * @param raises   raises used so far
   * @param checked  the previous player checked (so a check here ends the street)
   */
  const build = (player, c0, c1, facing, raises, checked) => {
    const node = {
      id: nodeCount++,
      type: DECISION,
      player,
      c0,
      c1,
      actions: [],
      children: [],
    };

    const myC = player === OOP ? c0 : c1;
    const oppC = player === OOP ? c1 : c0;
    const remaining = effectiveStack - myC;
    const potNow = pot + c0 + c1;

    const terminalShowdown = (n0, n1) => ({
      id: nodeCount++,
      type: TERMINAL_SHOWDOWN,
      c0: n0,
      c1: n1,
      payoff: pot / 2 + Math.min(n0, n1),
    });

    const terminalFold = (folder, n0, n1) => ({
      id: nodeCount++,
      type: TERMINAL_FOLD,
      folder,
      c0: n0,
      c1: n1,
      // The folder forfeits what it put in; the winner also takes the dead pot.
      payoff: pot / 2 + (folder === OOP ? n0 : n1),
    });

    if (facing === 0) {
      // --- Check ---
      node.actions.push({ label: "Check", type: "check" });
      node.children.push(
        checked
          ? terminalShowdown(c0, c1)
          : build(1 - player, c0, c1, 0, raises, true)
      );

      // --- Bets ---
      const seen = new Set();
      for (const fraction of betSizesFor(player)) {
        const raw = Math.min(remaining, potNow * fraction);
        const size = Math.round(raw * 100) / 100;
        if (size <= 0 || seen.has(size)) continue;
        seen.add(size);
        const [n0, n1] = player === OOP ? [c0 + size, c1] : [c0, c1 + size];
        node.actions.push({ label: `Bet ${fraction}x`, type: "bet", size });
        node.children.push(build(1 - player, n0, n1, size, raises, false));
      }
      // A player configured with no bet sizes has no betting line at all.
      if (cfg.allowAllIn && betSizesFor(player).length > 0 && remaining > 0 && !seen.has(remaining)) {
        const [n0, n1] = player === OOP ? [c0 + remaining, c1] : [c0, c1 + remaining];
        node.actions.push({ label: "All-in", type: "bet", size: remaining });
        node.children.push(build(1 - player, n0, n1, remaining, raises, false));
      }
      return node;
    }

    // --- Facing a bet: fold / call / raise ---
    node.actions.push({ label: "Fold", type: "fold" });
    node.children.push(terminalFold(player, c0, c1));

    const callAmount = Math.min(facing, remaining);
    const [k0, k1] = player === OOP ? [c0 + callAmount, c1] : [c0, c1 + callAmount];
    node.actions.push({ label: "Call", type: "call" });
    node.children.push(terminalShowdown(k0, k1));

    if (raises < cfg.maxRaises) {
      const seen = new Set();
      for (const fraction of cfg.raiseSizes) {
        // Raise to: match the bet, then add a fraction of the resulting pot.
        const target = Math.min(
          remaining,
          callAmount + (potNow + callAmount) * fraction
        );
        const size = Math.round(target * 100) / 100;
        if (size <= callAmount || seen.has(size)) continue;
        seen.add(size);
        const [n0, n1] = player === OOP ? [c0 + size, c1] : [c0, c1 + size];
        node.actions.push({ label: `Raise ${fraction}x`, type: "raise", size });
        // What the opponent now faces is the gap between the two commitments.
        node.children.push(
          build(1 - player, n0, n1, Math.abs(n0 - n1), raises + 1, false)
        );
      }
      if (cfg.allowAllIn && remaining > callAmount && !seen.has(remaining)) {
        const [n0, n1] = player === OOP ? [c0 + remaining, c1] : [c0, c1 + remaining];
        node.actions.push({ label: "All-in", type: "raise", size: remaining });
        node.children.push(
          build(1 - player, n0, n1, Math.abs(n0 - n1), raises + 1, false)
        );
      }
    }

    return node;
  };

  const root = build(OOP, 0, 0, 0, 0, false);
  return { root, nodeCount };
};

// ---------------------------------------------------------------------------
// Ranges
// ---------------------------------------------------------------------------

/**
 * Prepare a player's range for solving: strengths on this board, sorted so the
 * showdown sweep can run in linear time.
 *
 * @param {Int32Array} combos flat [a,b,a,b,...]
 * @param {Float64Array|null} weights per-combo weights (default 1)
 * @param {number[]} board 5 community cards
 */
export const prepareRange = (combos, weights, board) => {
  const n = combos.length / 2;
  const buf = new Int32Array(7);
  for (let i = 0; i < 5; i += 1) buf[2 + i] = board[i];

  const entries = [];
  for (let i = 0; i < n; i += 1) {
    const a = combos[i * 2];
    const b = combos[i * 2 + 1];
    // A combo that collides with the board cannot be held.
    if (board.includes(a) || board.includes(b)) continue;
    buf[0] = a;
    buf[1] = b;
    entries.push({ a, b, strength: evaluate(buf, 7), weight: weights ? weights[i] : 1 });
  }

  // Ascending strength: the showdown sweep accumulates "hands I beat".
  entries.sort((x, y) => x.strength - y.strength);

  const size = entries.length;
  return {
    size,
    cardA: Int32Array.from(entries, (e) => e.a),
    cardB: Int32Array.from(entries, (e) => e.b),
    strength: Int32Array.from(entries, (e) => e.strength),
    weight: Float64Array.from(entries, (e) => e.weight),
  };
};

/**
 * Index mapping so a hand in one range can find the identical combo in the
 * other. Needed because a combo counted under both of its cards during card
 * removal gets subtracted twice and must be added back once.
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
 * Showdown values for every hand of `me`, given the opponent's reach vector.
 *
 * Sweeps both ranges in strength order, maintaining per-card accumulators so
 * blocked opponent combos are excluded exactly. O(n + m) after the one-time
 * sort in prepareRange.
 *
 * value[i] = payoff * (reach of worse hands - reach of better hands)
 */
export const showdownValues = (me, opp, oppReach, payoff, selfIndex, out) => {
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

  for (let i = 0; i < me.size; i += 1) {
    const s = me.strength[i];

    // Advance the pointer over every opponent hand strictly worse than mine.
    while (j < opp.size && opp.strength[j] < s) {
      const w = oppReach[j];
      if (w !== 0) {
        worseSum += w;
        cardWorse[opp.cardA[j]] += w;
        cardWorse[opp.cardB[j]] += w;
      }
      j += 1;
    }

    // Ties contribute 0, but must be excluded from "better".
    let tieSum = 0;
    let tieCardA = 0;
    let tieCardB = 0;
    let tieSelf = 0;
    let k = j;
    while (k < opp.size && opp.strength[k] === s) {
      const w = oppReach[k];
      if (w !== 0) {
        tieSum += w;
        if (opp.cardA[k] === me.cardA[i] || opp.cardB[k] === me.cardA[i]) tieCardA += w;
        if (opp.cardA[k] === me.cardB[i] || opp.cardB[k] === me.cardB[i]) tieCardB += w;
        if (k === selfIndex[i]) tieSelf += w;
      }
      k += 1;
    }

    const a = me.cardA[i];
    const b = me.cardB[i];
    const self = selfIndex[i] >= 0 ? oppReach[selfIndex[i]] : 0;

    // Subtract blocked combos; a combo holding both my cards was removed twice.
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

/** Fold values: the whole (unblocked) opponent range pays, regardless of strength. */
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
// CFR+
// ---------------------------------------------------------------------------

/** Per-decision-node storage: regrets and cumulative strategy, per hand. */
const allocate = (node, ranges, store) => {
  if (node.type !== DECISION) return;
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
};

/** Regret matching (CFR+ keeps regrets non-negative). */
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

/**
 * One CFR traversal returning counterfactual values for `target`.
 * `reach` holds each player's reach-probability vector over their own hands.
 */
const traverse = (node, target, reach, ctx) => {
  const { ranges, store, selfIndex } = ctx;
  const me = ranges[target];
  const opp = ranges[1 - target];
  const oppReach = reach[1 - target];
  const out = new Float64Array(me.size);

  if (node.type === TERMINAL_SHOWDOWN) {
    return showdownValues(me, opp, oppReach, node.payoff, selfIndex[target], out);
  }
  if (node.type === TERMINAL_FOLD) {
    // Positive for the player who did not fold.
    const sign = node.folder === target ? -1 : 1;
    return foldValues(me, opp, oppReach, sign * node.payoff, selfIndex[target], out);
  }

  const data = store.get(node.id);
  updateStrategy(data);
  const { strategy, regret, sum, a } = data;

  if (node.player === target) {
    // Weight each action's value by our own strategy; accumulate regret.
    const childValues = [];
    for (let k = 0; k < a; k += 1) {
      const saved = reach[target];
      const scaled = new Float64Array(saved.length);
      for (let i = 0; i < saved.length; i += 1) scaled[i] = saved[i] * strategy[i * a + k];
      reach[target] = scaled;
      childValues.push(traverse(node.children[k], target, reach, ctx));
      reach[target] = saved;
    }
    for (let i = 0; i < me.size; i += 1) {
      const base = i * a;
      let nodeValue = 0;
      for (let k = 0; k < a; k += 1) nodeValue += strategy[base + k] * childValues[k][i];
      out[i] = nodeValue;
      for (let k = 0; k < a; k += 1) {
        // CFR+: clamp accumulated regret at zero.
        const r = regret[base + k] + childValues[k][i] - nodeValue;
        regret[base + k] = r > 0 ? r : 0;
        sum[base + k] += reach[target][i] * strategy[base + k];
      }
    }
    return out;
  }

  // Opponent node: fold their strategy into their reach and sum the children.
  const oppSize = opp.size;
  for (let k = 0; k < a; k += 1) {
    const saved = reach[1 - target];
    const scaled = new Float64Array(oppSize);
    for (let i = 0; i < oppSize; i += 1) scaled[i] = saved[i] * strategy[i * a + k];
    reach[1 - target] = scaled;
    const childValue = traverse(node.children[k], target, reach, ctx);
    reach[1 - target] = saved;
    for (let i = 0; i < me.size; i += 1) out[i] += childValue[i];
  }
  return out;
};

/**
 * Best response value for `target` against the opponent's current average
 * strategy. Identical traversal, except the target maximises instead of mixing.
 */
const bestResponse = (node, target, reach, ctx) => {
  const { ranges, store, selfIndex, average } = ctx;
  const me = ranges[target];
  const opp = ranges[1 - target];
  const oppReach = reach[1 - target];
  const out = new Float64Array(me.size);

  if (node.type === TERMINAL_SHOWDOWN) {
    return showdownValues(me, opp, oppReach, node.payoff, selfIndex[target], out);
  }
  if (node.type === TERMINAL_FOLD) {
    const sign = node.folder === target ? -1 : 1;
    return foldValues(me, opp, oppReach, sign * node.payoff, selfIndex[target], out);
  }

  const data = store.get(node.id);
  const a = data.a;

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

/** Normalise the accumulated strategy sums into the average strategy. */
const averageStrategy = (store) => {
  const out = new Map();
  for (const [id, data] of store) {
    const { sum, n, a } = data;
    const avg = new Float64Array(n * a);
    for (let i = 0; i < n; i += 1) {
      const base = i * a;
      let total = 0;
      for (let k = 0; k < a; k += 1) total += sum[base + k];
      for (let k = 0; k < a; k += 1) {
        avg[base + k] = total > 0 ? sum[base + k] / total : 1 / a;
      }
    }
    out.set(id, avg);
  }
  return out;
};

/**
 * Exploitability: how much each player could gain by deviating to a best
 * response against the other's average strategy. Zero at equilibrium.
 * Reported in chips per hand, and as a percentage of the pot.
 */
export const computeExploitability = (tree, ranges, store, pot) => {
  const average = averageStrategy(store);
  const ctx = {
    ranges,
    store,
    average,
    selfIndex: [
      buildSelfIndex(ranges[0], ranges[1]),
      buildSelfIndex(ranges[1], ranges[0]),
    ],
  };

  let total = 0;
  for (const target of [OOP, IP]) {
    const reach = [
      Float64Array.from(ranges[0].weight),
      Float64Array.from(ranges[1].weight),
    ];
    const values = bestResponse(tree.root, target, reach, ctx);

    // Counterfactual values carry the opponent's *unnormalised* reach, so the
    // divisor is the total mass of dealable (my hand, their hand) pairs - not
    // just my own range mass. Reusing foldValues with a payoff of 1 gives the
    // blocker-corrected opponent mass behind each of my hands.
    const me = ranges[target];
    const oppMass = foldValues(
      me,
      ranges[1 - target],
      ranges[1 - target].weight,
      1,
      ctx.selfIndex[target],
      new Float64Array(me.size)
    );

    let value = 0;
    let pairMass = 0;
    for (let i = 0; i < me.size; i += 1) {
      value += me.weight[i] * values[i];
      pairMass += me.weight[i] * oppMass[i];
    }
    total += pairMass > 0 ? value / pairMass : 0;
  }

  // At equilibrium the two best-response values sum to zero.
  const exploitable = total / 2;
  return { exploitable, percentOfPot: pot > 0 ? (exploitable / pot) * 100 : 0 };
};

/**
 * Solve a river subgame.
 *
 * @param {object} opts
 * @param {number[]} opts.board            5 community cards (integer codes)
 * @param {Int32Array} opts.oopCombos      flat combo list for out-of-position
 * @param {Int32Array} opts.ipCombos       flat combo list for in-position
 * @param {Float64Array} [opts.oopWeights]
 * @param {Float64Array} [opts.ipWeights]
 * @param {number} opts.pot                pot at the start of the subgame
 * @param {number} opts.effectiveStack
 * @param {number} [opts.iterations]
 * @param {object} [opts.treeConfig]
 * @param {(p:object)=>void} [opts.onProgress]
 */
export const solveRiver = ({
  board,
  oopCombos,
  ipCombos,
  oopWeights = null,
  ipWeights = null,
  pot,
  effectiveStack,
  iterations = 400,
  treeConfig = DEFAULT_TREE_CONFIG,
  onProgress,
}) => {
  if (board.length !== 5) throw new Error("river solver needs a complete 5-card board");

  const ranges = [
    prepareRange(oopCombos, oopWeights, board),
    prepareRange(ipCombos, ipWeights, board),
  ];
  if (!ranges[0].size || !ranges[1].size) {
    throw new Error("both ranges must contain at least one playable combo");
  }

  const tree = buildTree(pot, effectiveStack, treeConfig);
  const store = new Map();
  allocate(tree.root, ranges, store);

  const ctx = {
    ranges,
    store,
    selfIndex: [
      buildSelfIndex(ranges[0], ranges[1]),
      buildSelfIndex(ranges[1], ranges[0]),
    ],
  };

  const started = Date.now();
  for (let iter = 0; iter < iterations; iter += 1) {
    for (const target of [OOP, IP]) {
      const reach = [
        Float64Array.from(ranges[0].weight),
        Float64Array.from(ranges[1].weight),
      ];
      traverse(tree.root, target, reach, ctx);
    }
    if (onProgress && iter % 50 === 0) onProgress({ iteration: iter, iterations });
  }

  const average = averageStrategy(store);
  const exploitability = computeExploitability(tree, ranges, store, pot);

  return {
    tree,
    ranges,
    average,
    exploitability,
    iterations,
    elapsedMs: Date.now() - started,
  };
};

/**
 * Aggregate the root strategy into overall action frequencies, weighted by how
 * much of the range holds each hand. This is the "action mix" a trainer shows.
 */
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

/** Strategy for one specific hand at the root, for "what should I do here". */
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

/**
 * Expected value of the subgame for one player, with both sides playing the
 * solved average strategy. Returned in chips, using the split-pot convention -
 * so winning the entire pot uncontested is worth pot/2, and a spot where both
 * players break even is worth 0.
 */
export const expectedValue = (result, player = OOP) => {
  const { tree, ranges, average } = result;
  const selfIndex = [
    buildSelfIndex(ranges[0], ranges[1]),
    buildSelfIndex(ranges[1], ranges[0]),
  ];

  const walk = (node, reach) => {
    const me = ranges[player];
    const opp = ranges[1 - player];
    const oppReach = reach[1 - player];
    const out = new Float64Array(me.size);

    if (node.type === TERMINAL_SHOWDOWN) {
      return showdownValues(me, opp, oppReach, node.payoff, selfIndex[player], out);
    }
    if (node.type === TERMINAL_FOLD) {
      const sign = node.folder === player ? -1 : 1;
      return foldValues(me, opp, oppReach, sign * node.payoff, selfIndex[player], out);
    }

    const avg = average.get(node.id);
    const a = node.actions.length;
    const actor = node.player;

    for (let k = 0; k < a; k += 1) {
      if (actor === player) {
        // Counterfactual values are conditional on holding the hand, so our own
        // reach never enters them - we weight the children by our mix instead.
        const childValue = walk(node.children[k], reach);
        for (let i = 0; i < me.size; i += 1) out[i] += avg[i * a + k] * childValue[i];
      } else {
        // The opponent's mix does change the values, via their reach.
        const saved = reach[actor];
        const scaled = new Float64Array(saved.length);
        for (let i = 0; i < saved.length; i += 1) scaled[i] = saved[i] * avg[i * a + k];
        reach[actor] = scaled;
        const childValue = walk(node.children[k], reach);
        reach[actor] = saved;
        for (let i = 0; i < me.size; i += 1) out[i] += childValue[i];
      }
    }
    return out;
  };

  const reach = [
    Float64Array.from(ranges[0].weight),
    Float64Array.from(ranges[1].weight),
  ];
  const values = walk(tree.root, reach);

  // Normalise by the mass of dealable hand pairs (see computeExploitability).
  const me = ranges[player];
  const oppMass = foldValues(
    me,
    ranges[1 - player],
    ranges[1 - player].weight,
    1,
    selfIndex[player],
    new Float64Array(me.size)
  );
  let value = 0;
  let pairMass = 0;
  for (let i = 0; i < me.size; i += 1) {
    value += me.weight[i] * values[i];
    pairMass += me.weight[i] * oppMass[i];
  }
  return pairMass > 0 ? value / pairMass : 0;
};
