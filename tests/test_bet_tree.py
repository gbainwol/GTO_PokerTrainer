from pokertrainer.bet_tree import BetTreeNode, generate_multiway_bet_tree, lock_node_strategy


def test_generate_multiway_bet_tree_has_actions():
    root = generate_multiway_bet_tree(
        num_players=3,
        starting_stack=100.0,
        open_sizes=[2.5],
        raise_sizes=[5.0],
        call_size=2.5,
    )
    assert isinstance(root, BetTreeNode)
    assert set(root.available_actions()) == {"fold", "call", "raise_2.5"}


def test_lock_node_strategy_marks_node():
    root = generate_multiway_bet_tree(
        num_players=2,
        starting_stack=50.0,
        open_sizes=[2.0],
        raise_sizes=[4.0],
        call_size=2.0,
    )
    target = next(iter(root.children.values()))
    assert lock_node_strategy(root, target.node_id, [0.7, 0.2, 0.1])
    assert target.locked_strategy == [0.7, 0.2, 0.1]
