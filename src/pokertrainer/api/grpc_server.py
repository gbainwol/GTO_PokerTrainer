from __future__ import annotations

from concurrent import futures
from typing import Optional

from ..bet_tree import generate_multiway_bet_tree
from ..service import SolverJobManager
from . import solver_pb2, solver_pb2_grpc


class SolverService(solver_pb2_grpc.SolverServiceServicer):
    def __init__(self, job_manager: SolverJobManager):
        self.job_manager = job_manager

    def StartJob(self, request: solver_pb2.StartJobRequest, context):  # pragma: no cover - exercised via integration
        root = generate_multiway_bet_tree(
            num_players=request.num_players,
            starting_stack=request.starting_stack,
            open_sizes=[request.open_size],
            raise_sizes=[request.raise_size],
            call_size=request.call_size,
        )
        job = self.job_manager.create_job(
            root,
            iterations=request.iterations,
            mode=request.mode,
            discounted=request.discounted,
            use_gpu=request.use_gpu,
        )
        return solver_pb2.JobResponse(
            job_id=job.job_id,
            status=job.status,
            mode=job.mode,
            iterations=job.iterations,
            completed=job.completed_iterations,
            result=job.result or 0.0,
            checkpoint=job.checkpoint_path or "",
        )

    def JobStatus(self, request: solver_pb2.JobStatusRequest, context):  # pragma: no cover - exercised via integration
        job = self.job_manager.get_job(request.job_id)
        if not job:
            context.set_code(5)  # grpc.StatusCode.NOT_FOUND
            context.set_details("Job not found")
            return solver_pb2.JobResponse()
        return solver_pb2.JobResponse(
            job_id=job.job_id,
            status=job.status,
            mode=job.mode,
            iterations=job.iterations,
            completed=job.completed_iterations,
            result=job.result or 0.0,
            checkpoint=job.checkpoint_path or "",
        )

    def ResumeJob(self, request: solver_pb2.ResumeJobRequest, context):  # pragma: no cover - exercised via integration
        job = self.job_manager.resume_job(request.job_id, extra_iterations=request.extra_iterations)
        if not job:
            context.set_code(5)
            context.set_details("Job not found")
            return solver_pb2.JobResponse()
        return solver_pb2.JobResponse(
            job_id=job.job_id,
            status=job.status,
            mode=job.mode,
            iterations=job.iterations,
            completed=job.completed_iterations,
            result=job.result or 0.0,
            checkpoint=job.checkpoint_path or "",
        )


def serve(host: str = "0.0.0.0", port: int = 50051, job_manager: Optional[SolverJobManager] = None):  # pragma: no cover - requires grpc runtime
    try:
        import grpc
    except Exception as exc:  # pylint: disable=broad-except
        raise RuntimeError("grpcio is not installed; install grpcio and protobuf then regenerate solver_pb2*.py") from exc

    if not hasattr(solver_pb2.StartJobRequest, "__dict__"):
        raise RuntimeError("solver_pb2 is a placeholder; regenerate with grpc_tools.protoc")

    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    manager = job_manager or SolverJobManager()
    solver_pb2_grpc.add_SolverServiceServicer_to_server(SolverService(manager), server)
    server.add_insecure_port(f"{host}:{port}")
    server.start()
    server.wait_for_termination()
