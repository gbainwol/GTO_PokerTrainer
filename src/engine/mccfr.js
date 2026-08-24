/**
 * Monte Carlo CFR (external sampling), for games with more than two players.
 *
 * The vector solver in solver.js is heads-up by construction: it carries one
 * reach vector per player and sweeps two ranges against each other at
 * showdown. That does not generalise to a six-way pot, where card removal runs
 * across every live range at once and side pots make the payoffs non-uniform.
 *
 * External sampling handles this instead. On each traversal one player is the
 * traverser: chance is sampled once, every *other* player's action is sampled
 * from their current strategy, and only the traverser's own actions are
 * expanded. Regret is accumulated on the traverser's information sets, and the
 * average strategy on everyone else's. Cost per traversal is therefore linear
 * in the tree depth rather than exponential in the number of players.
 *
 * The core is game-agnostic: give it the `Game` interface below and it will
 * solve it. That is what lets the implementation be validated against Kuhn
 * poker, whose equilibrium is known in closed form, before being pointed at
 * hold'em where it is not.
 *
 * @typedef {object} Game
 * @property {number}   numPlayers
 * @property {(rng: () => number) => any} root      sample a starting state
 * @property {(s: any) => boolean}        isTerminal
 * @property {(s: any, p: number) => number} utility  payoff to p, zero-sum
 * @property {(s: any) => number}         currentPlayer
 * @property {(s: any) => string}         infoSet   what the actor can see
 * @property {(s: any) => any[]}          actions
 * @property {(s: any, a: any) => any}    next
 */

/** xorshift32: small, fast, and seedable so a solve is reproducible. */
export const makeRng = (seed) => {
  let s = seed >>> 0 || 0x9e3779b9;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0x100000000;
  };
};

/** Regret matching over non-negative regrets, uniform when none are positive. */
const regretMatch = (regret, out) => {
  const n = regret.length;
  let total = 0;
  for (let i = 0; i < n; i += 1) {
    const r = regret[i];
    if (r > 0) total += r;
  }
  if (total > 0) {
    for (let i = 0; i < n; i += 1) out[i] = regret[i] > 0 ? regret[i] / total : 0;
  } else {
    for (let i = 0; i < n; i += 1) out[i] = 1 / n;
  }
  return out;
};

const sampleIndex = (probs, roll) => {
  let acc = 0;
  for (let i = 0; i < probs.length; i += 1) {
    acc += probs[i];
    if (roll < acc) return i;
  }
  return probs.length - 1;
};

/** Per-information-set storage, created on first visit. */
const nodeFor = (store, key, actionCount) => {
  let node = store.get(key);
  if (!node) {
    node = {
      regret: new Float64Array(actionCount),
      strategySum: new Float64Array(actionCount),
      strategy: new Float64Array(actionCount).fill(1 / actionCount),
      visits: 0,
    };
    store.set(key, node);
  }
  return node;
};

/**
 * One external-sampling traversal.
 *
 * Returns the traverser's expected utility from this state, given that every
 * other player's action along the way was sampled from their own strategy.
 */
const traverse = (game, state, traverser, store, rng) => {
  if (game.isTerminal(state)) return game.utility(state, traverser);

  const player = game.currentPlayer(state);
  const actions = game.actions(state);

  // A forced or single-option decision is not a decision - do not create an
  // information set for it, or the strategy fills up with meaningless nodes.
  if (actions.length === 1) {
    return traverse(game, game.next(state, actions[0]), traverser, store, rng);
  }

  const key = game.infoSet(state);
  const node = nodeFor(store, key, actions.length);
  const strategy = regretMatch(node.regret, node.strategy);

  if (player !== traverser) {
    // Opponent: sample one action, and record it toward their average strategy.
    for (let i = 0; i < actions.length; i += 1) node.strategySum[i] += strategy[i];
    node.visits += 1;
    const pick = sampleIndex(strategy, rng());
    return traverse(game, game.next(state, actions[pick]), traverser, store, rng);
  }

  // Traverser: expand every action and accumulate counterfactual regret.
  const utilities = new Float64Array(actions.length);
  let nodeUtility = 0;
  for (let i = 0; i < actions.length; i += 1) {
    utilities[i] = traverse(game, game.next(state, actions[i]), traverser, store, rng);
    nodeUtility += strategy[i] * utilities[i];
  }
  for (let i = 0; i < actions.length; i += 1) {
    // CFR+ style flooring: clamping regret at zero converges faster and keeps
    // a bad early sample from poisoning an action for thousands of iterations.
    const r = node.regret[i] + utilities[i] - nodeUtility;
    node.regret[i] = r > 0 ? r : 0;
  }
  node.visits += 1;
  return nodeUtility;
};

