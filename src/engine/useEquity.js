/**
 * React binding for the equity worker.
 *
 * Owns a single worker for the lifetime of the app, coalesces rapid requests
 * (only the newest matters when someone is dragging a board around), and falls
 * back to synchronous computation if Workers are unavailable.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { calculateEquity } from "./equity.js";
import { rangeToCombos } from "./range.js";

/** Lazily created shared worker client. */
const createClient = () => {
  let worker = null;
  let nextId = 1;
  const pending = new Map();

  const ensure = () => {
    if (worker) return worker;
    try {
      worker = new Worker(new URL("./equity.worker.js", import.meta.url), {
        type: "module",
      });
      worker.onmessage = (event) => {
        const { id, ok, result, error } = event.data ?? {};
        const entry = pending.get(id);
        if (!entry) return; // superseded or cancelled
        pending.delete(id);
        if (ok) entry.resolve(result);
        else entry.reject(new Error(error));
      };
      worker.onerror = (event) => {
        pending.forEach(({ reject }) => reject(new Error(event.message ?? "worker error")));
        pending.clear();
      };
    } catch {
      worker = null; // no worker support - caller falls back
    }
    return worker;
  };

  return {
    /** @returns {Promise<object>} */
    request(payload) {
      const instance = ensure();
      if (!instance) {
        // Synchronous fallback. Expand ranges the way the worker would.
        const blockers = [...payload.hero, ...(payload.board ?? [])];
        const ranges = payload.ranges
          ? payload.ranges.map((r) => (r ? rangeToCombos(r, blockers) : null))
          : null;
        return Promise.resolve(calculateEquity({ ...payload, ranges }));
      }
      const id = nextId;
      nextId += 1;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        instance.postMessage({ id, payload });
      });
    },
    /** Drop a pending request's callbacks; the worker result is ignored. */
    cancel(id) {
      pending.delete(id);
    },
    terminate() {
      worker?.terminate();
      worker = null;
      pending.clear();
    },
    get pendingCount() {
      return pending.size;
    },
  };
};

let sharedClient = null;
const getClient = () => {
  if (!sharedClient) sharedClient = createClient();
  return sharedClient;
};

const IDLE = { status: "idle", equity: null, result: null, error: null };

/**
 * Compute equity for a spot, off the main thread.
 *
 * Pass `null` for `spot` to stay idle. The hook recomputes whenever the spot's
 * identity changes and ignores results that arrive after a newer request.
 *
 * @param {object|null} spot
 * @param {number[]} spot.hero
 * @param {number[]} [spot.board]
 * @param {number}   [spot.opponents]
 * @param {(string|null)[]} [spot.ranges] range notation per opponent
 * @returns {{status:string, equity:number|null, result:object|null, error:string|null}}
 */
export const useEquity = (spot) => {
  const [state, setState] = useState(IDLE);
  const generation = useRef(0);

  // Serialize the spot so the effect only refires on a real change, not on a
  // new array identity for the same cards.
  const key = useMemo(() => (spot ? JSON.stringify(spot) : null), [spot]);

  useEffect(() => {
    if (!key) {
      setState(IDLE);
      return undefined;
    }
    const payload = JSON.parse(key);
    generation.current += 1;
    const mine = generation.current;

    setState((prev) => ({ ...prev, status: "computing", error: null }));

    let cancelled = false;
    getClient()
      .request(payload)
      .then((result) => {
        // Ignore anything superseded by a newer spot.
        if (cancelled || mine !== generation.current) return;
        setState({
          status: "ready",
          equity: result.equity,
          result,
          error: null,
        });
      })
      .catch((error) => {
        if (cancelled || mine !== generation.current) return;
        setState({ status: "error", equity: null, result: null, error: error.message });
      });

    return () => {
      cancelled = true;
    };
  }, [key]);

  return state;
};

/** Imperative one-shot equity request, for event handlers rather than render. */
export const useEquityRequest = () =>
  useCallback((payload) => getClient().request(payload), []);
