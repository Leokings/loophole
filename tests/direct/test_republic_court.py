import datetime
import json
from pathlib import Path

from gltest.direct.sdk_loader import setup_sdk_paths


CONTRACT_PATH = Path("contracts/RepublicCourt.py")
TEST_TIME = "2026-08-25T12:00:00Z"


def compact(value):
    return json.dumps(value, separators=(",", ":"))


def as_iso(epoch):
    return (
        datetime.datetime.fromtimestamp(int(epoch), datetime.timezone.utc)
        .isoformat()
        .replace("+00:00", "Z")
    )


def deploy_court(direct_vm, direct_deploy, republic_address, brief_seconds=60, appeal_seconds=60):
    setup_sdk_paths(CONTRACT_PATH, "v0.2.16")
    from genlayer.py.types import Address

    direct_vm.warp(TEST_TIME)
    return direct_deploy(
        str(CONTRACT_PATH),
        Address(republic_address),
        brief_seconds,
        appeal_seconds,
    )


def faction(faction_id, controller, *, active=True):
    from genlayer.py.types import Address

    names = {
        "MERCHANTS": "Merchant Coalition",
        "REFORMERS": "Civic Reformers",
        "TRADITIONALISTS": "Old Charter League",
    }
    doctrines = {
        "MERCHANTS": "Increase private wealth and preserve predictable commercial rules.",
        "REFORMERS": "Protect ordinary citizens and constrain concentrated political power.",
        "TRADITIONALISTS": "Defend institutional continuity and the inherited constitutional order.",
    }
    return {
        "faction_id": faction_id,
        "name": names[faction_id],
        "doctrine": doctrines[faction_id],
        "controller": Address(controller),
        "controller_mode": "HUMAN" if active else "AI",
        "control_expires_at": 9999999999 if active else 1,
        "control_recoverable": not active,
        "influence": 5,
        "wealth": 5,
        "legitimacy": 5,
        "last_action_round": 1,
        "last_action_type": "UNDERMINE",
    }


def install_republic_hook(
    direct_vm,
    direct_alice,
    direct_bob,
    *,
    enacted=True,
    round_number=3,
    applied_actions=None,
    expired_factions=None,
):
    from genlayer.py import calldata

    posts = []
    applied_actions = applied_actions if applied_actions is not None else set()
    expired_factions = expired_factions if expired_factions is not None else set()

    def hook(vm, request):
        if "CallContract" in request:
            data = request["CallContract"]
            call = data.get("calldata", {})
            method = call.get("method")
            args = call.get("args", [])
            if method == "get_game":
                result = {
                    "republic_id": "FIRST-REPUBLIC",
                    "round_number": round_number,
                }
            elif method == "get_faction":
                faction_id = args[0]
                controller = direct_alice if faction_id == "REFORMERS" else direct_bob
                result = faction(
                    faction_id,
                    controller,
                    active=faction_id not in expired_factions,
                )
            elif method == "is_active_faction_controller":
                faction_id = args[0]
                controller = direct_alice if faction_id == "REFORMERS" else direct_bob
                result = (
                    faction_id not in expired_factions
                    and faction(faction_id, controller)["controller"] == args[1]
                )
            elif method == "get_round_action":
                result = {
                    "round_number": args[0],
                    "faction_id": args[1],
                    "actor": faction("MERCHANTS", direct_bob)["controller"],
                    "source": "HUMAN",
                    "action_type": "UNDERMINE",
                    "target_faction_id": "REFORMERS",
                    "target_law_id": 0,
                    "law_title": "",
                    "law_text": "",
                    "rationale": "Reduce reformer legitimacy before their coalition centralizes authority.",
                }
            elif method == "get_law":
                result = {
                    "law_id": args[0],
                    "proposed_round": 1,
                    "sponsor_faction_id": "REFORMERS",
                    "title": "Civic Protection Act",
                    "text": "No faction may deliberately undermine another faction for opposing a lawful reform.",
                    "status": "ENACTED" if enacted else "PENDING",
                    "support_votes": 2,
                    "oppose_votes": 1,
                    "closes_after_round": 2,
                    "resolved_round": 2,
                    "law_kind": "STATUTE",
                    "parent_law_id": 0,
                    "effective_from_round": 1 if enacted else 0,
                    "effective_until_round": 0,
                    "veto_deadline_round": 0,
                }
            elif method == "is_court_action_sanctioned":
                result = (int(args[0]), args[1]) in applied_actions
            else:
                raise AssertionError(f"unexpected cross-contract view: {method}")
            return bytes([0]) + calldata.encode(result)
        if "PostMessage" in request:
            posts.append(request["PostMessage"])
            return {"ok": None}
        return None

    direct_vm._gl_call_hook = hook
    return posts


