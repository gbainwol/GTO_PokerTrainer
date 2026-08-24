/**
 * Equity worker.
 *
 * Runs the equity engine off the main thread so a long exact enumeration
 * (a flop against a wide range can be millions of deals) never janks the
 * table. Requests carry an id; the client discards results whose id is stale,
 * which is how rapid board edits avoid queueing up work nobody wants anymore.
 */

import { calculateEquity } from "./equity.js";
import { rangeToCombos } from "./range.js";

self.onmessage = (event) => {
  const { id, payload } = event.data ?? {};
  if (id == null) return;

  const started = performance.now();
  try {
    const {
      hero,
      board = [],
      opponents = 1,
      ranges = null,
      ...options
    } = payload ?? {};

    // Ranges arrive as notation strings; expand them here so the main thread
    // never pays for it. Hero and board cards are blockers.
    const blockers = [...hero, ...board];
    const expanded = ranges
      ? ranges.map((r) => (r ? rangeToCombos(r, blockers) : null))
      : null;

    const result = calculateEquity({
      hero,
      board,
      opponents,
      ranges: expanded,
      ...options,
    });

    self.postMessage({
      id,
      ok: true,
      result: { ...result, elapsedMs: performance.now() - started },
    });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error.message });
  }
};
