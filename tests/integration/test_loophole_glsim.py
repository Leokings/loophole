"""Five-validator consensus scenario for the Republic V7 lifecycle."""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path

import pytest
from gltest import get_contract_factory, get_validator_factory
from gltest.assertions import tx_execution_succeeded
from gltest.types import TransactionStatus
from gltest.utils import extract_contract_address


FACTIONS = [
    {"id": "MERCHANTS", "name": "Merchant Coalition", "doctrine": "Increase private wealth, preserve trade, and maintain commercial stability.", "fallback_action": "GROW_WEALTH"},
    {"id": "REFORMERS", "name": "Civic Reformers", "doctrine": "Improve legitimacy, protect citizens, and constrain concentrated power.", "fallback_action": "BUILD_INFLUENCE"},
    {"id": "TRADITIONALISTS", "name": "Old Charter League", "doctrine": "Defend institutional continuity, enacted law, and constitutional order.", "fallback_action": "BUILD_INFLUENCE"},
    {"id": "REVOLUTIONARIES", "name": "New Dawn Movement", "doctrine": "Replace captured institutions and force rapid constitutional change.", "fallback_action": "BUILD_INFLUENCE"},
]

AI_PROMPT = "selecting CONSENSUS-CRITICAL actions"
AI_AUDIT_PROMPT = "Independently audit a CONSENSUS-CRITICAL batch of autonomous faction actions"
CERTIFICATION_PROMPT = "Decide whether one proposed Loophole law is adjudicable"
CRISIS_PROMPT = "Create one consensus-critical political crisis for the Loophole game state"
CRISIS_AUDIT_PROMPT = "Independently audit a proposed consensus-critical Loophole crisis"
CRISIS_JUDGMENT_PROMPT = "Judge one Loophole crisis response against one success criterion"
CASE_PROMPT = "Decide whether one recorded Loophole faction action falls under one enacted law"
CASE_JUDGMENT = "No faction may UNDERMINE a faction that holds public office."


def _json(value) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def _context(timestamp: str, responses: dict[str, str] | None = None) -> dict:
    validators = get_validator_factory().batch_create_mock_validators(
        5,
        mock_llm_response={"nondet_exec_prompt": responses or {}},
    )
    return {"genvm_datetime": timestamp, "validators": [validator.to_dict() for validator in validators]}


def _receipt_dump(receipt) -> str:
    return json.dumps(receipt, indent=2, sort_keys=True, default=str)


def _assert_consensus_success(receipt) -> None:
    assert tx_execution_succeeded(receipt), _receipt_dump(receipt)
    status = receipt.get("status_name") or receipt.get("statusName")
    result = receipt.get("result_name") or receipt.get("resultName")
    if status is not None:
        assert status == "FINALIZED", _receipt_dump(receipt)
    if result is not None:
        assert result in ("AGREE", "MAJORITY_AGREE"), _receipt_dump(receipt)


def _deploy(factory, args: list, timestamp: str):
    receipt = factory.deploy_contract_tx(
        args=args,
        transaction_context=_context(timestamp),
        wait_transaction_status=TransactionStatus.FINALIZED,
    )
    _assert_consensus_success(receipt)
    return factory.build_contract(extract_contract_address(receipt))


def _choice(faction_id: str, option_id: str, rationale: str, *, title="", text="", stances=None) -> dict:
    return {
        "faction_id": faction_id,
        "option_id": option_id,
        "law_title": title,
        "law_text": text,
        "rationale": rationale,
        "stances": stances or [],
    }


def _advance(republic, timestamp: str, choices: list[dict], *, invalid_merchant=False):
    if invalid_merchant:
        choices = [dict(item) for item in choices]
        choices[0]["option_id"] = "NOT_IN_MERCHANTS_MENU"
    responses = {
        AI_PROMPT: _json({"actions": choices}),
        AI_AUDIT_PROMPT: _json({"violations": []}),
    }
    receipt = republic.advance_round(args=[]).transact(
        transaction_context=_context(timestamp, responses),
        wait_transaction_status=TransactionStatus.FINALIZED,
    )
    _assert_consensus_success(receipt)
    return receipt