def file_standard_case(court, direct_vm, direct_alice):
    direct_vm.sender = direct_alice
    return court.file_case(
        "CASE-UNDERMINE-0001",
        "REFORMERS",
        "MERCHANTS",
        1,
        "[1]",
        "The merchant action deliberately undermined reformers because they supported the enacted civic law.",
    )


def violation_ruling(sanction="MINOR"):
    return {
        "verdict": "VIOLATION",
        "violated_law_ids": [1],
        "sanction": sanction,
        "reason_code": "DELIBERATE_RETALIATION",
        "reasoning": "The recorded action expressly targeted the reformers for their lawful political position, which falls within the enacted prohibition.",
        "precedent_rule": "An UNDERMINE action violates this law when its recorded rationale shows deliberate retaliation for supporting a lawful reform.",
    }


def no_violation_ruling():
    return {
        "verdict": "NO_VIOLATION",
        "violated_law_ids": [],
        "sanction": "NONE",
        "reason_code": "POLITICAL_CONTEST_ALLOWED",
        "reasoning": "The record supports ordinary political competition but does not establish that opposition to the enacted reform caused the action.",
        "precedent_rule": "An UNDERMINE action does not violate this law without record-grounded evidence that lawful reform support motivated the target choice.",
    }


def test_contract_uses_a_pinned_runner():
    first_line = CONTRACT_PATH.read_text(encoding="utf-8").splitlines()[0]
    assert first_line.startswith('# { "Depends": "py-genlayer:')
    assert "test" not in first_line
    assert "latest" not in first_line


def test_initializes_a_republic_bound_court(direct_vm, direct_deploy, direct_bob):
    court = deploy_court(direct_vm, direct_deploy, direct_bob)
    state = court.get_court()

    assert state["contract_version"] == "0.4.0"
    assert state["policy_version"] == "LOOPHOLE_REPUBLIC_COURT_V4"
    assert state["brief_seconds"] == 60
    assert state["case_count"] == 0
    assert state["max_case_age_rounds"] == 8
    assert state["claim_deduplication"] == "ACTION_PLAINTIFF_LAWS_CLAIM"
    assert state["sanction_deduplication"] == "ACTION"


def test_filing_freezes_action_and_enacted_law_evidence(
    direct_vm,
    direct_deploy,
    direct_alice,
    direct_bob,
):
    court = deploy_court(direct_vm, direct_deploy, direct_bob)
    install_republic_hook(direct_vm, direct_alice, direct_bob)

    assert file_standard_case(court, direct_vm, direct_alice) == 1
    case = court.get_case(1)
    evidence = json.loads(case["evidence_json"])

    assert case["status"] == "BRIEFING"
    assert case["cited_law_ids_json"] == "[1]"
    assert len(case["evidence_digest"]) == 64
    assert evidence["action"]["action_type"] == "UNDERMINE"
    assert evidence["enacted_laws"][0]["effective_from_round"] == 1
    assert evidence["enacted_laws"][0]["title"] == "Civic Protection Act"

    with direct_vm.expect_revert("CASE_REFERENCE_DUPLICATE"):
        file_standard_case(court, direct_vm, direct_alice)


