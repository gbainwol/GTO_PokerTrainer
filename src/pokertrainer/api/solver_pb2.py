"""Lightweight stand-in for generated protobuf messages.

This module enables local development without `protoc` by providing a minimal
API-compatible surface. For production, regenerate this file using:

python -m grpc_tools.protoc -Iproto --python_out=src --grpc_python_out=src proto/solver.proto
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass
class StartJobRequest:
    num_players: int = 2
    iterations: int = 50
    mode: str = "approximate"
    discounted: bool = False
    use_gpu: bool = False
    starting_stack: float = 100.0
    open_size: float = 2.5
    raise_size: float = 3.0
    call_size: float = 2.5


@dataclass
class JobStatusRequest:
    job_id: str = ""


@dataclass
class ResumeJobRequest:
    job_id: str = ""
    extra_iterations: int = 50


@dataclass
class JobResponse:
    job_id: str = ""
    status: str = ""
    mode: str = ""
    iterations: int = 0
    completed: int = 0
    result: Optional[float] = None
    checkpoint: Optional[str] = None


__all__ = [
    "StartJobRequest",
    "JobStatusRequest",
    "ResumeJobRequest",
    "JobResponse",
]