def _trace(label: str, receipt, state) -> None:
    tx_hash = (receipt.get("transaction_hash") or receipt.get("transactionHash") or receipt.get("hash")
               or "(hash unavailable)") if receipt is not None else "(nested transaction)"
    status = (receipt.get("status_name") or receipt.get("statusName") or receipt.get("status")) \
        if receipt is not None else "FINALIZED"
    print(f"TRACE {label}: {tx_hash} -> {status} -> {state}", flush=True)


def _simple_choices(*, undermines: dict[str, str] | None = None, amend: str | None = None,
                    file_suit: tuple[str, str, int] | None = None, stances=None) -> list[dict]:
    undermines = undermines or {}
    stances = stances or []
    choices = []
    for faction_id in ("MERCHANTS", "REFORMERS", "TRADITIONALISTS", "REVOLUTIONARIES"):
        if faction_id in undermines:
            choices.append(_choice(faction_id, "UNDERMINE:" + undermines[faction_id],
                                   "The recorded action advances this faction's public political goal."))
        elif amend == faction_id:
            choices.append(_choice(
                faction_id, "AMEND_LAW:1", "Update the rule so its scope is clear for every rival faction.",
                title="Universal Conduct Rule", text="No faction may UNDERMINE any other faction.",
            ))
        elif file_suit is not None and faction_id == file_suit[0]:
            defendant, law_id = file_suit[1], file_suit[2]
            choices.append(_choice(
                faction_id, f"FILE_SUIT:{defendant}:{law_id}",
                "The earlier action appears to violate the certified public conduct rule.",
            ))
        else:
            choices.append(_choice(
                faction_id, "BUILD_INFLUENCE", "Build support for this faction's public political goals.",
                stances=[entry for entry in stances if entry["law_id"] == 1 or entry["law_id"] == 2],
            ))
    return choices


def _case_receipt(court, case_id: int, timestamp: str, label: str, quote: str = CASE_JUDGMENT):
    receipt = court.resolve_case(args=[case_id]).transact(
        transaction_context=_context(
            timestamp,
            {CASE_PROMPT: _json({"label": label, "quote": quote})},
        ),
        wait_transaction_status=TransactionStatus.FINALIZED,
    )
    _assert_consensus_success(receipt)
    return receipt


def _recover_finalized_case(court, caselaw, republic, case_id: int, timestamp: str) -> str:
    """Drain finalized case effects across GLSim's one-post-per-transaction queue."""
    case = court.get_case(args=[case_id]).call()
    base = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    for attempt in range(3):
        holding = caselaw.get_holding(args=[case["key"]]).call()
        outcome = republic.get_case_outcome(args=[case_id]).call()
        holding_ready = case["label"] == "UNCLEAR" or bool(holding.get("label"))
        outcome_ready = case["verdict"] == "AMBIGUOUS" or bool(outcome)
        if holding_ready and outcome_ready:
            return outcome
        moment = (base + timedelta(seconds=attempt)).isoformat().replace("+00:00", "Z")
        receipt = court.recover_case_effects(args=[case_id]).transact(
            transaction_context=_context(moment),
            wait_transaction_status=TransactionStatus.FINALIZED,
        )
        _assert_consensus_success(receipt)
    holding = caselaw.get_holding(args=[case["key"]]).call()
    outcome = republic.get_case_outcome(args=[case_id]).call()
    assert case["label"] == "UNCLEAR" or holding.get("label"), holding
    assert case["verdict"] == "AMBIGUOUS" or outcome
    return outcome


def _expect_revert(call, timestamp: str, error_code: str) -> None:
    try:
        receipt = call.transact(
            transaction_context=_context(timestamp),
            wait_transaction_status=TransactionStatus.FINALIZED,
        )
    except Exception as error:
        assert error_code in str(error), f"expected {error_code}, got {error!r}"
        return
    dump = _receipt_dump(receipt)
    assert not tx_execution_succeeded(receipt), f"expected {error_code} revert, got success: {dump}"
    assert error_code in dump, f"expected {error_code}, got: {dump}"


