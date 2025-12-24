from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Dict, List

from gto_pokertrainer.solver.cfr import CFRSolver, Mode, deal_kuhn


@dataclass
class BenchmarkResult:
    speed_iterations_per_sec: float
    ev_error: float
    iterations: int
    elapsed: float


class BenchmarkSuite:
    def __init__(self, iterations: int = 200) -> None:
        self.iterations = iterations

    def run(self) -> BenchmarkResult:
        solver = CFRSolver()
        start = time.time()
        result = solver.solve(deal_kuhn(), iterations=self.iterations, mode=Mode.LIVE)
        elapsed = time.time() - start
        speed = result.iterations / max(elapsed, 1e-6)
        # Kuhn poker nash value is 0; use deviation of first player utility estimate.
        sample_state = deal_kuhn()
        first_info_key = sample_state.information_set_key(0)
        ev_error = abs(result.average_strategy.get(first_info_key, [0.5, 0.5])[0] - 0.5)
        return BenchmarkResult(speed_iterations_per_sec=speed, ev_error=ev_error, iterations=result.iterations, elapsed=elapsed)


class RegressionHarness:
    def __init__(self, boards: List[str], ranges: Dict[str, List[str]]) -> None:
        self.boards = boards
        self.ranges = ranges

    def summary(self) -> Dict[str, int]:
        return {"boards": len(self.boards), "range_profiles": len(self.ranges)}

