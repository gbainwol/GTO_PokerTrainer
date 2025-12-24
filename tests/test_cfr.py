from gto_pokertrainer.solver.cfr import (
    CFRSolver,
    CFRVariant,
    CheckpointManager,
    Mode,
    SubtreeCache,
    deal_kuhn,
)


def test_cfr_live_mode_runs():
    solver = CFRSolver(variant=CFRVariant.CFR_PLUS)
    result = solver.solve(deal_kuhn(shuffle=False), iterations=15, mode=Mode.LIVE)
    assert result.iterations > 0
    assert len(result.average_strategy) > 0


def test_checkpoint_and_warm_start(tmp_path):
    solver = CFRSolver()
    result = solver.solve(deal_kuhn(shuffle=False), iterations=10, mode=Mode.LIVE)
    manager = CheckpointManager(tmp_path)
    path = manager.save(result.iterations, solver.info_sets, tag="unit")
    loaded = manager.load(tag="unit")
    assert path.exists()
    assert loaded is not None
    warm_solver = CFRSolver()
    warm_solver.solve(deal_kuhn(shuffle=False), iterations=5, warm_start=solver.info_sets)
    assert warm_solver.info_sets


def test_node_locking_applies():
    solver = CFRSolver()
    locked = {"0:1:": [0.9, 0.1]}
    result = solver.solve(deal_kuhn(shuffle=False), iterations=5, locked_strategies=locked)
    assert "0:1:" in result.average_strategy
    assert result.average_strategy["0:1:"][0] > 0.7


def test_subtree_cache_short_circuit():
    solver = CFRSolver()
    cache = SubtreeCache()
    cache.set("0:1:", [0.2, 0.8])
    result = solver.solve(deal_kuhn(shuffle=False), iterations=5, subtree_cache=cache)
    assert abs(result.average_strategy["0:1:"][0] - 0.2) < 0.05