@pytest.mark.integration
def test_republic_v7_five_validator_lifecycle_reaches_consensus():
    root = Path(__file__).resolve().parents[2]
    factory = get_contract_factory(contract_file_path=root / "contracts" / "AutonomousRepublic.py")
    republic = _deploy(
        factory,
        ["GLSIM-REPUBLIC-V7", _json(FACTIONS), 60, 60, 8, 60, 60],
        "2026-08-25T20:00:00Z",
    )

    _advance(
        republic,
        "2026-08-25T20:02:00Z",
        [
            _choice("MERCHANTS", "GROW_WEALTH", "Build trade reserves for future negotiations."),
            _choice("REFORMERS", "BUILD_INFLUENCE", "Build civic support for measurable public rules."),
            _choice("TRADITIONALISTS", "BUILD_INFLUENCE", "Strengthen institutions that enforce written law."),
            _choice("REVOLUTIONARIES", "BUILD_INFLUENCE", "Build independent support for political change."),
        ],
        invalid_merchant=True,
    )
    assert republic.get_round_action(args=[1, "MERCHANTS"]).call()["source"] == "AI_FALLBACK"
    assert republic.get_round_action(args=[1, "REFORMERS"]).call()["action_type"] == "BUILD_INFLUENCE"

    _advance(
        republic,
        "2026-08-25T20:04:00Z",
        [
            _choice("MERCHANTS", "GROW_WEALTH", "Keep commercial reserves available."),
            _choice(
                "REFORMERS",
                "PROPOSE_LAW",
                "Create an observable rule that a recorded action can verify.",
                title="Single Action Rule",
                text="A faction may use one action to build two influence in a round.",
            ),
            _choice("TRADITIONALISTS", "BUILD_INFLUENCE", "Preserve the capacity to enforce an agreed rule."),
            _choice("REVOLUTIONARIES", "BUILD_INFLUENCE", "Build public capacity for accountable institutions."),
        ],
    )
    law = republic.get_law(args=[1]).call()
    assert law["status"] == "PENDING"
    assert law["closes_after_round"] == 4
    cert = republic.certify_law(args=[1]).transact(
        transaction_context=_context(
            "2026-08-25T20:04:10Z",
            {CERTIFICATION_PROMPT: _json({"label": "ADJUDICABLE", "quote": "A faction may use one action to build two influence in a round."})},
        ),
        wait_transaction_status=TransactionStatus.FINALIZED,
    )
    _assert_consensus_success(cert)
    assert republic.get_law(args=[1]).call()["certification"] == "ADJUDICABLE"

    _advance(
        republic,
        "2026-08-25T20:06:00Z",
        [
            _choice("MERCHANTS", "GROW_WEALTH", "Fund commerce while supporting a measurable law.", stances=[{"law_id": 1, "stance": "SUPPORT"}]),
            _choice("REFORMERS", "BUILD_INFLUENCE", "Build civic influence while sponsoring the proposed rule."),
            _choice("TRADITIONALISTS", "BUILD_INFLUENCE", "Support a rule measured through recorded actions.", stances=[{"law_id": 1, "stance": "SUPPORT"}]),
            _choice("REVOLUTIONARIES", "BUILD_INFLUENCE", "Support an observable limit on faction actions.", stances=[{"law_id": 1, "stance": "SUPPORT"}]),
        ],
    )
    assert republic.get_game(args=[]).call()["crisis_open_round"] == 4

    open_receipt = republic.open_crisis(args=[]).transact(
        transaction_context=_context(
            "2026-08-25T20:06:10Z",
            {
                CRISIS_PROMPT: _json({
                    "title": "Harbor Delivery Disruption",
                    "description": "A disruption in harbor deliveries has left several districts without reliable access to essential supplies.",
                    "success_criterion": "A response names a delivery step that restores supplies to a district.",
                }),
                CRISIS_AUDIT_PROMPT: _json({"label": "ACCEPT"}),
            },
        ),
        wait_transaction_status=TransactionStatus.FINALIZED,
    )
    _assert_consensus_success(open_receipt)
    assert republic.get_crisis(args=[1]).call()["severity"] == 1

    response = "Publish a daily harbor delivery schedule and open protected depots for every district."
    _advance(
        republic,
        "2026-08-25T20:08:00Z",
        [
            _choice("MERCHANTS", "RESPOND_CRISIS", response, stances=[{"law_id": 1, "stance": "SUPPORT"}]),
            _choice("REFORMERS", "RESPOND_CRISIS", response),
            _choice("TRADITIONALISTS", "RESPOND_CRISIS", response),
            _choice("REVOLUTIONARIES", "RESPOND_CRISIS", response),
        ],
    )
    assert republic.get_law(args=[1]).call()["status"] == "ENACTED"
    _advance(
        republic,
        "2026-08-25T20:10:00Z",
        [
            _choice("MERCHANTS", "GROW_WEALTH", "Maintain reserves after the harbor plan is recorded."),
            _choice("REFORMERS", "BUILD_INFLUENCE", "Build civic capacity after recording the response plan."),
            _choice("TRADITIONALISTS", "BUILD_INFLUENCE", "Strengthen public institutions through lawful action."),
            _choice("REVOLUTIONARIES", "BUILD_INFLUENCE", "Organize for fair access to essential supplies."),
        ],
    )
    for faction_id in ("MERCHANTS", "REFORMERS", "TRADITIONALISTS", "REVOLUTIONARIES"):
        judge_receipt = republic.judge_crisis_response(args=[1, faction_id]).transact(
            transaction_context=_context(
                "2026-08-25T20:10:10Z",
                {CRISIS_JUDGMENT_PROMPT: _json({"label": "MET", "quote": response})},
            ),
            wait_transaction_status=TransactionStatus.FINALIZED,
        )
        _assert_consensus_success(judge_receipt)
    close_receipt = republic.close_crisis(args=[1]).transact(
        transaction_context=_context("2026-08-25T20:10:40Z"),
        wait_transaction_status=TransactionStatus.FINALIZED,
    )
    _assert_consensus_success(close_receipt)
    assert republic.get_crisis(args=[1]).call()["outcome"] == "RESOLVED"

    fallback_game = republic.get_game(args=[]).call()
    fallback_timestamp = "2026-08-25T20:13:40Z"
    fallback_receipt = republic.advance_round_fallback(args=[]).transact(
        transaction_context=_context(fallback_timestamp),
        wait_transaction_status=TransactionStatus.FINALIZED,
    )
    _assert_consensus_success(fallback_receipt)
    assert republic.get_round_action(args=[6, "MERCHANTS"]).call()["source"] == "AI_FALLBACK"
    assert fallback_game["round_number"] == 6

    for round_number, timestamp in ((7, "2026-08-25T20:15:40Z"), (8, "2026-08-25T20:17:40Z")):
        _advance(
            republic,
            timestamp,
            [
                _choice("MERCHANTS", "GROW_WEALTH", "Maintain trade reserves for the next season."),
                _choice("REFORMERS", "BUILD_INFLUENCE", "Build public support for accountable rules."),
                _choice("TRADITIONALISTS", "BUILD_INFLUENCE", "Preserve institutions that enforce written law."),
                _choice("REVOLUTIONARIES", "BUILD_INFLUENCE", "Build support for a fair next season."),
            ],
        )
        assert republic.get_round_action(args=[round_number, "MERCHANTS"]).call()["action_type"] == "GROW_WEALTH"

    finalize_receipt = republic.finalize_season(args=[]).transact(
        transaction_context=_context("2026-08-25T20:18:40Z"),
        wait_transaction_status=TransactionStatus.FINALIZED,
    )
    _assert_consensus_success(finalize_receipt)
    next_game = republic.get_game(args=[]).call()
    assert next_game["season_number"] == 2
    assert next_game["season_status"] == "ACTIVE"
    assert next_game["round_number"] == 9
    assert republic.get_faction(args=["MERCHANTS"]).call()["influence"] == 5
    assert republic.get_faction(args=["MERCHANTS"]).call()["wealth"] == 5


