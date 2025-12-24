from gto_pokertrainer.benchmarks.runner import BenchmarkSuite, RegressionHarness


def test_benchmark_runs():
    suite = BenchmarkSuite(iterations=10)
    result = suite.run()
    assert result.iterations > 0
    assert result.speed_iterations_per_sec > 0


def test_regression_summary():
    harness = RegressionHarness(boards=["AhKhQh"], ranges={"BTN": ["AA", "KK"]})
    summary = harness.summary()
    assert summary["boards"] == 1
    assert summary["range_profiles"] == 1
