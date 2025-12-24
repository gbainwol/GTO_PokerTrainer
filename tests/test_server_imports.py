from gto_pokertrainer.server import http, grpc_server


def test_http_module_imports_without_fastapi():
    # In dependency-light environments, app may be None but module should import.
    assert hasattr(http, "TaskManager")


def test_grpc_module_imports_without_grpc():
    assert hasattr(grpc_server, "SolverService")
