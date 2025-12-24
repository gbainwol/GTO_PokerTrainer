from __future__ import annotations

import time
from pathlib import Path

from pokertrainer.bet_tree import generate_multiway_bet_tree
from pokertrainer.checkpoint import CheckpointManager
from pokertrainer.solver import CFRPlusSolver, SolverConfig


def run_speed_benchmark(iterations: int = 200) -> float:
    root = generate_multiway_bet_tree(
        num_players=3,
        starting_stack=100.0,
        open_sizes=[2.5, 3.0],
        raise_sizes=[6.0],
        call_size=2.5,
    )
    solver = CFRPlusSolver(root, SolverConfig(iterations=iterations))
    start = time.time()
    solver.train()
    duration = time.time() - start
    return duration


def run_ev_error_regression(iterations: int = 200) -> float:
    root = generate_multiway_bet_tree(
        num_players=2,
        starting_stack=50.0,
        open_sizes=[2.0],
        raise_sizes=[4.0],
        call_size=2.0,
    )
    solver = CFRPlusSolver(root, SolverConfig(iterations=iterations))
    solver.train()
    # Use a deeper run as reference for EV error estimation.
    reference_solver = CFRPlusSolver(root, SolverConfig(iterations=iterations * 2))
    reference_solver.train()

    # EV error as absolute difference between root strategies.
    root_id = solver.root.node_id
    current_strategy = solver.average_strategy(root_id)
    reference_strategy = reference_solver.average_strategy(root_id)
    return sum(abs(a - b) for a, b in zip(current_strategy, reference_strategy))


def run_regression_harness(output_dir: str = "benchmarks/results"):
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    speed = run_speed_benchmark()
    ev_error = run_ev_error_regression()
    report_path = Path(output_dir) / "latest.json"
    report_path.write_text(
        f"{{\n  \"speed_seconds\": {speed:.4f},\n  \"ev_error\": {ev_error:.6f}\n}}\n",
        encoding="utf-8",
    )
    print(f"Speed benchmark: {speed:.4f}s")
    print(f"EV error: {ev_error:.6f}")
    print(f"Report written to {report_path}")


if __name__ == "__main__":
    run_regression_harness()
