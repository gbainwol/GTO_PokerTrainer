from __future__ import annotations

import json
import math
import os
import random
import time
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Dict, List, Mapping, Optional, Sequence, Tuple


def _zeros(length: int) -> List[float]:
    return [0.0 for _ in range(length)]


def _normalize(values: Sequence[float]) -> List[float]:
    total = sum(values)
    if total <= 0:
        return [1.0 / len(values) for _ in values]
    return [v / total for v in values]


class CFRVariant(str, Enum):
    CFR_PLUS = "cfr+"
    DCFR = "dcfr"


class Mode(str, Enum):
    LIVE = "live"
    FULL = "full"


@dataclass
class CFRNode:
    num_actions: int
    regret_sum: List[float] = field(init=False)
    strategy_sum: List[float] = field(init=False)

    def __post_init__(self) -> None:
        self.regret_sum = _zeros(self.num_actions)
        self.strategy_sum = _zeros(self.num_actions)

    def current_strategy(self, iteration: int, variant: CFRVariant) -> List[float]:
        regrets: List[float] = []
        for value in self.regret_sum:
            if variant == CFRVariant.CFR_PLUS:
                regrets.append(max(value, 0.0))
            else:
                damped = abs(value) - math.sqrt(iteration + 1)
                regrets.append(math.copysign(max(damped, 0.0), value))
        positives = [max(r, 0.0) for r in regrets]
        return _normalize(positives)

    def average_strategy(self) -> List[float]:
        return _normalize(self.strategy_sum)


@dataclass
class Checkpoint:
    iteration: int
    nodes: Dict[str, Tuple[List[float], List[float]]]


class CheckpointManager:
    def __init__(self, directory: os.PathLike[str] | str) -> None:
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)

    def save(self, iteration: int, info_sets: Mapping[str, CFRNode], tag: str = "latest") -> Path:
        payload: Dict[str, Tuple[List[float], List[float]]] = {}
        for key, node in info_sets.items():
            payload[key] = (list(node.regret_sum), list(node.strategy_sum))
        checkpoint = Checkpoint(iteration=iteration, nodes=payload)
        path = self.directory / f"checkpoint_{tag}.json"
        path.write_text(json.dumps(checkpoint.__dict__), encoding="utf-8")
        return path

    def load(self, tag: str = "latest") -> Optional[Checkpoint]:
        path = self.directory / f"checkpoint_{tag}.json"
        if not path.exists():
            return None
        raw = json.loads(path.read_text(encoding="utf-8"))
        return Checkpoint(iteration=raw["iteration"], nodes={k: tuple(v) for k, v in raw["nodes"].items()})


@dataclass
class SolveResult:
    average_strategy: Mapping[str, List[float]]
    iterations: int
    elapsed_seconds: float


class SubtreeCache:
    def __init__(self) -> None:
        self._strategies: Dict[str, List[float]] = {}

    def set(self, key: str, strategy: Sequence[float]) -> None:
        self._strategies[key] = _normalize(strategy)

    def get(self, key: str) -> Optional[List[float]]:
        if key not in self._strategies:
            return None
        return list(self._strategies[key])

    def merge(self, other: "SubtreeCache") -> None:
        self._strategies.update(other._strategies)


class InformationState:
    def player_to_act(self) -> int:
        raise NotImplementedError

    def actions(self) -> List[str]:
        raise NotImplementedError

    def is_terminal(self) -> bool:
        raise NotImplementedError

    def utility(self, player: int) -> float:
        raise NotImplementedError

    def transition(self, action: str) -> "InformationState":
        raise NotImplementedError

    def information_set_key(self, player: int) -> str:
        raise NotImplementedError


@dataclass
class KuhnState(InformationState):
    history: str
    cards: Tuple[int, ...]
    player_index: int
    num_players: int

    def player_to_act(self) -> int:
        return self.player_index

    def actions(self) -> List[str]:
        if self.is_terminal():
            return []
        if self.history and self.history[-1] == "b":
            return ["c", "f"]
        return ["c", "b"]

    def is_terminal(self) -> bool:
        h = self.history
        if not h:
            return False
        if h.endswith("f"):
            return True
        if len(h) >= 2 and h[-1] == "c" and h[-2] in {"c", "b"}:
            return True
        return False

    def utility(self, player: int) -> float:
        h = self.history
        pot = 2 + h.count("b")
        if h.endswith("f"):
            winner = (self.player_index - 1) % self.num_players
            return float(pot if player == winner else -1.0)
        highest = max(self.cards)
        winners = [idx for idx, card in enumerate(self.cards) if card == highest]
        share = float(pot) / len(winners)
        return share if player in winners else -1.0

    def transition(self, action: str) -> "KuhnState":
        next_player = (self.player_index + 1) % self.num_players
        return KuhnState(history=self.history + action, cards=self.cards, player_index=next_player, num_players=self.num_players)

    def information_set_key(self, player: int) -> str:
        return f"{player}:{self.cards[player]}:{self.history}"


