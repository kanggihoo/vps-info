"""Compose boundaries are executable configuration, so validate resolved services."""

from __future__ import annotations

import json
import subprocess


def test_base_compose_keeps_service_network_boundaries():
    result = subprocess.run(
        ["docker", "compose", "-f", "compose.yml", "config", "--format", "json"],
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    services = json.loads(result.stdout)["services"]
    assert set(services["collector"]["networks"]) == {"vps_data"}
    assert "ports" not in services["collector"]
    assert "restart" not in services["collector"]
    assert set(services["backend"]["networks"]) == {"vps_proxy", "vps_data"}
    assert "ports" not in services["backend"]
    assert set(services["frontend"]["networks"]) == {"vps_proxy"}
    assert "ports" not in services["frontend"]
