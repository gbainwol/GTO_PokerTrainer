/**
 * Solver worker.
 *
 * CFR is far too slow to run on the main thread - a realistic river spot is
 * tens of milliseconds and a deep tree can be seconds. Running it here keeps
 * the table interactive while a solve is in flight.
 */

import {
  solveSubgame, rootActionMix, actionMixAt, handStrategyAt, firstNodeFor,
  expectedValue, OOP, IP,
} from "./solver.js";
import { rangeToCombos } from "./range.js";

/**
 * Warm the JIT before the first real request.
 *
 * A cold V8 isolate ran the same turn solve in ~5.4s that a warm one does in
 * ~1.3s. This exercises every hot path - betting tree, chance node, showdown
 * sweep, regret matching - on a tiny subgame for a few milliseconds, so the
 * user's first solve is not the one paying for optimisation.
 */
const warmUp = () => {
  try {
    // Big enough to trigger V8's optimising tiers on the real hot loops.
    // A token-sized warmup did not: three identical flop solves in one worker
    // took 15.8s, 6.7s, then 4.1s, because the first was still interpreting.
    // This costs a couple of hundred milliseconds at worker startup, before
    // the user has asked for anything.
    const combos = (start) => {
      const out = [];
      for (let i = 0; i < 60; i += 1) out.push(start + (i % 20) * 2, start + 1 + (i % 19) * 2);
      return Int32Array.from(out.map((c) => c % 52));
    };
    solveSubgame({
      board: [0, 5, 10],
      oopCombos: combos(12),
      ipCombos: combos(21),
      pot: 10,
      effectiveStack: 20,
      iterations: 40,
      treeConfig: {
        betSizes: [0.66], raiseSizes: [], maxRaises: 0, allowAllIn: false,
        perStreet: { 4: { betSizes: [0.75] }, 5: { betSizes: [0.75] } },
      },
      runouts: { 4: 3, 5: 2 },
    });
  } catch {
    // Warmup is best-effort; a failure here must never break real requests.
  }
};

warmUp();

self.onmessage = (event) => {
  const { id, payload } = event.data ?? {};
  if (id == null) return;

  try {
    const {
      board,
      heroCards,
      heroPosition = OOP,
      oopRange,
      ipRange,
      pot,
      effectiveStack,
      iterations,
      treeConfig,
      runouts,
    } = payload ?? {};

    if (!Array.isArray(board) || ![3, 4, 5].includes(board.length)) {
      throw new Error("The solver needs a flop, turn, or river board.");
    }

    // Each earlier street multiplies the work by its runouts, so the default
    // iteration count and tree shape get leaner the deeper the subgame.
    const defaults = {
      5: { iterations: 300, tree: { betSizes: [0.5, 1.0], raiseSizes: [1.0], maxRaises: 1 } },
      4: { iterations: 100, tree: { betSizes: [0.75], raiseSizes: [], maxRaises: 0, allowAllIn: false,
                                    perStreet: { 5: { betSizes: [0.75] } } } },
      // Flop: a coarser runout sample buys far more CFR iterations for the
      // same wall clock, and iterations matter more for solve quality than
      // runout count does at this resolution.
      3: { iterations: 220, tree: { betSizes: [0.66], raiseSizes: [], maxRaises: 0, allowAllIn: false,
                                   perStreet: { 4: { betSizes: [0.75] }, 5: { betSizes: [0.75] } } } },
    }[board.length];

    const result = solveSubgame({
      board,
      oopCombos: rangeToCombos(oopRange, board),
      ipCombos: rangeToCombos(ipRange, board),
      pot,
      effectiveStack,
      iterations: iterations ?? defaults.iterations,
      treeConfig: treeConfig ?? defaults.tree,
      runouts: runouts ?? (board.length === 3 ? { 4: 6, 5: 4 } : undefined),
      onProgress: (p) => self.postMessage({ id, progress: p }),
    });

    // The root always belongs to OOP, so an in-position hero's own decision is
    // one level down - report the mix at whichever node is actually theirs.
    const heroNode = firstNodeFor(result.tree, heroPosition);
    const mix = actionMixAt(result, heroNode, heroPosition) ?? rootActionMix(result, OOP);
    const heroStrategy =
      heroCards && heroCards.length === 2
        ? handStrategyAt(result, heroNode, heroPosition, heroCards[0], heroCards[1])
        : null;

    self.postMessage({
      id,
      ok: true,
      result: {
        mix,
        heroStrategy,
        exploitability: result.exploitability,
        exact: result.exact,
        runouts: result.runouts,
        street: result.street,
        evOOP: expectedValue(result, OOP),
        evIP: expectedValue(result, IP),
        iterations: result.iterations,
        elapsedMs: result.elapsedMs,
        nodes: result.tree.nodeCount,
        oopCombos: result.ranges[OOP].size,
        ipCombos: result.ranges[IP].size,
      },
    });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error.message });
  }
};