def test_weak_case_cannot_immunize_action_from_distinct_valid_claims(
    direct_vm,
    direct_deploy,
    direct_alice,
    direct_bob,
):
    court = deploy_court(direct_vm, direct_deploy, direct_bob)
    install_republic_hook(direct_vm, direct_alice, direct_bob)
    file_standard_case(court, direct_vm, direct_alice)

    direct_vm.warp(as_iso(court.get_case(1)["brief_deadline"]))
    direct_vm.mock_llm(
        r".*consensus-critical constitutional court for the political strategy game Loophole.*",
        compact(no_violation_ruling()),
    )
    court.resolve_case(1)
    direct_vm.warp(as_iso(court.get_case(1)["appeal_deadline"]))
    court.finalize_case(1)

    direct_vm.sender = direct_alice
    assert court.file_case(
        "CASE-REFORMER-REVISED-CLAIM",
        "REFORMERS",
        "MERCHANTS",
        1,
        "[1]",
        "A materially revised factual claim under the same law remains reviewable after the first weak case ends without a violation.",
    ) == 2

    direct_vm.sender = direct_bob
    assert court.file_case(
        "CASE-TRADITIONALIST-CLAIM",
        "TRADITIONALISTS",
        "MERCHANTS",
        1,
        "[1]",
        "A separate plaintiff may pursue its own good-faith legal claim after the first case ends without a violation.",
    ) == 3

    direct_vm.sender = direct_alice
    assert court.file_case(
        "CASE-DISTINCT-LAW-CLAIM",
        "REFORMERS",
        "MERCHANTS",
        1,
        "[2]",
        "The same plaintiff may cite a distinct enacted law that presents a separate legal theory for the recorded action.",
    ) == 4

    assert court.get_case(1)["action_key"] == court.get_case(2)["action_key"]
    assert court.get_case(1)["action_key"] == court.get_case(3)["action_key"]
    assert court.get_case(1)["action_key"] == court.get_case(4)["action_key"]
    assert court.get_case(1)["claim_key"] != court.get_case(2)["claim_key"]
    assert court.get_case(1)["claim_key"] != court.get_case(3)["claim_key"]
    assert court.get_case(1)["claim_key"] != court.get_case(4)["claim_key"]

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("CASE_CLAIM_DUPLICATE"):
        court.file_case(
            "CASE-EXACT-DUPLICATE",
            "REFORMERS",
            "MERCHANTS",
            1,
            "[1]",
            "The merchant action deliberately undermined reformers because they supported the enacted civic law.",
        )

    assert court.get_court()["case_count"] == 4
    assert court.get_open_case_ids(10) == [2, 3, 4]


def test_expired_controller_cannot_file_brief_appeal_or_respond(
    direct_vm,
    direct_deploy,
    direct_alice,
    direct_bob,
):
    court = deploy_court(direct_vm, direct_deploy, direct_bob)
    install_republic_hook(
        direct_vm,
        direct_alice,
        direct_bob,
        expired_factions={"REFORMERS"},
    )
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("FACTION_CONTROL_EXPIRED"):
        file_standard_case(court, direct_vm, direct_alice)

    install_republic_hook(direct_vm, direct_alice, direct_bob)
    file_standard_case(court, direct_vm, direct_alice)

    install_republic_hook(
        direct_vm,
        direct_alice,
        direct_bob,
        expired_factions={"REFORMERS"},
    )
    with direct_vm.expect_revert("FACTION_CONTROL_EXPIRED"):
        court.submit_brief(
            1,
            "REFORMERS",
            "An expired controller cannot submit a brief even though the republic still stores its old address.",
        )

    install_republic_hook(direct_vm, direct_alice, direct_bob)
    direct_vm.warp(as_iso(court.get_case(1)["brief_deadline"]))
    direct_vm.mock_llm(
        r".*consensus-critical constitutional court for the political strategy game Loophole.*",
        compact(violation_ruling("REPRIMAND")),
    )
    court.resolve_case(1)

    install_republic_hook(
        direct_vm,
        direct_alice,
        direct_bob,
        expired_factions={"MERCHANTS"},
    )
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("FACTION_CONTROL_EXPIRED"):
        court.appeal_case(
            1,
            "MERCHANTS",
            "An expired defendant controller must not retain appellate authority after its faction lease ends.",
        )

    install_republic_hook(direct_vm, direct_alice, direct_bob)
    court.appeal_case(
        1,
        "MERCHANTS",
        "The active defendant controller asks the appellate court to review the frozen record and legal theory.",
    )

    install_republic_hook(
        direct_vm,
        direct_alice,
        direct_bob,
        expired_factions={"REFORMERS"},
    )
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("FACTION_CONTROL_EXPIRED"):
        court.submit_appeal_response(
            1,
            "REFORMERS",
            "An expired plaintiff controller cannot answer an appeal using only the stale stored controller address.",
        )


def test_case_filing_window_rejects_actions_older_than_eight_rounds(
    direct_vm,
    direct_deploy,
    direct_alice,
    direct_bob,
):
    court = deploy_court(direct_vm, direct_deploy, direct_bob)
    install_republic_hook(direct_vm, direct_alice, direct_bob, round_number=10)

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("CASE_FILING_WINDOW_CLOSED"):
        court.file_case(
            "CASE-STALE-ACTION-1",
            "REFORMERS",
            "MERCHANTS",
            1,
            "[1]",
            "This filing arrives after the bounded eight-round litigation window has already closed.",
        )


