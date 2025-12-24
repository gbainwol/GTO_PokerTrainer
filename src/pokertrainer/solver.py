from __future__ import annotations

import json
import os
from dataclasses import dataclass, asdict
from typing import Dict, List, Optional, Tuple

from .bet_tree import BetTreeNode

try:  # GPU acceleration is optional
    import torch
except ImportError:  # pragma: no cover - we handle CPU-only environments
    torch = None


@dataclass
class SolverConfig:
    iterations: int = 100
    discount: float = 1.5  # Used for DCFR style discounting
    cache_subtrees: bool = True
    use_gpu: bool = False


@dataclass
class NodeStatistics:
    regrets: List[float]
    strategy_sums: List[float]

    def to_device(self, device: Optional["torch.device"]) -> "NodeStatistics":
        if torch is None or device is None:
            return self
        return NodeStatistics(
            regrets=[float(r) for r in torch.tensor(self.regrets, device=device).tolist()],
            strategy_sums=[float(s) for s in torch.tensor(self.strategy_sums, device=device).tolist()],
        )


@dataclass
class SolverCheckpoint:
    stats: Dict[str, NodeStatistics]
    iteration: int

    def to_json(self) -> str:
        serializable = {node: asdict(stat) for node, stat in self.stats.items()}
        return json.dumps({"iteration": self.iteration, "stats": serializable}, indent=2)

    @classmethod
    def from_json(cls, data: str) -> "SolverCheckpoint":
        payload = json.loads(data)
        stats = {node: NodeStatistics(**vals) for node, vals in payload["stats"].items()}
        return cls(stats=stats, iteration=payload["iteration"])


class CFRBaseSolver:
    def __init__(self, root: BetTreeNode, config: SolverConfig):
        self.root = root
        self.config = config
        self.stats: Dict[str, NodeStatistics] = {}
        self.cache: Dict[str, Tuple[float, List[float]]] = {}
        self.device = self._select_device()

    def _select_device(self):
        if torch is None or not self.config.use_gpu:
            return None
        if torch.cuda.is_available():
            return torch.device("cuda")
        return torch.device("cpu")

    def _get_stats(self, node: BetTreeNode) -> NodeStatistics:
        if node.node_id not in self.stats:
            action_count = max(1, len(node.children))
            self.stats[node.node_id] = NodeStatistics(
                regrets=[0.0 for _ in range(action_count)],
                strategy_sums=[0.0 for _ in range(action_count)],
            )
        return self.stats[node.node_id]

    def regret_matching(self, regrets: List[float]) -> List[float]:
        positives = [max(0.0, r) for r in regrets]
        normalizer = sum(positives)
        if normalizer <= 0:
            return [1.0 / len(positives) for _ in positives]
        return [r / normalizer for r in positives]

    def _action_evs(self, node: BetTreeNode) -> List[float]:
        return [child.terminal_ev or 0.0 for child in node.children.values()]

    def train(self) -> SolverCheckpoint:
        for iteration in range(1, self.config.iterations + 1):
            self._cfr(self.root, reach_prob=1.0, player=0, iteration=iteration)
        return SolverCheckpoint(stats=self.stats, iteration=self.config.iterations)

    def _cfr(self, node: BetTreeNode, reach_prob: float, player: int, iteration: int) -> float:
        if node.is_terminal():
            return node.terminal_ev or 0.0

        if self.config.cache_subtrees and node.node_id in self.cache:
            cached = self.cache[node.node_id]
            return cached[0]

        stats = self._get_stats(node)

        if node.locked_strategy:
            strategy = node.locked_strategy
        else:
            strategy = self.regret_matching(stats.regrets)

        action_evs: List[float] = []
        for action, child in node.children.items():
            action_ev = self._cfr(child, reach_prob * strategy[len(action_evs)], player + 1, iteration)
            action_evs.append(action_ev)

        node_value = sum(s * ev for s, ev in zip(strategy, action_evs))
        regrets = [ev - node_value for ev in action_evs]

        self._update_regrets(stats, regrets, iteration)
        for i, prob in enumerate(strategy):
            stats.strategy_sums[i] += reach_prob * prob

        if self.config.cache_subtrees:
            self.cache[node.node_id] = (node_value, strategy)

        return node_value

    def _update_regrets(self, stats: NodeStatistics, regrets: List[float], iteration: int):
        raise NotImplementedError

    def average_strategy(self, node_id: str) -> List[float]:
        if node_id not in self.stats:
            raise KeyError(f"Unknown node {node_id}")
        sums = self.stats[node_id].strategy_sums
        normalizer = sum(sums)
        if normalizer <= 0:
            return [1.0 / len(sums) for _ in sums]
        return [s / normalizer for s in sums]

    def load_checkpoint(self, checkpoint: SolverCheckpoint):
        self.stats = checkpoint.stats

    def save_checkpoint(self, path: str, iteration: int):
        checkpoint = SolverCheckpoint(stats=self.stats, iteration=iteration)
        with open(path, "w", encoding="utf-8") as fp:
            fp.write(checkpoint.to_json())

    @staticmethod
    def load_from_file(path: str) -> SolverCheckpoint:
        with open(path, "r", encoding="utf-8") as fp:
            return SolverCheckpoint.from_json(fp.read())


class CFRPlusSolver(CFRBaseSolver):
    """CFR+ style solver with regret floor of zero.

    GPU acceleration is automatically used when PyTorch with CUDA is available
    and ``use_gpu=True`` is specified in the :class:`SolverConfig`.
    """

    def _update_regrets(self, stats: NodeStatistics, regrets: List[float], iteration: int):
        for i, regret in enumerate(regrets):
            stats.regrets[i] = max(0.0, stats.regrets[i] + regret)


class DCFRSolver(CFRBaseSolver):
    """Discounted CFR implementation.

    Positive and negative regrets are discounted separately, allowing for stable
    convergence in large trees.
    """

    def __init__(self, root: BetTreeNode, config: SolverConfig):
        super().__init__(root, config)
        self.discount = config.discount

    def _update_regrets(self, stats: NodeStatistics, regrets: List[float], iteration: int):
        decay = (iteration / (iteration + 1)) ** self.discount
        for i, regret in enumerate(regrets):
            previous = stats.regrets[i]
            adjusted = previous * decay + regret
            stats.regrets[i] = adjusted


def warm_start_from_checkpoint(path: str, root: BetTreeNode, config: SolverConfig, discounted: bool = False) -> CFRBaseSolver:
    """Create a solver using the supplied checkpoint for warm starts."""

    checkpoint = CFRBaseSolver.load_from_file(path)
    solver: CFRBaseSolver
    if discounted:
        solver = DCFRSolver(root, config)
    else:
        solver = CFRPlusSolver(root, config)
    solver.load_checkpoint(checkpoint)
    return solver


def hydrate_solver_from_cache(cache_dir: str, root: BetTreeNode, discounted: bool = False) -> Optional[CFRBaseSolver]:
    """Load the most recent checkpoint if available.

    Returns ``None`` when no checkpoint is present; the caller can then create a
    fresh solver.
    """

    candidates = [f for f in os.listdir(cache_dir)] if os.path.isdir(cache_dir) else []
    if not candidates:
        return None
    latest = sorted(candidates)[-1]
    checkpoint = CFRBaseSolver.load_from_file(os.path.join(cache_dir, latest))
    config = SolverConfig(iterations=checkpoint.iteration)
    return warm_start_from_checkpoint(os.path.join(cache_dir, latest), root, config, discounted)