@pytest.mark.integration
def test_three_contract_caselaw_court_file_suit_lifecycle():
    from genlayer_py.types import CalldataAddress

    root = Path(__file__).resolve().parents[2]
    republic_factory = get_contract_factory(contract_file_path=root / "contracts" / "AutonomousRepublic.py")
    caselaw_factory = get_contract_factory(contract_file_path=root / "contracts" / "CaseLaw.py")
    court_factory = get_contract_factory(contract_file_path=root / "contracts" / "RepublicCourt.py")
    republic = _deploy(republic_factory, ["GLSIM-COURT-V7", _json(FACTIONS), 60, 60, 12, 60, 60],
                       "2026-08-26T20:00:00Z")
    caselaw = _deploy(caselaw_factory, [], "2026-08-26T20:00:00Z")
    court = _deploy(court_factory, [CalldataAddress(republic.address), CalldataAddress(caselaw.address), 60, 120],
                    "2026-08-26T20:00:00Z")

    set_court = caselaw.set_court(args=[CalldataAddress(court.address)]).transact(
        transaction_context=_context("2026-08-26T20:00:10Z"),
        wait_transaction_status=TransactionStatus.FINALIZED,
    )
    _assert_consensus_success(set_court)
    _trace("caselaw.set_court", set_court, caselaw.get_registry_summary(args=[]).call())
    set_links = republic.set_links(args=[CalldataAddress(court.address), CalldataAddress(caselaw.address)]).transact(
        transaction_context=_context("2026-08-26T20:00:20Z"),
        wait_transaction_status=TransactionStatus.FINALIZED,
    )
    _assert_consensus_success(set_links)
    _trace("republic.set_links", set_links, republic.get_game(args=[]).call()["court_configured"])

    law_v1 = "No faction may UNDERMINE a faction that holds public office."
    _advance(republic, "2026-08-26T20:02:00Z", [
        _choice("MERCHANTS", "BUILD_INFLUENCE", "Build commercial support for future decisions."),
        _choice("REFORMERS", "PROPOSE_LAW", "Set a clear rule for actions against officeholders.",
                title="Officeholder Protection", text=law_v1),
        _choice("TRADITIONALISTS", "BUILD_INFLUENCE", "Preserve capacity for public institutions."),
        _choice("REVOLUTIONARIES", "BUILD_INFLUENCE", "Build support for accountable political change."),
    ])
    cert1 = republic.certify_law(args=[1]).transact(
        transaction_context=_context("2026-08-26T20:02:10Z", {
            CERTIFICATION_PROMPT: _json({"label": "ADJUDICABLE", "quote": law_v1}),
        }),
        wait_transaction_status=TransactionStatus.FINALIZED,
    )
    _assert_consensus_success(cert1)
    _advance(republic, "2026-08-26T20:04:00Z", _simple_choices(stances=[{"law_id": 1, "stance": "SUPPORT"}]))
    _advance(republic, "2026-08-26T20:06:00Z", _simple_choices(stances=[{"law_id": 1, "stance": "SUPPORT"}]))
    assert republic.get_law(args=[1]).call()["status"] == "ENACTED"
    _trace("law v1 enacted", cert1, republic.get_law(args=[1]).call())
    _advance(republic, "2026-08-26T20:08:00Z", _simple_choices())

    holders = {republic.get_office(args=[office]).call()["holder_faction_id"]
               for office in ("EXECUTIVE", "SPEAKER", "TREASURER")}
    nonholders = [faction for faction in ("MERCHANTS", "REFORMERS", "TRADITIONALISTS", "REVOLUTIONARIES")
                  if faction not in holders]
    assert nonholders
    nonholder_target = nonholders[0]
    nonholder_actor = next(f for f in holders if f != "REFORMERS")
    officer_actor = next(f for f in holders if f not in ("REFORMERS", nonholder_actor))
    officer_target = next(f for f in holders if f not in ("REFORMERS", officer_actor))
    _advance(republic, "2026-08-26T20:10:00Z", _simple_choices(undermines={
        nonholder_actor: nonholder_target, officer_actor: officer_target,
    }))

    claim = republic.claim_faction(args=["REFORMERS"]).transact(
        transaction_context=_context("2026-08-26T20:10:10Z"),
        wait_transaction_status=TransactionStatus.FINALIZED,
    )
    _assert_consensus_success(claim)
    case1 = court.file_case(args=[
        "HUMAN-SAFE-HARBOR", "REFORMERS", nonholder_actor, 5, 1,
        "The recorded action appears to target a faction protected by the certified rule.",
    ]).transact(transaction_context=_context("2026-08-26T20:10:20Z"),
                wait_transaction_status=TransactionStatus.FINALIZED)
    _assert_consensus_success(case1)
    case_id1 = int(court.get_court(args=[]).call()["case_count"])
    _trace("human non-officeholder suit filed", case1, court.get_case(args=[case_id1]).call()["status"])
    _expect_revert(
        court.file_case(args=["DUPLICATE-CLAIM", "REFORMERS", nonholder_actor, 5, 1,
                              "A second reference cannot duplicate the same action and rule claim."]),
        "2026-08-26T20:10:30Z", "CASE_CLAIM_DUPLICATE",
    )
    resolved1 = _case_receipt(court, case_id1, "2026-08-26T20:11:30Z", "NOT_COVERED")
    case1_record = court.get_case(args=[case_id1]).call()
    assert court.get_case(args=[case_id1]).call()["label"] == "NOT_COVERED"
    outcome1 = _recover_finalized_case(court, caselaw, republic, case_id1, "2026-08-26T20:11:31Z")
    safe_harbor = caselaw.get_holding(args=[case1_record["key"]]).call()
    assert safe_harbor["label"] == "NOT_COVERED"
    assert json.loads(outcome1)["verdict"] == "NO_VIOLATION"
    _trace("NOT_COVERED finalized", resolved1, {"holding": safe_harbor, "outcome": outcome1})

    case2 = court.file_case(args=[
        "HUMAN-OFFICEHOLDER-BREACH", "REFORMERS", officer_actor, 5, 1,
        "The recorded action undermined an officeholder under the certified rule.",
    ]).transact(transaction_context=_context("2026-08-26T20:11:40Z"),
                wait_transaction_status=TransactionStatus.FINALIZED)
    _assert_consensus_success(case2)
    case_id2 = int(court.get_court(args=[]).call()["case_count"])
    case2_record = court.get_case(args=[case_id2]).call()
    if case2_record["status"] == "STAYED":
        raise AssertionError("different target classes should not stay behind the safe-harbor case")
    plaintiff_before_breach = republic.get_faction(args=["REFORMERS"]).call()["legitimacy"]
    resolved2 = _case_receipt(court, case_id2, "2026-08-26T20:12:50Z", "COVERED_BREACH")
    holding2 = caselaw.get_holding(args=[case2_record["key"]]).call()
    assert holding2["label"] == "COVERED_BREACH"
    outcome2 = _recover_finalized_case(court, caselaw, republic, case_id2, "2026-08-26T20:12:55Z")
    assert json.loads(outcome2)["verdict"] == "VIOLATION"
    assert json.loads(outcome2)["sanction"] == "REPRIMAND"
    assert republic.get_faction(args=["REFORMERS"]).call()["legitimacy"] == min(10, plaintiff_before_breach + 1)
    assert republic.is_court_action_sanctioned(args=[5, officer_actor]).call() is True
    _trace("officeholder breach finalized", resolved2, outcome2)

    suit_actor = next(f for f in ("REVOLUTIONARIES", "MERCHANTS", "TRADITIONALISTS") if f != officer_actor)
    _advance(republic, "2026-08-26T20:13:00Z", _simple_choices(file_suit=(suit_actor, officer_actor, 1)))
    ai_case_id = int(court.get_court(args=[]).call()["case_count"])
    ai_case = court.get_case(args=[ai_case_id]).call()
    assert ai_case["source"] == "REPUBLIC"
    assert ai_case["status"] == "SUMMARY"
    assert ai_case["label"] == "COVERED_BREACH"
    ai_outcome = _recover_finalized_case(court, caselaw, republic, ai_case_id, "2026-08-26T20:13:01Z")
    assert json.loads(ai_outcome)["verdict"] == "VIOLATION"
    _trace("AI FILE_SUIT summary", None, {"case_id": ai_case_id, "status": ai_case["status"], "label": ai_case["label"]})

    # Rounds 7-9 pass the amendment vote; v2 takes effect in round 10.
    _advance(republic, "2026-08-26T20:15:01Z", _simple_choices(amend="REFORMERS"))
    law2_text = "No faction may UNDERMINE any other faction."
    cert2 = republic.certify_law(args=[2]).transact(
        transaction_context=_context("2026-08-26T20:15:10Z", {
            CERTIFICATION_PROMPT: _json({"label": "ADJUDICABLE", "quote": law2_text}),
        }),
        wait_transaction_status=TransactionStatus.FINALIZED,
    )
    _assert_consensus_success(cert2)
    _advance(republic, "2026-08-26T20:17:01Z", _simple_choices(stances=[{"law_id": 2, "stance": "SUPPORT"}]))
    _advance(republic, "2026-08-26T20:19:01Z", _simple_choices(stances=[{"law_id": 2, "stance": "SUPPORT"}]))
    assert republic.get_law(args=[2]).call()["status"] == "ENACTED"
    latest_holders = {republic.get_office(args=[office]).call()["holder_faction_id"]
                      for office in ("EXECUTIVE", "SPEAKER", "TREASURER")}
    v2_nonholder = next(f for f in ("MERCHANTS", "REFORMERS", "TRADITIONALISTS", "REVOLUTIONARIES")
                        if f not in latest_holders)
    v2_actor = next(f for f in latest_holders if f != "REFORMERS")
    _advance(republic, "2026-08-26T20:23:01Z", _simple_choices(undermines={v2_actor: v2_nonholder}))
    _expect_revert(
        court.file_case(args=["CITE-RETIRED-V1", "REFORMERS", v2_actor, 10, 1,
                              "The old rule is cited for a later action after amendment."]),
        "2026-08-26T20:23:15Z", "CITED_LAW_NOT_EFFECTIVE",
    )
    case5 = court.file_case(args=[
        "V2-FIRST-IMPRESSION", "REFORMERS", v2_actor, 10, 2,
        "The post-amendment action falls within the universal conduct rule.",
    ]).transact(transaction_context=_context("2026-08-26T20:23:20Z"),
                wait_transaction_status=TransactionStatus.FINALIZED)
    _assert_consensus_success(case5)
    case_id5 = int(court.get_court(args=[]).call()["case_count"])
    resolved5 = _case_receipt(court, case_id5, "2026-08-26T20:24:30Z", "COVERED_BREACH", law2_text)
    assert court.get_case(args=[case_id5]).call()["label"] == "COVERED_BREACH"
    outcome5 = _recover_finalized_case(court, caselaw, republic, case_id5, "2026-08-26T20:24:31Z")
    _trace("v2 first impression", resolved5, caselaw.get_holding(args=[court.get_case(args=[case_id5]).call()["key"]]).call())

    _expect_revert(
        court.file_case_from_republic(args=["FORGED-REPUBLIC", "REFORMERS", v2_actor, 10, 2,
                                            "A forged republic filing must be rejected."]),
        "2026-08-26T20:24:40Z", "REPUBLIC_ONLY",
    )
    _expect_revert(
        caselaw.record_holding(args=["2|UNDERMINE|OTHER_FACTION", 2, "UNDERMINE", "OTHER_FACTION",
                                     "NOT_COVERED", law2_text, 99, "f" * 64]),
        "2026-08-26T20:24:50Z", "COURT_ONLY",
    )
    before_recovery = republic.get_faction(args=["REFORMERS"]).call()["legitimacy"]
    before_outcomes = republic.get_game(args=[]).call()["case_outcome_count"]
    recovery = court.recover_case_effects(args=[case_id5]).transact(
        transaction_context=_context("2026-08-26T20:25:00Z"),
        wait_transaction_status=TransactionStatus.FINALIZED,
    )
    _assert_consensus_success(recovery)
    assert republic.get_faction(args=["REFORMERS"]).call()["legitimacy"] == before_recovery
    assert republic.get_game(args=[]).call()["case_outcome_count"] == before_outcomes
    assert republic.get_case_outcome(args=[case_id5]).call() == outcome5
    assert court.get_storage_stats(args=[]).call()["case_count"] == 4
