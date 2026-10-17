import datetime
import json
from pathlib import Path

from gltest.direct.sdk_loader import setup_sdk_paths


CONTRACT_PATH = Path("contracts/CaseLaw.py")


def deploy_caselaw(direct_vm, direct_deploy):
    setup_sdk_paths(CONTRACT_PATH, "v0.2.16")
    direct_vm.warp(datetime.datetime(2026, 8, 25, 12, 0, tzinfo=datetime.timezone.utc).isoformat())
    return direct_deploy(str(CONTRACT_PATH))


def _record(caselaw, *, law_id=1, action_type="UNDERMINE", target_class="OFFICEHOLDER",
            label="NOT_COVERED", quote="the scope excludes this action", case_id=1, digest=None):
    key = f"{law_id}|{action_type}|{target_class}"
    caselaw.record_holding(key, law_id, action_type, target_class, label, quote, case_id,
                           digest or f"{case_id:064x}")


def test_only_linked_court_records_holdings(direct_vm, direct_deploy, direct_alice, direct_bob):
    caselaw = deploy_caselaw(direct_vm, direct_deploy)
    from genlayer.py.types import Address

    court = Address(direct_bob)
    with direct_vm.expect_revert("COURT_ONLY"):
        _record(caselaw)
    caselaw.set_court(court)
    with direct_vm.expect_revert("COURT_ALREADY_SET"):
        caselaw.set_court(Address(direct_alice))
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("COURT_ONLY"):
        _record(caselaw)
    direct_vm.sender = direct_bob
    _record(caselaw)
    assert caselaw.get_holding("1|UNDERMINE|OFFICEHOLDER")["case_id"] == 1


def test_record_is_idempotent_and_conflicts_are_rejected(direct_vm, direct_deploy, direct_bob):
    caselaw = deploy_caselaw(direct_vm, direct_deploy)
    from genlayer.py.types import Address

    caselaw.set_court(Address(direct_bob))
    direct_vm.sender = direct_bob
    _record(caselaw)
    _record(caselaw)
    assert caselaw.get_registry_summary()["holding_count"] == 1
    with direct_vm.expect_revert("HOLDING_CONFLICT"):
        _record(caselaw, case_id=2)
    with direct_vm.expect_revert("HOLDING_CONFLICT"):
        _record(caselaw, law_id=2, target_class="NONE", case_id=1)


def test_holdings_are_listed_by_law(direct_vm, direct_deploy, direct_bob):
    caselaw = deploy_caselaw(direct_vm, direct_deploy)
    from genlayer.py.types import Address

    caselaw.set_court(Address(direct_bob))
    direct_vm.sender = direct_bob
    _record(caselaw, law_id=2, target_class="OTHER_FACTION", case_id=2)
    _record(caselaw, law_id=1, target_class="OFFICEHOLDER", case_id=1)
    _record(caselaw, law_id=1, target_class="NONE", case_id=3, label="COVERED_BREACH")
    holdings = caselaw.get_holdings_for_laws("[2,1]")
    assert [holding["key"] for holding in holdings] == [
        "1|UNDERMINE|NONE", "1|UNDERMINE|OFFICEHOLDER", "2|UNDERMINE|OTHER_FACTION"
    ]
    assert caselaw.get_holding_for_case(3)["label"] == "COVERED_BREACH"
    with direct_vm.expect_revert("LAW_IDS"):
        caselaw.get_holdings_for_laws(json.dumps(list(range(1, 18))))


def test_key_must_match_components(direct_vm, direct_deploy, direct_bob):
    caselaw = deploy_caselaw(direct_vm, direct_deploy)
    from genlayer.py.types import Address

    caselaw.set_court(Address(direct_bob))
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("HOLDING_KEY_MISMATCH"):
        caselaw.record_holding("1|REPEAL_LAW|LAW", 1, "UNDERMINE", "OFFICEHOLDER",
                               "NOT_COVERED", "the scope excludes this action", 1, "1" * 64)
