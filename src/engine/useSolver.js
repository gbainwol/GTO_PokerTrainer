/**
 * React binding for the CFR solver worker.
 *
 * Imperative rather than reactive: solving is expensive, so it runs when the
 * user asks for it rather than on every state change.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/** Default ranges when the caller has not configured them for the spot. */
export const DEFAULT_OOP_RANGE = "22+,A2s+,K9s+,QTs+,JTs,T9s,ATo+,KQo";
export const DEFAULT_IP_RANGE = "22+,A2s+,K8s+,Q9s+,J9s+,T8s+,97s+,A9o+,KTo+,QJo";

export const useSolver = () => {
  const workerRef = useRef(null);
  const nextId = useRef(1);
  const pending = useRef(new Map());
  const [state, setState] = useState({
    status: "idle",
    result: null,
    error: null,
    progress: null,
  });

  // Spin the worker up on mount rather than on first click, so its warmup
  // runs while the user is still looking at the table.
  useEffect(() => {
    ensureWorker();
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      pending.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ensureWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;
    const worker = new Worker(new URL("./solver.worker.js", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (event) => {
      const { id, ok, result, error, progress } = event.data ?? {};
      if (progress) {
        setState((prev) => ({ ...prev, progress }));
        return;
      }
      const entry = pending.current.get(id);
      if (!entry) return; // superseded
      pending.current.delete(id);
      if (ok) entry.resolve(result);
      else entry.reject(new Error(error));
    };
    worker.onerror = (event) => {
      pending.current.forEach(({ reject }) =>
        reject(new Error(event.message ?? "solver worker failed"))
      );
      pending.current.clear();
    };
    workerRef.current = worker;
    return worker;
  }, []);

  const solve = useCallback(
    (payload) => {
      const worker = ensureWorker();
      const id = nextId.current;
      nextId.current += 1;

      // Anything still in flight is stale the moment a new solve starts.
      pending.current.clear();
      setState({ status: "solving", result: null, error: null, progress: null });

      return new Promise((resolve, reject) => {
        pending.current.set(id, { resolve, reject });
        worker.postMessage({ id, payload });
      })
        .then((result) => {
          setState({ status: "ready", result, error: null, progress: null });
          return result;
        })
        .catch((error) => {
          setState({ status: "error", result: null, error: error.message, progress: null });
          throw error;
        });
    },
    [ensureWorker]
  );

  const reset = useCallback(() => {
    pending.current.clear();
    setState({ status: "idle", result: null, error: null, progress: null });
  }, []);

  return { ...state, solve, reset };
};
