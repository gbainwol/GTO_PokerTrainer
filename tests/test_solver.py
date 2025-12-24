from pokertrainer.bet_tree import generate_multiway_bet_tree
from pokertrainer.solver import CFRPlusSolver, DCFRSolver, SolverConfig, warm_start_from_checkpoint


def test_cfrplus_updates_regrets():
    root = generate_multiway_bet_tree(
        num_players=2,
        starting_stack=20.0,
        open_sizes=[2.0],
        raise_sizes=[4.0],
        call_size=2.0,
    )
    solver = CFRPlusSolver(root, SolverConfig(iterations=10))
    checkpoint = solver.train()
    assert checkpoint.iteration == 10
    assert solver.average_strategy(root.node_id)


def test_dcfr_warm_start():
    root = generate_multiway_bet_tree(
        num_players=2,
        starting_stack=20.0,
        open_sizes=[2.0],
        raise_sizes=[4.0],
        call_size=2.0,
    )
    base_solver = DCFRSolver(root, SolverConfig(iterations=5))
    ckpt = base_solver.train()

    # Warm start from the checkpoint and continue training.
    tmp_path = "/tmp/ckpt_test.json"
    base_solver.save_checkpoint(tmp_path, ckpt.iteration)
    warm_solver = warm_start_from_checkpoint(tmp_path, root, SolverConfig(iterations=5), discounted=True)
    resumed_ckpt = warm_solver.train()
    assert resumed_ckpt.iteration == 5
    assert warm_solver.average_strategy(root.node_id)
