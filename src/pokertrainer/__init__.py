"""High-level package for GTO Poker Trainer primitives.

This package contains solver implementations (CFR+, DCFR), bet tree generation,
checkpointing utilities, and service endpoints (HTTP/gRPC) to operate solvers
in both approximate and full modes.
"""

__all__ = [
    "bet_tree",
    "solver",
    "checkpoint",
]
