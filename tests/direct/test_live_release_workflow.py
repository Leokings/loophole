"""Parse and check the live-release workflow locally; never dispatch a run."""
from pathlib import Path

import yaml


def test_live_release_workflow_has_manual_gates_and_safe_chaining():
    workflow = yaml.safe_load(
        (Path(__file__).parents[2] / ".github/workflows/live-release.yml").read_text(encoding="utf-8")
    )
    # PyYAML follows YAML 1.1 and parses the unquoted 'on' key as True.
    trigger = workflow.get("on", workflow.get(True))
    assert set(trigger) == {"workflow_dispatch"}
    modes = trigger["workflow_dispatch"]["inputs"]["mode"]
    assert modes["default"] == "resume"
    assert set(modes["options"]) == {"check", "deploy", "resume"}
    assert workflow["concurrency"] == {"group": "live-release", "cancel-in-progress": False}
    assert workflow["permissions"] == {"contents": "write", "actions": "write"}
    job = workflow["jobs"]["live"]
    assert job["timeout-minutes"] == 350
    steps = job["steps"]
    assert steps[0]["with"]["ref"] == "v7"
    assert next(step for step in steps if step.get("id") == "run")["timeout-minutes"] == 320
    assert next(step for step in steps if step.get("id") == "proof")["timeout-minutes"] == 15
    persist = next(step for step in steps if step.get("id") == "persist")
    assert "always()" in persist["if"]
    assert "steps.restore.outcome == 'success'" in persist["if"]
    assert "inputs.mode != 'check'" in persist["if"]
    chain = next(step for step in steps if "gh workflow run" in step.get("run", ""))
    assert "== '75'" in chain["if"] and "== '3'" in chain["if"]
    assert "steps.persist.outcome == 'success'" in chain["if"]
    assert chain["run"] == "gh workflow run live-release.yml --ref v7 -f mode=resume"
