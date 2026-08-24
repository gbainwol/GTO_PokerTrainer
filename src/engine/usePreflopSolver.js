/**
 * React binding for the multiway preflop solver worker.
 *
 * Same shape as useSolver: one persistent worker, imperative requests, stale
 * responses discarded. The worker caches solves by table shape, so the first
 * request at a given player count and stack depth is slow and the rest are
 * effectively free.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export const usePreflopSolver = () => {
  const workerRef = useRef(null);
  const nextId = useRef(1);
  const pending = useRef(new Map());
  const [state, setState] = useState({
    status: "idle",
    result: null,
    error: null,
    progress: null,
  });

  const ensureWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;
    const worker = new Worker(new URL("./preflop.worker.js", import.meta.url), {
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
        reject(new Error(event.message ?? "preflop solver failed"))
      );
      pending.current.clear();
    };
    workerRef.current = worker;
    return worker;
  }, []);

  useEffect(() => {
    ensureWorker();
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      pending.current.clear();
    };
  }, [ensureWorker]);

  const solve = useCallback(
    (payload) => {
      const worker = ensureWorker();
      const id = nextId.current;
      nextId.current += 1;
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

  return { ...state, solve };
};
