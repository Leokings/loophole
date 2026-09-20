r"""Opt-in, resumable two-wallet proof against the live Loophole republic.

Set ``LOOPHOLE_LIVE_EVIDENCE=1`` and run this test through ``gltest`` with one
of these stages: ``state``, ``claim``, ``advance``, ``commit``, ``reveal``,
``settle``, or ``release``. The generated account keys and nonces remain in the
gitignored ``.live-evidence`` directory; the public report excludes them.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import secrets
from time import sleep, time

import pytest

from genlayer_py import create_account
from genlayer_py.exceptions import GenLayerError
from gltest import get_contract_factory
from gltest.assertions import tx_execution_succeeded
from gltest.clients import get_gl_client
from gltest.types import TransactionHashVariant, TransactionStatus


REPUBLIC_ADDRESS = "0x6ECdc692BE72c75a3CD15197c32D61dbd61660D8"
PROJECT_ROOT = Path(__file__).resolve().parents[2]
STATE_PATH = PROJECT_ROOT / ".live-evidence" / "loophole-6ecdc692-private.json"
PUBLIC_PATH = PROJECT_ROOT / ".live-evidence" / "loophole-public.json"
FINALIZED_WAIT_MS = 4_000
FINALIZED_RETRIES = 180

ACTORS = {
    "merchant": {
        "faction_id": "MERCHANTS",
        "action_type": "GROW_WEALTH",
        "rationale": "Commercial reserves protect public trade from the republic's next period of instability.",
    },
    "reformer": {
        "faction_id": "REFORMERS",
        "action_type": "BUILD_INFLUENCE",
        "rationale": "Civic organizers build durable support for transparent and accountable institutions.",
    },
}


pytestmark = pytest.mark.skipif(
    os.getenv("LOOPHOLE_LIVE_EVIDENCE") != "1",
    reason="set LOOPHOLE_LIVE_EVIDENCE=1 to create real StudioNet transactions",
)


def save_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(value, indent=2), encoding="utf-8")
    temporary.replace(path)


def load_or_create_state() -> dict:
    if STATE_PATH.exists():
        state = json.loads(STATE_PATH.read_text(encoding="utf-8"))
        assert state["republic_address"].lower() == REPUBLIC_ADDRESS.lower()
        return state

    wallets = {}
    for actor in ACTORS:
        account = create_account()
        wallets[actor] = {
            "address": account.address,
            "private_key": "0x" + account.key.hex(),
        }
    state = {
        "network": "GenLayer StudioNet",
        "republic_address": REPUBLIC_ADDRESS,
        "wallets": wallets,
        "transactions": {},
        "actions": {},
    }
    save_json(STATE_PATH, state)
    print(
        "WALLETS_CREATED "
        + " ".join(f"{actor}={details['address']}" for actor, details in wallets.items()),
        flush=True,
    )
    return state


def read_final(call):
    last_error: Exception | None = None
    for attempt in range(20):
        try:
            return call(TransactionHashVariant.LATEST_FINAL)
        except GenLayerError as error:
            last_error = error
            if attempt < 19:
                sleep(min(attempt + 1, 5))
    assert last_error is not None
    raise last_error


def wait_for_success(tx_hash: str) -> dict:
    client = get_gl_client()
    last_error: Exception | None = None
    for _attempt in range(FINALIZED_RETRIES):
        try:
            receipt = client.wait_for_transaction_receipt(
                transaction_hash=tx_hash,
                status=TransactionStatus.FINALIZED,
                interval=FINALIZED_WAIT_MS,
                retries=1,
            )
            assert receipt.get("status_name") == TransactionStatus.FINALIZED.value
            assert tx_execution_succeeded(receipt), json.dumps(receipt, default=str)
            return receipt
        except (GenLayerError, ValueError) as error:
            last_error = error
            sleep(FINALIZED_WAIT_MS / 1_000)
    raise AssertionError(f"{tx_hash} did not finalize successfully: {last_error}")


def ensure_transaction(
    state: dict,
    step: str,
    actor: str,
    contract,
    function_name: str,
    args: list,
) -> dict:
    existing = state["transactions"].get(step)
    if (
        existing
        and existing.get("status") == "FINALIZED"
        and existing.get("execution_result") == "SUCCESS"
    ):
        print(f"REUSED {step} {existing['transaction_hash']} FINALIZED SUCCESS", flush=True)
        return existing

    if existing and existing.get("transaction_hash"):
        tx_hash = existing["transaction_hash"]
        print(f"RESUMING {step} {tx_hash}", flush=True)
    else:
        tx_hash = str(
            get_gl_client().write_contract(
                address=contract.address,
                function_name=function_name,
                account=contract.account,
                value=0,
                leader_only=False,
                args=args,
            )
        )
        state["transactions"][step] = {
            "step": step,
            "actor": actor,
            "function": function_name,
            "transaction_hash": tx_hash,
            "status": "SUBMITTED",
            "execution_result": "PENDING",
        }
        save_json(STATE_PATH, state)
        print(f"SUBMITTED {step} {tx_hash}", flush=True)

    receipt = wait_for_success(tx_hash)
    leader = (receipt.get("consensus_data", {}).get("leader_receipt") or [{}])[0]
    evidence = state["transactions"][step]
    evidence["status"] = receipt.get("status_name")
    evidence["execution_result"] = leader.get("execution_result")
    save_json(STATE_PATH, state)
    print(f"FINALIZED {step} {tx_hash} SUCCESS", flush=True)
    return evidence


def read_game(contract) -> dict:
    return read_final(
        lambda variant: contract.get_game(args=[]).call(transaction_hash_variant=variant)
    )


def read_factions(contract) -> list[dict]:
    raw = read_final(
        lambda variant: contract.get_factions_json(args=[]).call(
            transaction_hash_variant=variant
        )
    )
    return json.loads(raw)


def faction_by_id(factions: list[dict], faction_id: str) -> dict:
    return next(faction for faction in factions if faction["faction_id"] == faction_id)


def public_evidence(state: dict, contract, game: dict, factions: list[dict]) -> dict:
    human_rounds = sorted(
        {
            int(action["round"])
            for action in state["actions"].values()
            if "round" in action and int(action["round"]) < int(game["round_number"])
        }
    )
    summaries = []
    for round_number in human_rounds:
        raw = read_final(
            lambda variant, value=round_number: contract.get_round_summary(args=[value]).call(
                transaction_hash_variant=variant
            )
        )
        summaries.append(json.loads(raw))
    return {
        "network": state["network"],
        "republic_address": state["republic_address"],
        "wallets": {
            actor: details["address"] for actor, details in state["wallets"].items()
        },
        "transactions": list(state["transactions"].values()),
        "actions": [
            {
                "actor": actor,
                "faction_id": action["faction_id"],
                "action_type": action["action_type"],
                "rationale": action["rationale"],
                "round": action["round"],
            }
            for actor, action in state["actions"].items()
        ],
        "readback": {
            "round_number": game["round_number"],
            "phase": game["phase"],
            "season_number": game["season_number"],
            "court_configured": game["court_configured"],
            "court_ruling_count": game["court_ruling_count"],
            "tested_factions": [
                {
                    "faction_id": details["faction_id"],
                    "controller": faction_by_id(factions, details["faction_id"])["controller"],
                    "last_action_round": faction_by_id(factions, details["faction_id"])["last_action_round"],
                    "last_action_type": faction_by_id(factions, details["faction_id"])["last_action_type"],
                }
                for details in ACTORS.values()
            ],
            "human_round_summaries": summaries,
        },
    }


def test_live_two_wallet_commit_reveal_flow() -> None:
    stage = os.getenv("LOOPHOLE_LIVE_STAGE", "state").strip().lower()
    if stage not in {"state", "claim", "advance", "commit", "reveal", "settle", "release"}:
        raise AssertionError(
            "LOOPHOLE_LIVE_STAGE must be state, claim, advance, commit, reveal, settle, or release"
        )

    state = load_or_create_state()
    factory = get_contract_factory(
        contract_file_path=PROJECT_ROOT / "contracts" / "AutonomousRepublic.py"
    )
    contracts = {}
    for actor in ACTORS:
        account = create_account(state["wallets"][actor]["private_key"])
        contracts[actor] = factory.build_contract(REPUBLIC_ADDRESS, account=account)
    reader = contracts["merchant"]

    game = read_game(reader)
    factions = read_factions(reader)

    if stage == "claim":
        for actor, details in ACTORS.items():
            faction = faction_by_id(factions, details["faction_id"])
            expected = state["wallets"][actor]["address"].lower()
            controller = faction["controller"].lower()
            if controller == "0x0000000000000000000000000000000000000000":
                ensure_transaction(
                    state,
                    f"claim.{details['faction_id'].lower()}",
                    actor,
                    contracts[actor],
                    "claim_faction",
                    [details["faction_id"]],
                )
            elif controller != expected:
                raise AssertionError(f"{details['faction_id']} is controlled by an unexpected wallet")
            factions = read_factions(reader)

    if stage in {"advance", "settle"}:
        if game["phase"] == "READY_TO_ADVANCE":
            step = f"round.{game['round_number']}.advance"
            ensure_transaction(
                state,
                step,
                "merchant",
                contracts["merchant"],
                "advance_round",
                [],
            )
            game = read_game(reader)
            factions = read_factions(reader)
        elif stage == "settle" and int(game["round_number"]) <= max(
            [int(action["round"]) for action in state["actions"].values()] or [0]
        ):
            raise AssertionError(f"round is not ready to settle; current phase is {game['phase']}")

    if stage == "commit":
        if game["phase"] != "COMMIT":
            raise AssertionError(f"commit phase is not open; current phase is {game['phase']}")
        seconds_left = int(game["commit_deadline"]) - int(time())
        if seconds_left < 90:
            raise AssertionError(f"only {seconds_left}s remain in commit phase")
        for actor, details in ACTORS.items():
            action = state["actions"].get(actor)
            if action is None or int(action.get("round", 0)) != int(game["round_number"]):
                nonce = secrets.token_hex(24)
                args = [
                    details["faction_id"],
                    details["action_type"],
                    "",
                    0,
                    "",
                    "",
                    details["rationale"],
                    nonce,
                ]
                commitment = read_final(
                    lambda variant, contract=contracts[actor], values=args: contract.preview_action_commitment(
                        args=values
                    ).call(transaction_hash_variant=variant)
                )
                action = {
                    **details,
                    "round": int(game["round_number"]),
                    "nonce": nonce,
                    "commitment": commitment,
                }
                state["actions"][actor] = action
                save_json(STATE_PATH, state)
            ensure_transaction(
                state,
                f"round.{game['round_number']}.{actor}.commit",
                actor,
                contracts[actor],
                "commit_action",
                [details["faction_id"], action["commitment"]],
            )

    if stage == "reveal":
        if game["phase"] != "REVEAL":
            raise AssertionError(f"reveal phase is not open; current phase is {game['phase']}")
        seconds_left = int(game["reveal_deadline"]) - int(time())
        if seconds_left < 90:
            raise AssertionError(f"only {seconds_left}s remain in reveal phase")
        for actor, details in ACTORS.items():
            action = state["actions"].get(actor)
            if action is None or int(action["round"]) != int(game["round_number"]):
                raise AssertionError(f"no saved action for {actor} in round {game['round_number']}")
            ensure_transaction(
                state,
                f"round.{game['round_number']}.{actor}.reveal",
                actor,
                contracts[actor],
                "reveal_action",
                [
                    action["faction_id"],
                    action["action_type"],
                    "",
                    0,
                    "",
                    "",
                    action["rationale"],
                    action["nonce"],
                ],
            )

    if stage == "release":
        factions = read_factions(reader)
        for actor, details in ACTORS.items():
            faction = faction_by_id(factions, details["faction_id"])
            expected = state["wallets"][actor]["address"].lower()
            controller = faction["controller"].lower()
            if controller == expected:
                ensure_transaction(
                    state,
                    f"release.{details['faction_id'].lower()}",
                    actor,
                    contracts[actor],
                    "release_faction",
                    [details["faction_id"]],
                )
            elif controller != "0x0000000000000000000000000000000000000000":
                raise AssertionError(f"{details['faction_id']} is controlled by an unexpected wallet")
            factions = read_factions(reader)

    game = read_game(reader)
    factions = read_factions(reader)
    public = public_evidence(state, reader, game, factions)
    save_json(PUBLIC_PATH, public)
    print("PUBLIC_EVIDENCE " + json.dumps(public, separators=(",", ":")), flush=True)
    print(
        "GAME_STATE "
        + json.dumps(
            {
                "round_number": game["round_number"],
                "phase": game["phase"],
                "commit_deadline": game["commit_deadline"],
                "reveal_deadline": game["reveal_deadline"],
                "seconds_until_commit_deadline": int(game["commit_deadline"]) - int(time()),
                "seconds_until_reveal_deadline": int(game["reveal_deadline"]) - int(time()),
            },
            separators=(",", ":"),
        ),
        flush=True,
    )
