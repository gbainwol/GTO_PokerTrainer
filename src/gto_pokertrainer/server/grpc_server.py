from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass
from typing import Dict, Optional

from gto_pokertrainer.solver.cfr import CFRSolver, Mode, SubtreeCache, deal_kuhn

try:
    import grpc  # type: ignore
    from google.protobuf import empty_pb2  # type: ignore
except Exception:  # pragma: no cover
    grpc = None
    empty_pb2 = None


@dataclass
class SolveRequest:
    iterations: int = 200
    mode: str = Mode.LIVE.value


@dataclass
class SolveResponse:
    job_id: str
    status: str


@dataclass
class StatusRequest:
    job_id: str


@dataclass
class StatusResponse:
    job_id: str
    status: str
    iterations: int
    elapsed_seconds: float


class TaskRecord:
    def __init__(self) -> None:
        self.status = "queued"
        self.result: Optional[StatusResponse] = None


class TaskManager:
    def __init__(self) -> None:
        self.tasks: Dict[str, TaskRecord] = {}

    def create(self) -> str:
        job_id = uuid.uuid4().hex
        self.tasks[job_id] = TaskRecord()
        return job_id

    def get(self, job_id: str) -> TaskRecord:
        if job_id not in self.tasks:
            raise KeyError(job_id)
        return self.tasks[job_id]


class SolverService:
    def __init__(self, manager: TaskManager) -> None:
        self.manager = manager

    async def Solve(self, request: SolveRequest) -> SolveResponse:  # type: ignore[override]
        job_id = self.manager.create()
        record = self.manager.get(job_id)
        record.status = "running"
        asyncio.create_task(self._run_job(job_id, request.iterations, Mode(request.mode)))
        return SolveResponse(job_id=job_id, status=record.status)

    async def Status(self, request: StatusRequest) -> StatusResponse:  # type: ignore[override]
        record = self.manager.get(request.job_id)
        if record.result is None:
            return StatusResponse(job_id=request.job_id, status=record.status, iterations=0, elapsed_seconds=0.0)
        return record.result

    async def Resume(self, request: SolveRequest) -> SolveResponse:  # type: ignore[override]
        job_id = self.manager.create()
        record = self.manager.get(job_id)
        record.status = "running"
        asyncio.create_task(self._run_job(job_id, request.iterations, Mode.FULL))
        return SolveResponse(job_id=job_id, status=record.status)

    async def _run_job(self, job_id: str, iterations: int, mode: Mode) -> None:
        record = self.manager.get(job_id)
        solver = CFRSolver()
        result = solver.solve(deal_kuhn(), iterations=iterations, mode=mode, subtree_cache=SubtreeCache())
        record.status = "completed"
        record.result = StatusResponse(
            job_id=job_id, status=record.status, iterations=result.iterations, elapsed_seconds=result.elapsed_seconds
        )


async def start_server(host: str = "0.0.0.0", port: int = 50051) -> None:
    if grpc is None:  # pragma: no cover
        raise ImportError("grpc is not installed; install dependencies to run the server")
    server = grpc.aio.server()
    manager = TaskManager()
    service = SolverService(manager)

    # Manual generic handler keeps code dependency-light.
    generic_handler = grpc.method_handlers_generic_handler(
        "gto.Solver",
        {
            "Solve": grpc.unary_unary_rpc_method_handler(service.Solve),
            "Status": grpc.unary_unary_rpc_method_handler(service.Status),
            "Resume": grpc.unary_unary_rpc_method_handler(service.Resume),
        },
    )
    server.add_generic_rpc_handlers((generic_handler,))
    server.add_insecure_port(f"{host}:{port}")
    await server.start()
    await server.wait_for_termination()

