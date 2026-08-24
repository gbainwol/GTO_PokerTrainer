/**
 * Solver worker.
 *
 * CFR is far too slow to run on the main thread - a realistic river spot is
 * tens of milliseconds and a deep tree can be seconds. Running it here keeps
 * the table interactive while a solve is in flight.
 */

import { solveRiver, rootActionMix, handStrategy, expectedValue, OOP, IP } from "./solver.js";
import { rangeToCombos } from "./range.js";

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
      iterations = 300,
      treeConfig,
    } = payload ?? {};

    if (!Array.isArray(board) || board.length !== 5) {
      throw new Error("The CFR solver handles complete river boards only.");
    }

    const result = solveRiver({
      board,
      oopCombos: rangeToCombos(oopRange, board),
      ipCombos: rangeToCombos(ipRange, board),
      pot,
      effectiveStack,
      iterations,
      treeConfig,
      onProgress: (p) => self.postMessage({ id, progress: p }),
    });

    // The root belongs to OOP; a hero in position sees its own decision only
    // after OOP acts, so report the root mix plus the hero's own hand strategy.
    const mix = rootActionMix(result, OOP);
    const heroStrategy =
      heroCards && heroCards.length === 2
        ? handStrategy(result, heroPosition, heroCards[0], heroCards[1])
        : null;

    self.postMessage({
      id,
      ok: true,
      result: {
        mix,
        heroStrategy,
        exploitability: result.exploitability,
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
