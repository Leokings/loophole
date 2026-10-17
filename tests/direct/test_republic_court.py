import datetime
import json
from pathlib import Path

from gltest.direct.sdk_loader import setup_sdk_paths


CONTRACT_PATH = Path("contracts/RepublicCourt.py")
TEST_TIME = "2026-08-25T12:00:00Z"


def deploy_court(direct_vm, direct_deploy, republic_address, caselaw_address, brief_seconds=60, resolution_seconds=300):
    setup_sdk_paths(CONTRACT_PATH, "v0.2.16")
    direct_vm.warp(TEST_TIME)
    return direct_deploy(str(CONTRACT_PATH), republic_address, caselaw_address, brief_seconds, resolution_seconds)


def _faction(faction_id, controller):
    from genlayer.py.types import Address

    return {
        "faction_id": faction_id,
        "name": faction_id.title(),
        "doctrine": "Protect public institutions through clear, recorded rules and accountable conduct.",
        "controller": Address(controller),
        "influence": 5,
        "wealth": 5,
        "legitimacy": 5,
    }


def install_republic_hook(direct_vm, direct_alice, direct_bob, *, action=None, law=None, round_number=4):
    from genlayer.py import calldata

    action = action or {
        "round_number": 3, "faction_id": "MERCHANTS", "source": "AI_EMPTY_SEAT", "action_type": "UNDERMINE",
        "target_faction_id": "REFORMERS", "target_law_id": 0, "law_title": "", "law_text": "",
        "rationale": "The recorded faction action targeted a rival during the public political round.",
        "target_was_officeholder": True,
    }
    law = law or {
        "law_id": 1, "title": "Public Conduct Rule",
        "text": "No faction may UNDERMINE a faction that holds public office.", "status": "ENACTED",
        "law_kind": "STATUTE", "sponsor_faction_id": "TRADITIONALISTS", "constitutional": False,
        "effective_from_round": 2, "effective_until_round": 0, "certification": "ADJUDICABLE",
    }
    latest = {"action": action, "law": law}

    def hook(vm, request):
        if "CallContract" in request:
            call = request["CallContract"].get("calldata", {})
            method = call.get("method")
            args = call.get("args", [])
            if method == "get_game":
                result = {"republic_id": "FIRST-REPUBLIC", "round_number": round_number, "season_number": 1}
            elif method == "get_faction":
                faction_id = args[0]
                controller = direct_alice if faction_id == "REFORMERS" else direct_bob
                result = _faction(faction_id, controller)
            elif method == "is_active_faction_controller":
                faction_id, controller = args
                expected = direct_alice if faction_id == "REFORMERS" else direct_bob
                result = controller == _faction(faction_id, expected)["controller"]
            elif method == "get_round_action":
                result = dict(latest["action"])
            elif method == "get_law":
                result = dict(latest["law"])
            else:
                raise AssertionError(f"unexpected republic view: {method}")
            return bytes([0]) + calldata.encode(result)
        return None

    direct_vm._gl_call_hook = hook
    return latest


def _file(court, direct_vm, direct_alice, reference="CASE-0001", claim=None):
    direct_vm.sender = direct_alice
    return court.file_case(
        reference, "REFORMERS", "MERCHANTS", 3, 1,
        claim or "The recorded action targeted a faction protected by the certified public conduct rule.",
    )


def _addresses(direct_alice, direct_bob):
    setup_sdk_paths(CONTRACT_PATH, "v0.2.16")
    from genlayer.py.types import Address

    return Address(direct_bob), Address(direct_alice)


def test_case_cites_exactly_one_certified_effective_rule(direct_vm, direct_deploy, direct_alice, direct_bob):
    republic, caselaw = _addresses(direct_alice, direct_bob)
    court = deploy_court(direct_vm, direct_deploy, republic, caselaw)
    install_republic_hook(direct_vm, direct_alice, direct_bob)
    assert _file(court, direct_vm, direct_alice) == 1
    evidence = json.loads(court.get_case(1)["evidence_json"])
    assert evidence["law"]["law_id"] == 1
    assert court.get_case(1)["status"] == "BRIEFING"

    install_republic_hook(direct_vm, direct_alice, direct_bob,
                          law={"law_id": 1, "title": "Repeal", "text": "Repeal enacted law 1.", "status": "APPLIED",
                               "law_kind": "REPEAL", "sponsor_faction_id": "MERCHANTS", "constitutional": False,
                               "effective_from_round": 1, "effective_until_round": 0, "certification": "NOT_REQUIRED"})
    with direct_vm.expect_revert("CITED_LAW_NOT_A_RULE"):
        _file(court, direct_vm, direct_alice, "CASE-REPEAL")
    install_republic_hook(direct_vm, direct_alice, direct_bob,
                          law={"law_id": 1, "title": "Uncertified", "text": "A rule with no certification.", "status": "ENACTED",
                               "law_kind": "STATUTE", "sponsor_faction_id": "MERCHANTS", "constitutional": False,
                               "effective_from_round": 1, "effective_until_round": 0, "certification": "UNCERTIFIED"})
    with direct_vm.expect_revert("CITED_LAW_NOT_CERTIFIED"):
        _file(court, direct_vm, direct_alice, "CASE-UNCERTIFIED")


def test_republic_filing_requires_republic_sender(direct_vm, direct_deploy, direct_alice, direct_bob):
    republic, caselaw = _addresses(direct_alice, direct_bob)
    court = deploy_court(direct_vm, direct_deploy, republic, caselaw)
    install_republic_hook(direct_vm, direct_alice, direct_bob)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("REPUBLIC_ONLY"):
        court.file_case_from_republic("AI-CASE", "REFORMERS", "MERCHANTS", 3, 1,
                                      "The AI seat reports a possible breach in the recorded action.")
    direct_vm.sender = direct_bob
    assert court.file_case_from_republic("AI-CASE", "REFORMERS", "MERCHANTS", 3, 1,
                                         "The AI seat reports a possible breach in the recorded action.") == 1
    assert court.get_case(1)["source"] == "REPUBLIC"


def test_claim_key_ignores_claim_wording(direct_vm, direct_deploy, direct_alice, direct_bob):
    republic, caselaw = _addresses(direct_alice, direct_bob)
    court = deploy_court(direct_vm, direct_deploy, republic, caselaw)
    install_republic_hook(direct_vm, direct_alice, direct_bob)
    _file(court, direct_vm, direct_alice)
    with direct_vm.expect_revert("CASE_CLAIM_DUPLICATE"):
        _file(court, direct_vm, direct_alice, "CASE-0002",
              "Different wording cannot create another claim for the same plaintiff, defendant, action, and law.")


def test_evidence_freezes_target_class_and_key(direct_vm, direct_deploy, direct_alice, direct_bob):
    republic, caselaw = _addresses(direct_alice, direct_bob)
    court = deploy_court(direct_vm, direct_deploy, republic, caselaw)
    latest = install_republic_hook(direct_vm, direct_alice, direct_bob)
    _file(court, direct_vm, direct_alice)
    latest["action"]["target_was_officeholder"] = False
    case = court.get_case(1)
    evidence = json.loads(case["evidence_json"])
    assert case["target_class"] == "OFFICEHOLDER"
    assert case["key"] == "1|UNDERMINE|OFFICEHOLDER"
    assert evidence["action"]["target_was_officeholder"] is True
    assert evidence["target_class"] == case["target_class"]
    assert evidence["key"] == case["key"]
