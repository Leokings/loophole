"""Run Loophole's contract, web, and optional five-validator checks."""

from __future__ import annotations

import argparse
import os
import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def run(command: list[str], cwd: Path = ROOT) -> None:
    print(f"\n> {' '.join(command)}", flush=True)
    subprocess.run(command, cwd=cwd, check=True)


def wait_for_port(port: int, process: subprocess.Popen[bytes], timeout: float = 60.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError("GLSim exited before becoming ready")
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.5):
                return
        except OSError:
            time.sleep(0.25)
    raise RuntimeError("Timed out waiting for GLSim on port 4000")


def integration() -> None:
    command = [sys.executable, str(ROOT / "tests" / "run_glsim.py"), "--port", "4000", "--validators", "5"]
    print(f"\n> {' '.join(command)}", flush=True)
    environment = os.environ.copy()
    environment["PYTHONIOENCODING"] = "utf-8"
    environment["PYTHONUTF8"] = "1"
    process = subprocess.Popen(command, cwd=ROOT, env=environment)
    try:
        wait_for_port(4000, process)
        local_gltest = Path(sys.executable).with_name(
            "gltest.exe" if sys.platform == "win32" else "gltest"
        )
        executable = (
            str(local_gltest)
            if local_gltest.exists()
            else shutil.which("gltest") or shutil.which("gltest.exe")
        )
        if executable is None:
            raise RuntimeError("gltest is not installed; install requirements.txt")
        run([
            executable,
            "tests/integration/test_loophole_glsim.py",
            "-v",
            "-s",
            "--network",
            "localnet",
        ])
    finally:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--integration", action="store_true", help="also run the five-validator GLSim scenario")
    args = parser.parse_args()

    linter = "from genvm_linter.cli import cli; cli()"
    for contract in ("contracts/AutonomousRepublic.py", "contracts/RepublicCourt.py"):
        run([sys.executable, "-X", "utf8", "-c", linter, "check", contract])
        run([sys.executable, "-X", "utf8", "-c", linter, "typecheck", contract])
    run([sys.executable, "-m", "pytest", "tests/direct", "-q"])
    if args.integration:
        integration()

    npm = "npm.cmd" if sys.platform == "win32" else "npm"
    run([npm, "run", "check"], ROOT / "web")
    run([npm, "run", "check"], ROOT / "scheduler")
    print("\nLoophole verification passed.", flush=True)


if __name__ == "__main__":
    main()
