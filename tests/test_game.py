from gto_pokertrainer.game.bet_tree import BetTreeBuilder


def test_multiway_tree_generation():
    builder = BetTreeBuilder(bet_sizes=[1.0, 3.0], max_rounds=2)
    root = builder.build(num_players=3)
    assert root.actions
    some_child = next(iter(root.actions.values()))
    assert some_child.player == 1
