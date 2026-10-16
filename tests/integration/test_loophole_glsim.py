"""Five-validator consensus scenario for the Republic V7 lifecycle."""

from __future__ import annotations

import json
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
