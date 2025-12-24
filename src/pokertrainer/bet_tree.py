from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence


@dataclass
class BetTreeNode:
    """Represents a betting decision node for multiway games.

    Attributes:
        node_id: Stable identifier of the node (path-based).
        player: Index of the acting player.
        pot: Current pot size.
        to_call: Amount the acting player must call.
        stack_remaining: Remaining stack for each player.
        children: Mapping of action labels to child nodes.
        terminal_ev: Optional EV at a terminal leaf. If set, children should be empty.
        locked_strategy: Optional fixed strategy for node locking scenarios.
    """

    node_id: str
    player: int
    pot: float
    to_call: float
    stack_remaining: Sequence[float]
    children: Dict[str, "BetTreeNode"] = field(default_factory=dict)
    terminal_ev: Optional[float] = None
    locked_strategy: Optional[List[float]] = None

    def is_terminal(self) -> bool:
        return self.terminal_ev is not None or not self.children

    def available_actions(self) -> List[str]:
        return list(self.children.keys())


def generate_multiway_bet_tree(
    num_players: int,
    starting_stack: float,
    open_sizes: Sequence[float],
    raise_sizes: Sequence[float],
    call_size: float,
    num_streets: int = 1,
    node_prefix: str = "",
) -> BetTreeNode:
    """Generate a simplified multiway bet tree.

    The tree enumerates fold/call/raise lines for each player in order for the
    provided number of streets. The structure is intentionally light-weight to
    make it easy to plug into CFR/DCFR solvers.

    Args:
        num_players: Number of players in the hand.
        starting_stack: Starting stack for every player.
        open_sizes: Preflop opening sizes expressed in big blinds or chips.
        raise_sizes: Subsequent raise sizes.
        call_size: Call sizing when facing aggression.
        num_streets: Number of postflop streets to include.
        node_prefix: Path prefix for unique node IDs.

    Returns:
        Root :class:`BetTreeNode`.
    """

    def build_node(path: List[str], player: int, pot: float, street: int) -> BetTreeNode:
        node_id = "/".join([node_prefix, *path]) if path else node_prefix or "root"
        stack_state = [starting_stack for _ in range(num_players)]
        node = BetTreeNode(node_id=node_id, player=player, pot=pot, to_call=call_size, stack_remaining=stack_state)

        if street > num_streets:
            node.terminal_ev = pot / num_players
            return node

        actions: Dict[str, BetTreeNode] = {}

        # Fold ends the path with zero EV for the acting player and pot split for others.
        terminal_path = path + [f"P{player}_fold"]
        actions["fold"] = BetTreeNode(
            node_id="/".join([node_prefix, *terminal_path]) if node_prefix else "/".join(terminal_path),
            player=(player + 1) % num_players,
            pot=pot,
            to_call=0.0,
            stack_remaining=stack_state,
            terminal_ev=0.0,
        )

        # Call keeps the street alive; after all players call we move to the next street.
        call_path = path + [f"P{player}_call"]
        actions["call"] = build_node(call_path, (player + 1) % num_players, pot + call_size, street + 1)

        # Raises iterate through the provided raise sizes.
        for size in (open_sizes if street == 1 else raise_sizes):
            raise_path = path + [f"P{player}_raise_{size}"]
            actions[f"raise_{size}"] = build_node(raise_path, (player + 1) % num_players, pot + size, street + 1)

        node.children = actions
        return node

    return build_node([], 0, pot=0.0, street=1)


def lock_node_strategy(root: BetTreeNode, target_node_id: str, strategy: List[float]) -> bool:
    """Lock a node's strategy in-place.

    Args:
        root: Root of the bet tree.
        target_node_id: Node identifier to lock.
        strategy: Probability distribution over actions at the node.

    Returns:
        True if the node was found and locked; False otherwise.
    """

    if root.node_id == target_node_id:
        root.locked_strategy = strategy
        return True

    for child in root.children.values():
        if lock_node_strategy(child, target_node_id, strategy):
            return True
    return False