def test_open_case_queue_keeps_old_work_visible_and_reschedules_progressed_cases(
    direct_vm,
    direct_deploy,
    direct_alice,
    direct_bob,
):
    court = deploy_court(direct_vm, direct_deploy, direct_bob)
    install_republic_hook(direct_vm, direct_alice, direct_bob)
    file_standard_case(court, direct_vm, direct_alice)
    court.file_case(
        "CASE-UNDERMINE-ROUND-2",
        "REFORMERS",
        "MERCHANTS",
        2,
        "[1]",
        "This separate resolved action is independently reviewable without hiding the older unresolved case.",
    )
    assert court.get_open_case_ids(64) == [1, 2]

    direct_vm.warp(as_iso(court.get_case(1)["brief_deadline"]))
    direct_vm.mock_llm(
        r".*consensus-critical constitutional court for the political strategy game Loophole.*",
        compact(no_violation_ruling()),
    )
    court.resolve_case(1)

    # A case that advances to another timed state moves behind still-unprocessed
    # work, preserving bounded oldest-first keeper progress.
    assert court.get_open_case_ids(64) == [2, 1]
    assert court.get_court()["open_case_head"] == 2
    assert court.get_court()["open_case_tail"] == 1


def test_case_requires_plaintiff_control_and_enacted_law(
    direct_vm,
    direct_deploy,
    direct_alice,
    direct_bob,
    direct_charlie,
):
    court = deploy_court(direct_vm, direct_deploy, direct_bob)
    install_republic_hook(direct_vm, direct_alice, direct_bob)
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("FACTION_CONTROLLER_ONLY"):
        court.file_case(
            "CASE-UNAUTHORIZED-1",
            "REFORMERS",
            "MERCHANTS",
            1,
            "[1]",
            "This sufficiently detailed claim was filed by somebody without control of the plaintiff faction.",
        )

    install_republic_hook(direct_vm, direct_alice, direct_bob, enacted=False)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("CITED_LAW_NOT_EFFECTIVE"):
        court.file_case(
            "CASE-PENDING-LAW-1",
            "REFORMERS",
            "MERCHANTS",
            1,
            "[1]",
            "This sufficiently detailed claim improperly relies on a law that is still pending.",
        )


def test_briefs_ruling_finality_precedent_and_sanction_message(
    direct_vm,
    direct_deploy,
    direct_alice,
    direct_bob,
):
    court = deploy_court(direct_vm, direct_deploy, direct_bob)
    posts = install_republic_hook(direct_vm, direct_alice, direct_bob)
    file_standard_case(court, direct_vm, direct_alice)

    court.submit_brief(
        1,
        "REFORMERS",
        "The rationale directly ties the attack to the reformers' protected support for lawful civic reform.",
    )
    direct_vm.sender = direct_bob
    court.submit_brief(
        1,
        "MERCHANTS",
        "The action was normal political competition and did not say the enacted law itself caused the target choice.",
    )

    direct_vm.warp(as_iso(court.get_case(1)["brief_deadline"]))
    direct_vm.mock_llm(r".*consensus-critical constitutional court for the political strategy game Loophole.*", compact(violation_ruling()))
    court.resolve_case(1)
    assert court.get_case(1)["status"] == "APPEAL_WINDOW"

    direct_vm.clear_mocks()
    direct_vm.mock_llm(r".*Independently audit a consensus-critical Loophole court ruling.*", '{"accept":true}')
    assert direct_vm.run_validator() is True

    direct_vm.warp(as_iso(court.get_case(1)["appeal_deadline"]))
    court.finalize_case(1)
    case = court.get_case(1)
    precedent = court.get_precedent(1)

    assert case["status"] == "FINAL"
    assert case["sanction"] == "MINOR"
    assert precedent["case_id"] == 1
    assert precedent["verdict"] == "VIOLATION"
    assert court.get_court()["finalized_case_count"] == 1
    assert len(posts) == 1
    assert posts[0]["calldata"]["method"] == "apply_court_ruling"
    assert posts[0]["calldata"]["args"][1] == 1
    assert posts[0]["calldata"]["args"][2] == "MERCHANTS"
    assert posts[0]["calldata"]["args"][3] == "MINOR"


