from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from .solver import CFRBaseSolver, SolverCheckpoint


class CheckpointManager:
    """Lightweight checkpoint persistence helper.

    Checkpoints are stored as JSON files, making them portable across CPU/GPU
    environments and easy to inspect. The manager supports resumable checkpoints
    by always writing to a temporary file and then atomically replacing the
    target path.
    """

    def __init__(self, directory: str):
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)

    def checkpoint_path(self, iteration: int) -> Path:
        return self.directory / f"checkpoint_{iteration:06d}.json"

    def save(self, solver: CFRBaseSolver, iteration: int) -> Path:
        path = self.checkpoint_path(iteration)
        tmp_path = path.with_suffix(".tmp")
        solver.save_checkpoint(tmp_path, iteration)
        tmp_path.replace(path)
        return path

    def latest(self) -> Optional[Path]:
        checkpoints = sorted(self.directory.glob("checkpoint_*.json"))
        return checkpoints[-1] if checkpoints else None

    def load_latest(self) -> Optional[SolverCheckpoint]:
        latest = self.latest()
        if not latest:
            return None
        with latest.open("r", encoding="utf-8") as fp:
            return SolverCheckpoint.from_json(fp.read())
