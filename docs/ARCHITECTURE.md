# Architecture Overview

## Solvers
- `CFRSolver` implements CFR+ and DCFR style regret updates and supports optional warm starts via provided info sets.
- `SubtreeCache` allows reusing strategies for pre-solved subtrees (node-locking is applied by passing fixed strategies).
- `CheckpointManager` persists solver state for resumable full solves.

## Services
- `server/http.py` exposes asynchronous endpoints for live (quick) and full (queued) solves.
- `server/grpc_server.py` mirrors the interface with lightweight gRPC bindings that degrade gracefully when `grpcio` is unavailable.

## Benchmarks
- `benchmarks/runner.py` offers a basic speed/EV error benchmark and a regression harness stub for plugging in range/board sets.

