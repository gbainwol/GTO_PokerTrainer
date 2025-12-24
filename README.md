# GTO Poker Trainer

This repository provides a lightweight CFR+/DCFR solver scaffold for poker bet
trees with optional GPU acceleration, warm starts, subtree caching, and service
endpoints for HTTP and gRPC usage. It also includes benchmarking utilities and
regression harnesses for strategy stability.

## Features
- **CFR+ and DCFR** implementations with optional GPU support when PyTorch is
  available.
- **Warm starts and checkpointing** for resumable runs, including subtree cache
  hydration.
- **Node-locking** and **multiway bet-tree generation** utilities.
- **HTTP (FastAPI)** endpoints for starting, resuming, and inspecting solver
  jobs.
- **gRPC** service definition (with placeholder stubs) for integration with
  other runtimes.
- **Approximate** (low-iteration, immediate) and **full** (queued/background)
  solve modes with periodic checkpointing.
- **Benchmark and regression harness** to track speed and EV error.

## Getting started
Install dependencies (requires internet access):

```bash
python -m pip install -r requirements.txt
```

Generate real protobuf stubs if you need gRPC:

```bash
python -m grpc_tools.protoc -Iproto --python_out=src --grpc_python_out=src proto/solver.proto
```

Run the HTTP server:

```bash
uvicorn pokertrainer.api.http:app --reload
```

Run the gRPC server (after generating stubs):

```bash
python -m pokertrainer.api.grpc_server
```

Execute benchmarks/regression harness:

```bash
python benchmarks/benchmark.py
```

Run tests:

```bash
python -m pytest
```
