from __future__ import annotations

import asyncio
import uuid
from typing import Dict, Optional

try:
    from fastapi import FastAPI, HTTPException
    from pydantic import BaseModel
except Exception:  # pragma: no cover - fallback for environments without deps
    FastAPI = None  # type: ignore

    class HTTPException(Exception):
        def __init__(self, status_code: int, detail: str) -> None:
            super().__init__(detail)
            self.status_code = status_code
            self.detail = detail

    class BaseModel:  # minimal stub
        def __init__(self, **data):
            for k, v in data.items():
                setattr(self, k, v)

        def dict(self):
            return self.__dict__

    def _placeholder_app():
        raise ImportError("fastapi is not installed; install dependencies to enable the HTTP server")

    class _Dummy:
        def __getattr__(self, item):
            return _placeholder_app

    class FastAPI:  # type: ignore
        def __init__(self, *_, **__):
            self.routes = []

        def post(self, *_args, **_kwargs):
            return lambda func: func

        def get(self, *_args, **_kwargs):
            return lambda func: func


from gto_pokertrainer.solver.cfr import CFRSolver, Mode, SubtreeCache, deal_kuhn


class SolveRequest(BaseModel):
    def __init__(self, iterations: int = 200, mode: Mode = Mode.LIVE):
        super().__init__(iterations=iterations, mode=mode)
        self.iterations = iterations
        self.mode = mode


class SolveResponse(BaseModel):
    def __init__(self, job_id: str, status: str):
        super().__init__(job_id=job_id, status=status)
        self.job_id = job_id
        self.status = status


class StatusResponse(BaseModel):
    def __init__(self, job_id: str, status: str, iterations: int, elapsed_seconds: float):
        super().__init__(job_id=job_id, status=status, iterations=iterations, elapsed_seconds=elapsed_seconds)
        self.job_id = job_id
        self.status = status
        self.iterations = iterations
        self.elapsed_seconds = elapsed_seconds


class TaskRecord:
    def __init__(self) -> None:
        self.status: str = "queued"
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


app = FastAPI(title="GTO PokerTrainer") if FastAPI else None
manager = TaskManager()


if FastAPI:

    @app.post("/solve", response_model=SolveResponse)
    async def solve(request: SolveRequest) -> SolveResponse:  # type: ignore[misc]
        job_id = manager.create()
        record = manager.get(job_id)
        record.status = "running"
        asyncio.create_task(_run_job(job_id, request.iterations, request.mode))
        return SolveResponse(job_id=job_id, status=record.status)


    @app.get("/status/{job_id}", response_model=StatusResponse)
    async def status(job_id: str) -> StatusResponse:  # type: ignore[misc]
        try:
            record = manager.get(job_id)
        except KeyError:
            raise HTTPException(status_code=404, detail="unknown job")
        if record.result is None:
            raise HTTPException(status_code=202, detail=record.status)
        return record.result


    @app.post("/resume/{job_id}", response_model=SolveResponse)
    async def resume(job_id: str, request: SolveRequest) -> SolveResponse:  # type: ignore[misc]
        if job_id not in manager.tasks:
            manager.tasks[job_id] = TaskRecord()
        asyncio.create_task(_run_job(job_id, request.iterations, Mode.FULL))
        record = manager.get(job_id)
        record.status = "running"
        return SolveResponse(job_id=job_id, status=record.status)


async def _run_job(job_id: str, iterations: int, mode: Mode) -> None:
    record = manager.get(job_id)
    solver = CFRSolver()
    result = solver.solve(deal_kuhn(), iterations=iterations, mode=mode, subtree_cache=SubtreeCache())
    record.status = "completed"
    record.result = StatusResponse(
        job_id=job_id, status=record.status, iterations=result.iterations, elapsed_seconds=result.elapsed_seconds
    )

