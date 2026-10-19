"""Offline contract-shape coverage for the code-defined V7 demo story."""

import json
import subprocess
import sys
from pathlib import Path

from test_autonomous_republic import deploy_republic


ROOT = Path(__file__).parents[2]
FIXTURE = ROOT / "tests" / "direct" / "fixtures" / "v7_demo_actions.json"


def _export_actions():
    result = subprocess.run(
        ["node", "web/scripts/v7-demo-scenario.mjs", "--export-actions"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text(result.stdout, encoding="utf-8")
    return json.loads(result.stdout)


def test_every_demo_action_matches_republic_calldata_shape(direct_vm, direct_deploy):
    """Run the exported payloads through the same canonical validators used by the contract."""
    contract = deploy_republic(direct_vm, direct_deploy)
    module = next(
        module for module in sys.modules.values()
        if getattr(module, "CONTRACT_VERSION", None) == "2.0.0"
        and hasattr(module, "_canonical_action_values")
    )
    snapshot = [
        {
            "faction_id": faction,
            "influence": 20,
            "wealth": 10,
            "offices": ["EXECUTIVE"] if faction == "MERCHANTS" else [],
        }
        for faction in ("MERCHANTS", "REFORMERS", "TRADITIONALISTS", "REVOLUTIONARIES")
    ]
    laws = [
        {
            "law_id": law_id,
            "status": "ENACTED",
            "law_kind": "STATUTE",
            "veto_deadline_round": 10,
            "effective_from_round": 1,
            "effective_until_round": 0,
            "sponsor_faction_id": "MERCHANTS",
        }
        for law_id in (1, 2)
    ]
    crisis = {"status": "ACTIVE", "responded_faction_ids": []}
    exported = _export_actions()

    for round_actions in exported["rounds"].values():
        assert len(round_actions) == 4
        for item in round_actions:
            action = item
            calldata = action["calldata"]
            assert len(calldata) == 9
            assert isinstance(action["stances"], list)
            assert isinstance(calldata[7], str)
            if action["action_type"] == "UNDERMINE":
                assert action.get("class_law_id", 0) > 0
                assert calldata[3] == 0
            elif action["action_type"] not in {"AMEND_LAW", "REPEAL_LAW", "VETO_LAW", "FILE_SUIT"}:
                assert calldata[3] == 0

            module._canonical_action_values(
                calldata[0], calldata[1], calldata[2], calldata[3], calldata[4],
                calldata[5], calldata[6], snapshot, laws, crisis,
                calldata[1] == "RUN_FOR_OFFICE", [],
            )
            parsed_stances = module._strict_stances_json(calldata[7], [1, 2])
            assert isinstance(parsed_stances, list)
            assert all(set(stance) == {"law_id", "stance"} for stance in parsed_stances)