class CFRSolver:
    def __init__(self, variant: CFRVariant = CFRVariant.CFR_PLUS) -> None:
        self.variant = variant
        self.info_sets: Dict[str, CFRNode] = {}

    def solve(
        self,
        root: InformationState,
        iterations: int,
        mode: Mode = Mode.FULL,
        warm_start: Optional[Mapping[str, CFRNode]] = None,
        locked_strategies: Optional[Mapping[str, Sequence[float]]] = None,
        subtree_cache: Optional[SubtreeCache] = None,
        checkpoint_manager: Optional[CheckpointManager] = None,
        checkpoint_interval: int = 0,
    ) -> SolveResult:
        locked_strategies = locked_strategies or {}
        subtree_cache = subtree_cache or SubtreeCache()

        if warm_start:
            self.info_sets.update(warm_start)

        start = time.time()
        max_iterations = iterations if mode == Mode.FULL else max(2, iterations // 5)
        for i in range(max_iterations):
            reach = [1.0 for _ in range(self._player_count(root))]
            self._cfr(root, reach, i + 1, locked_strategies, subtree_cache)
            if checkpoint_manager and checkpoint_interval and (i + 1) % checkpoint_interval == 0:
                checkpoint_manager.save(i + 1, self.info_sets)
        elapsed = time.time() - start
        return SolveResult(average_strategy={k: v.average_strategy() for k, v in self.info_sets.items()}, iterations=i + 1, elapsed_seconds=elapsed)

    def _player_count(self, state: InformationState) -> int:
        if isinstance(state, KuhnState):
            return state.num_players
        raise ValueError("Unsupported state type; extend _player_count for custom games.")

    def _cfr(
        self,
        state: InformationState,
        reach_prob: List[float],
        iteration: int,
        locked_strategies: Mapping[str, Sequence[float]],
        subtree_cache: SubtreeCache,
    ) -> List[float]:
        if state.is_terminal():
            return [state.utility(p) for p in range(len(reach_prob))]

        player = state.player_to_act()
        actions = state.actions()
        if not actions:
            return [state.utility(p) for p in range(len(reach_prob))]

        info_key = state.information_set_key(player)
        cached_strategy = locked_strategies.get(info_key) or subtree_cache.get(info_key)

        node = self.info_sets.get(info_key)
        if node is None:
            node = CFRNode(num_actions=len(actions))
            self.info_sets[info_key] = node

        if cached_strategy is None:
            strategy = node.current_strategy(iteration, self.variant)
        else:
            strategy = _normalize(cached_strategy)

        action_utils: List[float] = _zeros(len(actions))
        util_sum: List[float] = _zeros(len(reach_prob))

        for idx, action in enumerate(actions):
            next_state = state.transition(action)
            next_reach = list(reach_prob)
            next_reach[player] *= strategy[idx]
            child_util = self._cfr(next_state, next_reach, iteration, locked_strategies, subtree_cache)
            util_sum = [u + strategy[idx] * child_util[i] for i, u in enumerate(util_sum)]
            action_utils[idx] = child_util[player]

        counterfactual = list(reach_prob)
        counterfactual[player] = 1.0
        regrets = [a - util_sum[player] for a in action_utils]
        for i, regret in enumerate(regrets):
            node.regret_sum[i] += counterfactual[player] * regret
            node.strategy_sum[i] += reach_prob[player] * strategy[i]

        return util_sum


def deal_kuhn(num_players: int = 2, shuffle: bool = True) -> KuhnState:
    cards = list(range(1, num_players + 3))[: num_players]
    if shuffle:
        random.shuffle(cards)
    return KuhnState(history="", cards=tuple(cards), player_index=0, num_players=num_players)
