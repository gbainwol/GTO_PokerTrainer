"""Stub gRPC service definitions.

Regenerate with grpc_tools when available. The runtime server validates whether
real protobuf classes are present and raises a helpful error otherwise.
"""

from __future__ import annotations

from typing import Any

from . import solver_pb2


class SolverServiceServicer:  # pragma: no cover - placeholder
    def StartJob(self, request: solver_pb2.StartJobRequest, context: Any):
        raise NotImplementedError()

    def JobStatus(self, request: solver_pb2.JobStatusRequest, context: Any):
        raise NotImplementedError()

    def ResumeJob(self, request: solver_pb2.ResumeJobRequest, context: Any):
        raise NotImplementedError()


def add_SolverServiceServicer_to_server(servicer: SolverServiceServicer, server: Any):  # pragma: no cover - placeholder
    if hasattr(server, "add_generic_rpc_handlers"):
        # Generic handler for environments without generated code.
        server.add_generic_rpc_handlers([])
