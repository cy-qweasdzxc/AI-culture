"""Exercise the actual standalone routing boundary on Windows and POSIX paths."""
import runpy
from pathlib import Path

import pytest

launcher = runpy.run_path(str(Path(__file__).resolve().parents[2] / "run_demo.py"))


@pytest.mark.parametrize("path", [
    "api", "/api", "api/missing", "/api/missing", "api" + chr(92) + "missing",
    "__demo_missing", "__demo_missing" + chr(92) + "child", "assets/missing.js", ".env",
])
def test_spa_never_masks_api_control_or_asset_failures(path):
    assert launcher["spa_fallback"](path) is False


@pytest.mark.parametrize("path", ["demo", "map", "/chat/zhou-bo", "chat" + chr(92) + "zhou-bo"])
def test_spa_serves_known_client_side_route_shapes(path):
    assert launcher["spa_fallback"](path) is True
