from __future__ import annotations

import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Dict, Optional

from .bet_tree import BetTreeNode
from .checkpoint import CheckpointManager
from .solver import CFRBaseSolver, CFRPlusSolver, DCFRSolver, SolverConfig


@dataclass
class SolverJob:
    job_id: str
    status: str
    mode: str
    solver: CFRBaseSolver
    iterations: int
    completed_iterations: int = 0
    result: Optional[float] = None
    checkpoint_path: Optional[str] = None
    created_at: float = field(default_factory=time.time)


class SolverJobManager:
    def __init__(self, checkpoint_dir: str = ".checkpoints"):
        self.jobs: Dict[str, SolverJob] = {}
        self.checkpoints = CheckpointManager(checkpoint_dir)
        self.lock = threading.Lock()
        self.worker = threading.Thread(target=self._run_loop, daemon=True)
        self.queue: "list[SolverJob]" = []
        self._stop = threading.Event()
        self.worker.start()

    def stop(self):
        self._stop.set()
        self.worker.join(timeout=1)

    def create_job(
        self,
        root: BetTreeNode,
        iterations: int,
        mode: str = "approximate",
        discounted: bool = False,
        use_gpu: bool = False,
    ) -> SolverJob:
        job_id = str(uuid.uuid4())
        config = SolverConfig(iterations=iterations, use_gpu=use_gpu)
        solver: CFRBaseSolver = DCFRSolver(root, config) if discounted else CFRPlusSolver(root, config)
        job = SolverJob(job_id=job_id, status="queued", mode=mode, solver=solver, iterations=iterations)
        with self.lock:
            self.jobs[job_id] = job
            if mode == "approximate":
                # Approximate mode executes synchronously for fast feedback.
                self._execute_job(job)
            else:
                self.queue.append(job)
        return job

    def _run_loop(self):
        while not self._stop.is_set():
            job = None
            with self.lock:
                if self.queue:
                    job = self.queue.pop(0)
            if job:
                self._execute_job(job)
            else:
                time.sleep(0.05)

    def _execute_job(self, job: SolverJob):
        job.status = "running"
        checkpoint_freq = max(1, job.iterations // 5)
        for iteration in range(1, job.iterations + 1):
            job.solver._cfr(job.solver.root, reach_prob=1.0, player=0, iteration=iteration)
            job.completed_iterations = iteration
            if job.mode == "approximate" and iteration >= job.iterations:
                break
            if iteration % checkpoint_freq == 0:
                path = self.checkpoints.save(job.solver, iteration)
                job.checkpoint_path = str(path)
        job.status = "completed"
        job.result = job.solver._cfr(job.solver.root, reach_prob=1.0, player=0, iteration=job.iterations)
        job.checkpoint_path = job.checkpoint_path or str(self.checkpoints.save(job.solver, job.iterations))

    def get_job(self, job_id: str) -> Optional[SolverJob]:
        with self.lock:
            return self.jobs.get(job_id)

    def resume_job(self, job_id: str, extra_iterations: int) -> Optional[SolverJob]:
        job = self.get_job(job_id)
        if not job:
            return None
        job.status = "running"
        target_iterations = job.completed_iterations + extra_iterations
        for iteration in range(job.completed_iterations + 1, target_iterations + 1):
            job.solver._cfr(job.solver.root, reach_prob=1.0, player=0, iteration=iteration)
            job.completed_iterations = iteration
        job.checkpoint_path = str(self.checkpoints.save(job.solver, job.completed_iterations))
        job.status = "completed"
        job.result = job.solver._cfr(job.solver.root, reach_prob=1.0, player=0, iteration=job.completed_iterations)
        return job
