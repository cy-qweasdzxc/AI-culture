import importlib.util
from http.client import RemoteDisconnected
from io import BytesIO
from pathlib import Path

import pytest


@pytest.fixture
def benchmark():
    path = Path(__file__).resolve().parents[1] / "scripts/benchmark_api.py"
    spec = importlib.util.spec_from_file_location("benchmark_api_fixture", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.mark.parametrize("error", [ConnectionAbortedError("fixture connection aborted"),
                                  RemoteDisconnected("fixture response disconnected")])
def test_benchmark_records_transport_failure(benchmark, error):
    class DisconnectedOpener:
        def open(self, *args, **kwargs):
            raise error

    status, content, elapsed_ms = benchmark.call(DisconnectedOpener(), "http://127.0.0.1:9", "/api/health")
    assert status == 0 and content == {}
    assert elapsed_ms >= 0
    result = benchmark.summarize([{"status": status, "ms": elapsed_ms}])
    assert result["requests"] == 1 and result["succeeded"] == 0
    assert result["status_counts"] == {"0": 1}


def test_benchmark_flow_attempts_cleanup_after_connection_abort(benchmark, monkeypatch):
    methods = []

    class Response(BytesIO):
        status = 200

    class Opener:
        def open(self, request, **kwargs):
            methods.append(request.method)
            if request.method == "POST":
                raise ConnectionAbortedError("fixture connection aborted")
            return Response(b'{"deleted": true}')

    monkeypatch.setattr(benchmark, "client", Opener)
    samples = benchmark.flow("http://127.0.0.1:9")
    assert methods == ["POST", "DELETE"]
    assert [(s["operation"], s["status"]) for s in samples] == [("session", 0), ("delete_session", 200)]


def test_benchmark_does_not_count_headers_as_success_when_body_disconnects(benchmark):
    class TruncatedResponse(BytesIO):
        status = 200

        def read(self, *args, **kwargs):
            raise ConnectionAbortedError("fixture body disconnected after headers")

    class Opener:
        def open(self, *args, **kwargs):
            return TruncatedResponse()

    status, content, _ = benchmark.call(Opener(), "http://127.0.0.1:9", "/api/health")
    assert status == 0 and content == {}
