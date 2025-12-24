from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence


@dataclass
class BetNode:
    """Represents a node in a betting tree for multiway pots."""

    node_id: str
    player: int
    pot: float
    to_call: float
    actions: Dict[str, "BetNode"] = field(default_factory=dict)
    locked_strategy: Optional[Sequence[float]] = None

    def add_child(self, action: str, child: "BetNode") -> None:
        self.actions[action] = child


class BetTreeBuilder:
    """Utility for generating simplified multiway bet trees."""

    def __init__(self, bet_sizes: Sequence[float], max_rounds: int = 2, allow_checks: bool = True):
        self.bet_sizes = list(bet_sizes)
        self.max_rounds = max_rounds
        self.allow_checks = allow_checks

    def build(self, num_players: int) -> BetNode:
        root = BetNode(node_id="root", player=0, pot=0.0, to_call=0.0)
        self._expand(root, 0, 0, num_players)
        return root

    def _expand(self, node: BetNode, round_index: int, raises_made: int, num_players: int) -> None:
        if round_index >= self.max_rounds:
            return

        actions: List[str] = []
        if self.allow_checks and node.to_call == 0:
            actions.append("check")
        actions.append("call" if node.to_call > 0 else "bet")
        actions.append("fold")

        for action in actions:
            next_player = (node.player + 1) % num_players
            next_pot = node.pot
            next_to_call = node.to_call
            next_round = round_index
            next_raises = raises_made

            if action == "bet":
                size = self.bet_sizes[min(raises_made, len(self.bet_sizes) - 1)]
                next_pot += size
                next_to_call = size
                next_raises += 1
            elif action == "call":
                next_pot += next_to_call
                next_to_call = 0
                next_round += 1
            elif action == "check":
                next_round += 1

            child_id = f"{node.node_id}/{action}_{next_round}_{next_player}"
            child = BetNode(node_id=child_id, player=next_player, pot=next_pot, to_call=next_to_call)
            node.add_child(action, child)
            if action != "fold":
                self._expand(child, next_round, next_raises, num_players)

