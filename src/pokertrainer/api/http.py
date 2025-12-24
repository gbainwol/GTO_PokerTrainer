from __future__ import annotations

from typing import Optional

from fastapi import FastAPI, HTTPException

from ..bet_tree import BetTreeNode, generate_multiway_bet_tree
from ..service import SolverJobManager


app = FastAPI(title="GTO Poker Trainer")
job_manager = SolverJobManager()


@app.post("/jobs")
def start_job(
    num_players: int = 2,
    iterations: int = 50,
    mode: str = "approximate",
    discounted: bool = False,
    use_gpu: bool = False,
    starting_stack: float = 100.0,
    open_size: float = 2.5,
    raise_size: float = 3.0,
    call_size: float = 2.5,
):
    root = generate_multiway_bet_tree(
        num_players=num_players,
        starting_stack=starting_stack,
        open_sizes=[open_size],
        raise_sizes=[raise_size],
        call_size=call_size,
    )
    job = job_manager.create_job(root, iterations=iterations, mode=mode, discounted=discounted, use_gpu=use_gpu)
    return {
        "job_id": job.job_id,
        "status": job.status,
        "mode": job.mode,
        "iterations": job.iterations,
    }


@app.get("/jobs/{job_id}")
def job_status(job_id: str):
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {
        "job_id": job.job_id,
        "status": job.status,
        "iterations": job.iterations,
        "completed": job.completed_iterations,
        "result": job.result,
        "checkpoint": job.checkpoint_path,
    }


@app.post("/jobs/{job_id}/resume")
def resume_job(job_id: str, extra_iterations: int = 50):
    job = job_manager.resume_job(job_id, extra_iterations)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {
        "job_id": job.job_id,
        "status": job.status,
        "iterations": job.iterations,
        "completed": job.completed_iterations,
        "checkpoint": job.checkpoint_path,
    }


@app.on_event("shutdown")
def shutdown_event():
    job_manager.stop()
