"""Five-validator, two-contract consensus integration for Loophole."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from gltest import get_contract_factory, get_validator_factory
from gltest.assertions import tx_execution_succeeded
from gltest.types import CalldataAddress, TransactionStatus
from gltest.utils import extract_contract_address


FACTIONS = [
    {
        "id": "MERCHANTS",
        "name": "Merchant Coalition",
        "doctrine": "Increase private wealth, preserve trade, and maintain commercial stability.",
    },
    {
        "id": "REFORMERS",
        "name": "Civic Reformers",
        "doctrine": "Improve legitimacy, protect citizens, and constrain concentrated power.",
    },
    {
        "id": "TRADITIONALISTS",
        "name": "Old Charter League",
        "doctrine": "Defend institutional continuity, enacted law, and constitutional order.",
    },
    {
        "id": "REVOLUTIONARIES",
        "name": "New Dawn Movement",
        "doctrine": "Replace captured institutions and force rapid constitutional change.",
    },
]

AI_PROMPT = "selecting CONSENSUS-CRITICAL actions"
AI_AUDIT_PROMPT = "Independently audit a CONSENSUS-CRITICAL batch"
CRISIS_PROMPT = "Create one consensus-critical political crisis"
CRISIS_AUDIT_PROMPT = "Independently audit a proposed consensus-critical Loophole crisis"
RULING_PROMPT = "consensus-critical constitutional court"
RULING_AUDIT_PROMPT = "Independently audit a consensus-critical Loophole court ruling"


def _json(value) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def _action(
    faction_id: str,
    action_type: str,
    rationale: str,
    *,
    target_faction_id: str = "",
    target_law_id: int = 0,
    title: str = "",
    text: str = "",
) -> dict:
    return {
        "faction_id": faction_id,
        "action_type": action_type,
        "target_faction_id": target_faction_id,
        "target_law_id": target_law_id,
        "law_title": title,
        "law_text": text,
        "rationale": rationale,
    }


def _context(timestamp: str, responses: dict[str, str] | None = None) -> dict:
    mock = {"nondet_exec_prompt": responses or {}}
    validators = get_validator_factory().batch_create_mock_validators(
        5,
        mock_llm_response=mock,
    )
    return {
        "genvm_datetime": timestamp,
        "validators": [validator.to_dict() for validator in validators],
    }


def _receipt_dump(receipt) -> str:
    return json.dumps(receipt, indent=2, sort_keys=True, default=str)


def _address_hex(value) -> str:
    return str(getattr(value, "as_hex", value)).lower()


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


def _advance(republic, timestamp: str, actions: list[dict], *, open_crisis: bool = False):
    responses = {
        AI_PROMPT: _json({"actions": actions}),
        AI_AUDIT_PROMPT: _json({"accept": True}),
    }
    if open_crisis:
        responses.update(
            {
                CRISIS_PROMPT: _json(
                    {
                        "title": "The Silent Assembly",
                        "description": "A breakdown in public deliberation has left essential civic decisions without trusted hearings or a legitimate public forum.",
                        "resolution_standard": "Plans must restore open hearings, protect access for every faction, and remain feasible with public resources.",
                        "severity": 2,
                    }
                ),
                CRISIS_AUDIT_PROMPT: _json({"accept": True}),
            }
        )
    receipt = republic.advance_round(args=[]).transact(
        transaction_context=_context(timestamp, responses),
        wait_transaction_status=TransactionStatus.FINALIZED,
    )
    _assert_consensus_success(receipt)
    return receipt


@pytest.mark.integration
def test_autonomous_legislature_court_and_callback_reach_consensus():
    root = Path(__file__).resolve().parents[2]
    republic_factory = get_contract_factory(
        contract_file_path=root / "contracts" / "AutonomousRepublic.py"
    )
    court_factory = get_contract_factory(
        contract_file_path=root / "contracts" / "RepublicCourt.py"
    )

    republic = _deploy(
        republic_factory,
        ["GLSIM-REPUBLIC", _json(FACTIONS), 60, 60, 8],
        "2026-08-25T20:00:00Z",
    )
    court = _deploy(
        court_factory,
        [CalldataAddress(republic.address), 60, 60],
        "2026-08-25T20:00:10Z",
    )
    link_receipt = republic.set_court_address(
        args=[CalldataAddress(court.address)]
    ).transact(
        transaction_context=_context("2026-08-25T20:00:20Z"),
        wait_transaction_status=TransactionStatus.FINALIZED,
    )
    _assert_consensus_success(link_receipt)
    assert republic.get_game(args=[]).call()["court_configured"] is True
    assert _address_hex(court.get_court(args=[]).call()["republic_address"]) == republic.address.lower()

    _advance(
        republic,
        "2026-08-25T20:02:30Z",
        [
            _action(
                "MERCHANTS",
                "PROPOSE_CHARTER",
                "A predictable public forum protects commerce from arbitrary political disruption.",
                title="Open Assembly Charter",
                text="Every faction must preserve open public hearings and may not obstruct lawful civic deliberation or access to the assembly.",
            ),
            _action("REFORMERS", "BUILD_INFLUENCE", "Civic organizers build durable support for accountable public institutions."),
            _action("TRADITIONALISTS", "BUILD_INFLUENCE", "Institutional stewards strengthen their ability to defend constitutional continuity."),
            _action("REVOLUTIONARIES", "GROW_WEALTH", "Independent resources reduce reliance on institutions the movement seeks to replace."),
        ],
    )
    assert republic.get_law(args=[1]).call()["status"] == "PENDING"

    _advance(
        republic,
        "2026-08-25T20:05:00Z",
        [
            _action("MERCHANTS", "GROW_WEALTH", "Commercial reserves prepare the coalition for the next contested policy cycle."),
            _action("REFORMERS", "SUPPORT_LAW", "Open hearings directly advance accountable government and citizen legitimacy.", target_law_id=1),
            _action("TRADITIONALISTS", "SUPPORT_LAW", "A written hearing guarantee strengthens orderly constitutional procedure.", target_law_id=1),
            _action("REVOLUTIONARIES", "SUPPORT_LAW", "Guaranteed public access creates space to challenge captured institutions.", target_law_id=1),
        ],
    )
    enacted = republic.get_law(args=[1]).call()
    assert enacted["status"] == "ENACTED"
    assert enacted["law_kind"] == "CHARTER"
    assert enacted["effective_from_round"] == 3

    _advance(
        republic,
        "2026-08-25T20:07:30Z",
        [
            _action(
                "MERCHANTS",
                "UNDERMINE",
                "The coalition blockades Reformers from the assembly and prevents their scheduled public hearing.",
                target_faction_id="REFORMERS",
            ),
            _action("REFORMERS", "BUILD_INFLUENCE", "Reformers organize citizens to monitor compliance with the new public charter."),
            _action("TRADITIONALISTS", "BUILD_INFLUENCE", "The league builds support for consistent enforcement of enacted constitutional text."),
            _action("REVOLUTIONARIES", "GROW_WEALTH", "The movement funds independent assemblies outside entrenched patronage networks."),
        ],
        open_crisis=True,
    )
    game = republic.get_game(args=[]).call()
    assert game["round_number"] == 4
    assert game["active_crisis_id"] == 1
    assert republic.get_round_action(args=[3, "MERCHANTS"]).call()["source"] == "AI_EMPTY_SEAT"

    claim_receipt = republic.claim_faction(args=["REFORMERS"]).transact(
        transaction_context=_context("2026-08-25T20:07:40Z"),
        wait_transaction_status=TransactionStatus.FINALIZED,
    )
    _assert_consensus_success(claim_receipt)

    file_receipt = court.file_case(
        args=[
            "GLSIM-CASE-1",
            "REFORMERS",
            "MERCHANTS",
            3,
            "[1]",
            "The recorded blockade prevented a scheduled public hearing and violated the charter's guarantee of unobstructed public deliberation.",
        ]
    ).transact(
        transaction_context=_context("2026-08-25T20:08:00Z"),
        wait_transaction_status=TransactionStatus.FINALIZED,
    )
    _assert_consensus_success(file_receipt)
    frozen_case = court.get_case(args=[1]).call()
    assert frozen_case["status"] == "BRIEFING"
    assert frozen_case["evidence_digest"]

    brief_receipt = court.submit_brief(
        args=[
            1,
            "REFORMERS",
            "The recorded blockade expressly prevented a public hearing and denied Reformers access to the assembly guaranteed by the charter.",
        ]
    ).transact(
        transaction_context=_context("2026-08-25T20:08:10Z"),
        wait_transaction_status=TransactionStatus.FINALIZED,
    )
    _assert_consensus_success(brief_receipt)

    ruling = {
        "verdict": "VIOLATION",
        "violated_law_ids": [1],
        "sanction": "REPRIMAND",
        "reason_code": "HEARING_BLOCKADE",
        "reasoning": "The frozen action expressly records a blockade that prevented Reformers from holding a scheduled hearing, directly breaching the charter's access guarantee.",
        "precedent_rule": "Deliberately blocking a faction's scheduled public hearing violates a charter that guarantees open assembly access.",
    }
    resolve_receipt = court.resolve_case(args=[1]).transact(
        transaction_context=_context(
            "2026-08-25T20:09:10Z",
            {
                RULING_PROMPT: _json(ruling),
                RULING_AUDIT_PROMPT: _json({"accept": True}),
            },
        ),
        wait_transaction_status=TransactionStatus.FINALIZED,
    )
    _assert_consensus_success(resolve_receipt)
    assert court.get_case(args=[1]).call()["status"] == "APPEAL_WINDOW"

    finalize_receipt = court.finalize_case(args=[1]).transact(
        transaction_context=_context("2026-08-25T20:10:20Z"),
        wait_transaction_status=TransactionStatus.FINALIZED,
        wait_triggered_transactions=True,
        wait_triggered_transactions_status=TransactionStatus.FINALIZED,
    )
    _assert_consensus_success(finalize_receipt)

    final_case = court.get_case(args=[1]).call()
    assert final_case["status"] == "FINAL"
    assert final_case["precedent_id"] == 1
    assert court.get_court(args=[]).call()["precedent_count"] == 1
    final_game = republic.get_game(args=[]).call()
    assert final_game["court_ruling_count"] == 1
    callback = json.loads(republic.get_court_ruling(args=[1]).call())
    assert callback["case_id"] == 1
    assert callback["defendant_faction_id"] == "MERCHANTS"
    assert callback["sanction"] == "REPRIMAND"
    assert callback["legitimacy_after"] == callback["legitimacy_before"] - 1
    assert callback["stability_after"] == callback["stability_before"]
