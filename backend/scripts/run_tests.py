"""Run backend tests with an isolated temporary directory and cache."""
from __future__ import annotations

import sys
import tempfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))


def main() -> int:
    targets = sys.argv[1:] or [str(ROOT / "backend" / "tests")]
    with tempfile.TemporaryDirectory(prefix="family-travel-tests-") as directory:
        temporary_root = Path(directory)
        return pytest.main([
            *targets,
            "--basetemp", str(temporary_root / "tests"),
            "-o", f"cache_dir={temporary_root / 'cache'}",
        ])


if __name__ == "__main__":
    raise SystemExit(main())