def test_failed_sanction_callback_can_be_recovered_permissionlessly_and_idempotently(
    direct_vm,
    direct_deploy,
    direct_alice,
    direct_bob,
    direct_charlie,
):
    court = deploy_court(direct_vm, direct_deploy, direct_bob)
    applied_actions = set()
    posts = install_republic_hook(
        direct_vm,
        direct_alice,
        direct_bob,
        applied_actions=applied_actions,
    )
    file_standard_case(court, direct_vm, direct_alice)
    direct_vm.warp(as_iso(court.get_case(1)["brief_deadline"]))
    direct_vm.mock_llm(
        r".*consensus-critical constitutional court for the political strategy game Loophole.*",
        compact(violation_ruling("REPRIMAND")),
    )
    court.resolve_case(1)
    direct_vm.warp(as_iso(court.get_case(1)["appeal_deadline"]))
    court.finalize_case(1)

    finalized = court.get_case(1)
    assert finalized["status"] == "FINAL"
    assert finalized["sanction_applied"] is False
    assert finalized["sanction_dispatch_count"] == 1
    assert len(posts) == 1

    # Any account may replay the finalized callback after an asynchronous child
    # message failure. The republic remains the source of truth for whether it
    # was actually applied.
    direct_vm.sender = direct_charlie
    assert court.recover_sanction(1) is True
    assert len(posts) == 2
    assert court.get_case(1)["sanction_dispatch_count"] == 2

    applied_actions.add((1, "MERCHANTS"))
    assert court.get_case(1)["sanction_applied"] is True
    assert court.recover_sanction(1) is False
    assert len(posts) == 2


def test_existing_action_sanction_prevents_a_second_claim_dispatch(
    direct_vm,
    direct_deploy,
    direct_alice,
    direct_bob,
):
    court = deploy_court(direct_vm, direct_deploy, direct_bob)
    posts = install_republic_hook(
        direct_vm,
        direct_alice,
        direct_bob,
        applied_actions={(1, "MERCHANTS")},
    )
    file_standard_case(court, direct_vm, direct_alice)
    direct_vm.warp(as_iso(court.get_case(1)["brief_deadline"]))
    direct_vm.mock_llm(
        r".*consensus-critical constitutional court for the political strategy game Loophole.*",
        compact(violation_ruling("MAJOR")),
    )
    court.resolve_case(1)
    direct_vm.warp(as_iso(court.get_case(1)["appeal_deadline"]))
    court.finalize_case(1)

    case = court.get_case(1)
    assert case["status"] == "FINAL"
    assert case["sanction_applied"] is True
    assert case["sanction_dispatch_count"] == 0
    assert posts == []


def test_appeal_can_reverse_and_finalizes_without_sanction(
    direct_vm,
    direct_deploy,
    direct_alice,
    direct_bob,
):
    court = deploy_court(direct_vm, direct_deploy, direct_bob)
    posts = install_republic_hook(direct_vm, direct_alice, direct_bob)
    file_standard_case(court, direct_vm, direct_alice)
    direct_vm.warp(as_iso(court.get_case(1)["brief_deadline"]))
    direct_vm.mock_llm(r".*consensus-critical constitutional court for the political strategy game Loophole.*", compact(violation_ruling("REPRIMAND")))
    court.resolve_case(1)

    direct_vm.sender = direct_bob
    court.appeal_case(
        1,
        "MERCHANTS",
        "The trial ruling inferred retaliatory motive from advocacy context even though the frozen rationale did not mention the enacted law.",
    )
    direct_vm.sender = direct_alice
    court.submit_appeal_response(
        1,
        "REFORMERS",
        "The action rationale identifies the reformers' centralization program, which the cited civic law specifically protects from retaliation.",
    )
    direct_vm.warp(as_iso(court.get_case(1)["appeal_response_deadline"]))
    appellate = dict(no_violation_ruling(), decision="REVERSED")
    direct_vm.clear_mocks()
    direct_vm.mock_llm(r".*consensus-critical appellate court for Loophole.*", compact(appellate))
    court.resolve_appeal(1)

    case = court.get_case(1)
    assert case["status"] == "FINAL"
    assert case["appeal_decision"] == "REVERSED"
    assert case["verdict"] == "NO_VIOLATION"
    assert posts == []

    direct_vm.clear_mocks()
    direct_vm.mock_llm(r".*Independently audit a consensus-critical Loophole appellate ruling.*", '{"accept":true}')
    assert direct_vm.run_validator() is True


def test_closed_ruling_schema_rejects_ai_invented_penalty(
    direct_vm,
    direct_deploy,
    direct_alice,
    direct_bob,
):
    court = deploy_court(direct_vm, direct_deploy, direct_bob)
    install_republic_hook(direct_vm, direct_alice, direct_bob)
    file_standard_case(court, direct_vm, direct_alice)
    direct_vm.warp(as_iso(court.get_case(1)["brief_deadline"]))
    invented = dict(violation_ruling(), legitimacy_penalty=999)
    direct_vm.mock_llm(r".*consensus-critical constitutional court for the political strategy game Loophole.*", compact(invented))

    with direct_vm.expect_revert("[LLM_ERROR] RULING_FIELDS"):
        court.resolve_case(1)
    assert court.get_case(1)["status"] == "BRIEFING"
