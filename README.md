# GTO Poker Trainer

This repository implements a training scaffold for counterfactual regret minimization (CFR) variants tailored to poker bet trees. The current prototype focuses on:

- CFR+ and DCFR solvers with optional GPU acceleration via PyTorch.
- Warm-starts, subtree caching, and resumable checkpoints for iterative solves.
- Node locking, multiway bet-tree generation, and service exposure over HTTP (FastAPI) and gRPC.
- Approximate "live" mode for quick reads alongside queued "full" mode solves.
- Benchmarking harness for speed and EV error regression on example ranges/boards.

See `docs/` and `benchmarks/` for additional details.

## Running the solver
The solver is dependency-light by default and uses standard library utilities. Optional extras (FastAPI, gRPC, NumPy/PyTorch) enhance performance and service exposure:

```bash
python -m pip install fastapi uvicorn grpcio googleapis-common-protos
```

If installing packages is not possible, the HTTP/gRPC modules still import successfully and expose stubs so the rest of the codebase can be exercised.

## Benchmarks and regression harness
- `gto_pokertrainer.benchmarks.runner.BenchmarkSuite` runs a small CFR loop and reports iterations/sec and a lightweight EV proxy.
- `RegressionHarness` summarizes board/range coverage for quick regression gating.