/**
 * Solve a game by external-sampling MCCFR.
 *
 * @param {Game} game
 * @param {object} [opts]
 * @param {number} [opts.iterations]
 * @param {number} [opts.seed]
 * @param {(p: {iteration: number, iterations: number}) => void} [opts.onProgress]
 * @returns {{store: Map, iterations: number, infoSets: number, elapsedMs: number}}
 */
export const solveMCCFR = (game, { iterations = 20000, seed = 0x1234abcd, onProgress } = {}) => {
  const rng = makeRng(seed);
  const store = new Map();
  const started = Date.now();

  for (let iter = 0; iter < iterations; iter += 1) {
    // Every player traverses each iteration, so no seat is under-trained.
    for (let p = 0; p < game.numPlayers; p += 1) {
      traverse(game, game.root(rng), p, store, rng);
    }
    if (onProgress && iter % 2000 === 0) onProgress({ iteration: iter, iterations });
  }

  return {
    store,
    iterations,
    infoSets: store.size,
    elapsedMs: Date.now() - started,
  };
};

/**
 * Normalised average strategy per information set.
 * The average, not the current strategy, is what converges to equilibrium.
 */
export const averageStrategy = (store) => {
  const out = new Map();
  for (const [key, node] of store) {
    const n = node.strategySum.length;
    let total = 0;
    for (let i = 0; i < n; i += 1) total += node.strategySum[i];
    const avg = new Float64Array(n);
    for (let i = 0; i < n; i += 1) avg[i] = total > 0 ? node.strategySum[i] / total : 1 / n;
    out.set(key, avg);
  }
  return out;
};

/**
 * Expected utility per player under the average strategy, by Monte Carlo.
 *
 * Multiway exploitability needs a best response per player over the whole
 * tree, which is far more expensive than the solve itself. Sampled EV is the
 * practical measure here, and it comes with a standard error so the noise is
 * visible rather than implied.
 */
export const evaluateStrategy = (game, store, { samples = 20000, seed = 0xfeed } = {}) => {
  const rng = makeRng(seed);
  const average = averageStrategy(store);
  const sums = new Float64Array(game.numPlayers);
  const sumSquares = new Float64Array(game.numPlayers);

  for (let s = 0; s < samples; s += 1) {
    let state = game.root(rng);
    while (!game.isTerminal(state)) {
      const actions = game.actions(state);
      if (actions.length === 1) {
        state = game.next(state, actions[0]);
        continue;
      }
      const avg = average.get(game.infoSet(state));
      // An unvisited information set has no learned strategy; play uniformly.
      const probs = avg ?? new Float64Array(actions.length).fill(1 / actions.length);
      state = game.next(state, actions[sampleIndex(probs, rng())]);
    }
    for (let p = 0; p < game.numPlayers; p += 1) {
      const u = game.utility(state, p);
      sums[p] += u;
      sumSquares[p] += u * u;
    }
  }

  return Array.from({ length: game.numPlayers }, (_, p) => {
    const mean = sums[p] / samples;
    const variance = Math.max(0, sumSquares[p] / samples - mean * mean);
    const stdErr = Math.sqrt(variance / samples);
    return { player: p, ev: mean, stdErr, confidence95: 1.96 * stdErr };
  });
};

/*
 * Deliberately not provided: a generic sampled "best response".
 *
 * The obvious implementation - walk the tree, maximise over the traverser's
 * actions, sample everyone else - is wrong. It picks the best action *after*
 * seeing how that branch's sampling happened to turn out, which is a
 * clairvoyant best response and biased upward. On Kuhn it reported a 0.44
 * chip/hand gain against a strategy that is provably within 0.001 of optimal.
 *
 * A correct best response has to maximise expected value per information set,
 * which means either enumerating the game (see the exact Kuhn best response in
 * mccfr.test.mjs) or a proper local-best-response procedure. For multiway
 * hold'em neither is cheap, so `evaluateStrategy` reports sampled EV with a
 * standard error and makes no equilibrium-distance claim.
 */

/** Readable dump of the solved strategy, for tests and debugging. */
export const describeStrategy = (store, { minVisits = 0, limit = Infinity } = {}) => {
  const average = averageStrategy(store);
  const rows = [];
  for (const [key, node] of store) {
    if (node.visits < minVisits) continue;
    rows.push({ key, visits: node.visits, strategy: Array.from(average.get(key)) });
  }
  rows.sort((a, b) => b.visits - a.visits);
  return rows.slice(0, limit);
};
