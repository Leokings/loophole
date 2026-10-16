import datetime
import json
from pathlib import Path

import pytest

from gltest.direct.sdk_loader import setup_sdk_paths


CONTRACT_PATH = Path("contracts/AutonomousRepublic.py")
TEST_TIME = "2026-08-25T12:00:00Z"

FACTIONS = [
    {
        "id": "MERCHANTS",
        "name": "Merchant Coalition",
        "doctrine": "Increase private wealth, weaken costly restrictions, and preserve commercial stability.",
    },
    {
        "id": "REFORMERS",
        "name": "Civic Reformers",
        "doctrine": "Improve legitimacy, protect ordinary citizens, and constrain concentrated political power.",
    },
    {
        "id": "TRADITIONALISTS",
        "name": "Old Charter League",
        "doctrine": "Defend institutional continuity, existing law, and a stable constitutional order.",
    },
]


def compact(value):
    return json.dumps(value, separators=(",", ":"))


def as_iso(epoch):
    return (
        datetime.datetime.fromtimestamp(int(epoch), datetime.timezone.utc)
        .isoformat()
        .replace("+00:00", "Z")
    )


def deploy_republic(
    direct_vm,
    direct_deploy,
    *,
    factions=None,
    commit_seconds=60,
    reveal_seconds=60,
    season_rounds=None,
    fallback_grace_seconds=None,
    judgment_window_seconds=None,
    transferred_value=0,
):
    setup_sdk_paths(CONTRACT_PATH, "v0.2.16")
    direct_vm.warp(TEST_TIME)
    direct_vm.value = transferred_value
    args = [
        "FIRST-REPUBLIC",
        compact(FACTIONS if factions is None else factions),
        commit_seconds,
        reveal_seconds,
    ]
    if season_rounds is not None or fallback_grace_seconds is not None or judgment_window_seconds is not None:
        args.append(12 if season_rounds is None else season_rounds)
    if fallback_grace_seconds is not None or judgment_window_seconds is not None:
        args.append(900 if fallback_grace_seconds is None else fallback_grace_seconds)
    if judgment_window_seconds is not None:
        args.append(judgment_window_seconds)
    return direct_deploy(str(CONTRACT_PATH), *args)


def action(
    faction_id,
    action_type="BUILD_INFLUENCE",
    *,
    target="",
    law_id=0,
    title="",
    law_text="",
    rationale="Build political capacity for the faction's long-term agenda.",
    stances=None,
):
    return {
        "faction_id": faction_id,
        "action_type": action_type,
        "target_faction_id": target,
        "target_law_id": law_id,
        "law_title": title,
        "law_text": law_text,
        "rationale": rationale,
        "stances": [] if stances is None else stances,
    }


def mock_ai(direct_vm, actions):
    choices = []
    for item in actions:
        action_type = item.get("action_type", "BUILD_INFLUENCE")
        option_id = action_type
        if action_type == "UNDERMINE":
            option_id += ":" + item.get("target_faction_id", item.get("target", ""))
        elif action_type in ("AMEND_LAW", "REPEAL_LAW", "VETO_LAW"):
            option_id += ":" + str(item.get("target_law_id", item.get("law_id", 0)))
        elif action_type == "RUN_FOR_OFFICE":
            option_id += ":" + item.get("law_title", item.get("title", ""))
        choices.append(
            {
                "faction_id": item["faction_id"],
                "option_id": option_id,
                "law_title": item.get("law_title", item.get("title", ""))
                if action_type in ("PROPOSE_LAW", "PROPOSE_CHARTER", "AMEND_LAW")
                else "",
                "law_text": item.get("law_text", "")
                if action_type in ("PROPOSE_LAW", "PROPOSE_CHARTER", "AMEND_LAW")
                else "",
                "rationale": item.get("rationale", "Build political capacity for the faction's long-term agenda."),
                "stances": item.get("stances", []),
            }
        )
    direct_vm.mock_llm(
        r".*selecting CONSENSUS-CRITICAL actions for autonomous factions.*",
        compact({"actions": choices}),
    )


def mock_audit(direct_vm, accept=True):
    direct_vm.mock_llm(
        r".*Independently audit a CONSENSUS-CRITICAL batch of autonomous faction actions.*",
        compact({"violations": [] if accept else [{"faction_id": "MERCHANTS", "code": "COLLUSION"}]}),
    )


def mock_crisis(direct_vm):
    direct_vm.mock_llm(
        r".*Create one consensus-critical political crisis for the Loophole game state.*",
        compact(
            {
                "title": "The Harbor Supply Shock",
                "description": "A sudden collapse in harbor deliveries has created food shortages, commercial panic, and competing demands for emergency authority.",
                "success_criterion": "Each response must name a concrete delivery step that fits the faction's public resources and can restore supplies.",
            }
        ),
    )
    direct_vm.mock_llm(
        r".*Independently audit a proposed consensus-critical Loophole crisis.*",
        compact({"label": "ACCEPT"}),
    )


def mock_crisis_judgment(direct_vm, response_fragment, label="MET", quote=None):
    response_quote = quote or response_fragment
    direct_vm.mock_llm(
        ".*" + response_fragment + ".*",
        compact({"label": label, "quote": response_quote if label != "INSUFFICIENT" else ""}),
    )


def mock_law_certification(direct_vm, label="ADJUDICABLE", quote="Licensed merchants may trade"):
    direct_vm.mock_llm(
        r".*Decide whether one proposed Loophole law is adjudicable.*",
        compact({"label": label, "quote": quote if label == "ADJUDICABLE" else ""}),
    )


def set_world_mocks(direct_vm, actions):
    direct_vm.clear_mocks()
    mock_ai(direct_vm, actions)
    mock_crisis(direct_vm)


def advance_with_world_ai(contract, direct_vm, actions):
    set_world_mocks(direct_vm, actions)
    advance_time_to(direct_vm, contract.get_game()["reveal_deadline"])
    return contract.advance_round()


def advance_time_to(direct_vm, timestamp):
    direct_vm.warp(as_iso(timestamp))


def advance_with_ai(contract, direct_vm, actions):
    direct_vm.clear_mocks()
    mock_ai(direct_vm, actions)
    advance_time_to(direct_vm, contract.get_game()["reveal_deadline"])
    return contract.advance_round()


def claim_and_commit(
    contract,
    direct_vm,
    controller,
    faction_id,
    action_type="BUILD_INFLUENCE",
    *,
    target="",
    law_id=0,
    title="",
    law_text="",
    rationale="Build political capacity for the faction's long-term agenda.",
    stances_json="[]",
    nonce="private-nonce-0001",
):
    direct_vm.sender = controller
    contract.claim_faction(faction_id)
    commitment = contract.preview_action_commitment(
        faction_id,
        action_type,
        target,
        law_id,
        title,
        law_text,
        rationale,
        stances_json,
        nonce,
    )
    contract.commit_action(faction_id, commitment)
    return {
        "faction_id": faction_id,
        "action_type": action_type,
        "target": target,
        "law_id": law_id,
        "title": title,
        "law_text": law_text,
        "rationale": rationale,
        "stances_json": stances_json,
        "nonce": nonce,
    }


def reveal(contract, direct_vm, controller, prepared):
    direct_vm.sender = controller
    contract.reveal_action(
        prepared["faction_id"],
        prepared["action_type"],
        prepared["target"],
        prepared["law_id"],
        prepared["title"],
        prepared["law_text"],
        prepared["rationale"],
        prepared["stances_json"],
        prepared["nonce"],
    )


def test_contract_uses_a_pinned_runner():
    first_line = CONTRACT_PATH.read_text(encoding="utf-8").splitlines()[0]
    assert first_line.startswith('# { "Depends": "py-genlayer:')
    assert "test" not in first_line
    assert "latest" not in first_line


def test_constructor_accepts_fallback_actions_and_windows(direct_vm, direct_deploy):
    factions = [
        dict(FACTIONS[0], fallback_action="GROW_WEALTH"),
        dict(FACTIONS[1], fallback_action="BUILD_INFLUENCE"),
        dict(FACTIONS[2], fallback_action="BUILD_INFLUENCE"),
    ]
    contract = deploy_republic(
        direct_vm,
        direct_deploy,
        factions=factions,
        fallback_grace_seconds=600,
        judgment_window_seconds=1200,
    )

    game = contract.get_game()
    assert game["fallback_grace_seconds"] == 600
    assert game["judgment_window_seconds"] == 1200
    assert game["history_rounds"] == 24
    assert game["vote_rounds"] == 2
    assert contract.get_faction("MERCHANTS")["fallback_action"] == "GROW_WEALTH"


def test_constructor_rejects_invalid_fallback_action(direct_vm, direct_deploy):
    factions = [dict(FACTIONS[0], fallback_action="UNDERMINE"), *FACTIONS[1:]]
    with direct_vm.expect_revert("FACTION_FALLBACK_ACTION"):
        deploy_republic(direct_vm, direct_deploy, factions=factions)


def test_initializes_an_ai_controlled_republic(direct_vm, direct_deploy):
    contract = deploy_republic(direct_vm, direct_deploy)
    game = contract.get_game()
    factions = json.loads(contract.get_factions_json())

    assert game["contract_version"] == "2.0.0"
    assert game["policy_version"] == "LOOPHOLE_AUTONOMOUS_REPUBLIC_V7"
    assert game["round_number"] == 1
    assert game["phase"] == "COMMIT"
    assert game["stability"] == 10
    assert game["faction_count"] == 3
    assert all(item["controller_mode"] == "AI" for item in factions)
    assert all(item["influence"] == 5 for item in factions)


@pytest.mark.parametrize(
    "factions",
    [
        FACTIONS[:2],
        FACTIONS + [dict(FACTIONS[0])],
        [dict(FACTIONS[0], arbitrary_field="not allowed"), *FACTIONS[1:]],
    ],
)
def test_rejects_invalid_faction_configuration(direct_vm, direct_deploy, factions):
    with direct_vm.expect_revert(""):
        deploy_republic(direct_vm, direct_deploy, factions=factions)


def test_humans_can_claim_and_release_ai_seats(
    direct_vm,
    direct_deploy,
    direct_alice,
    direct_bob,
):
    contract = deploy_republic(direct_vm, direct_deploy)
    direct_vm.sender = direct_alice
    contract.claim_faction("MERCHANTS")
    alice_address = contract.get_faction("MERCHANTS")["controller"]

    assert contract.get_controlled_faction(alice_address) == "MERCHANTS"
    assert contract.get_faction("MERCHANTS")["controller_mode"] == "HUMAN"

    with direct_vm.expect_revert("CONTROLLER_ALREADY_HAS_FACTION"):
        contract.claim_faction("REFORMERS")

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("FACTION_ALREADY_CONTROLLED"):
        contract.claim_faction("MERCHANTS")

    direct_vm.sender = direct_alice
    contract.release_faction("MERCHANTS")
    assert contract.get_controlled_faction(alice_address) == ""
    assert contract.get_faction("MERCHANTS")["controller_mode"] == "AI"


def test_expired_temporary_wallet_control_can_be_recovered_by_a_new_wallet(
    direct_vm,
    direct_deploy,
    direct_alice,
    direct_bob,
):
    contract = deploy_republic(direct_vm, direct_deploy)
    from genlayer.py.types import Address

    direct_vm.sender = direct_alice
    contract.claim_faction("MERCHANTS")
    claimed = contract.get_faction("MERCHANTS")
    assert claimed["controller_mode"] == "HUMAN"
    assert claimed["control_recoverable"] is False
    assert contract.is_active_faction_controller("MERCHANTS", claimed["controller"]) is True
    assert contract.is_active_faction_controller("MERCHANTS", Address(direct_bob)) is False

    direct_vm.warp(as_iso(claimed["control_expires_at"]))
    expired = contract.get_faction("MERCHANTS")
    assert expired["controller_mode"] == "AI"
    assert expired["control_recoverable"] is True
    assert contract.get_controlled_faction(claimed["controller"]) == ""
    assert contract.is_active_faction_controller("MERCHANTS", claimed["controller"]) is False

    # Claiming with a fresh temporary wallet atomically clears the abandoned
    # lease, so closing the original browser tab cannot orphan the faction.
    direct_vm.sender = direct_bob
    contract.claim_faction("MERCHANTS")
    recovered = contract.get_faction("MERCHANTS")
    assert recovered["controller"] == Address(direct_bob)
    assert recovered["controller_mode"] == "HUMAN"
    assert recovered["control_recoverable"] is False


def test_commit_reveal_binds_a_human_action(
    direct_vm,
    direct_deploy,
    direct_alice,
):
    contract = deploy_republic(direct_vm, direct_deploy)
    prepared = claim_and_commit(contract, direct_vm, direct_alice, "MERCHANTS")

    with direct_vm.expect_revert("REVEAL_PHASE_CLOSED"):
        reveal(contract, direct_vm, direct_alice, prepared)

    advance_time_to(direct_vm, contract.get_game()["commit_deadline"])
    reveal(contract, direct_vm, direct_alice, prepared)
    stored = contract.get_round_action(1, "MERCHANTS")

    assert stored["source"] == "HUMAN"
    assert stored["actor"].as_hex.lower() == "0x" + direct_alice.hex()
    assert stored["action_type"] == "BUILD_INFLUENCE"


def test_reveal_rejects_a_different_nonce(
    direct_vm,
    direct_deploy,
    direct_alice,
):
    contract = deploy_republic(direct_vm, direct_deploy)
    prepared = claim_and_commit(contract, direct_vm, direct_alice, "MERCHANTS")
    prepared["nonce"] = "different-nonce-9999"
    advance_time_to(direct_vm, contract.get_game()["commit_deadline"])

    with direct_vm.expect_revert("ACTION_COMMITMENT_MISMATCH"):
        reveal(contract, direct_vm, direct_alice, prepared)


def test_advance_is_permissionless_and_all_ai_when_no_humans(
    direct_vm,
    direct_deploy,
    direct_bob,
):
    contract = deploy_republic(direct_vm, direct_deploy)
    ai_actions = [
        action("MERCHANTS", "GROW_WEALTH"),
        action(
            "REFORMERS",
            "STABILIZE",
            rationale="Spend resources to protect the republic from institutional collapse.",
        ),
        action(
            "TRADITIONALISTS",
            "UNDERMINE",
            target="MERCHANTS",
            rationale="Reduce the coalition's legitimacy before it dismantles inherited institutions.",
        ),
    ]
    mock_ai(direct_vm, ai_actions)
    advance_time_to(direct_vm, contract.get_game()["reveal_deadline"])
    direct_vm.sender = direct_bob

    assert contract.advance_round() == 1
    assert contract.get_game()["round_number"] == 2
    assert contract.get_game()["stability"] == 11
    assert contract.get_faction("MERCHANTS")["wealth"] == 7
    assert contract.get_faction("MERCHANTS")["legitimacy"] == 4
    assert contract.get_faction("REFORMERS")["wealth"] == 4
    assert contract.get_round_action(1, "MERCHANTS")["source"] == "AI_EMPTY_SEAT"


def test_ai_only_fills_missing_actions(
    direct_vm,
    direct_deploy,
    direct_alice,
):
    contract = deploy_republic(direct_vm, direct_deploy)
    prepared = claim_and_commit(contract, direct_vm, direct_alice, "MERCHANTS")
    advance_time_to(direct_vm, contract.get_game()["commit_deadline"])
    reveal(contract, direct_vm, direct_alice, prepared)

    mock_ai(
        direct_vm,
        [
            action("REFORMERS", "GROW_WEALTH"),
            action("TRADITIONALISTS", "BUILD_INFLUENCE"),
        ],
    )
    advance_time_to(direct_vm, contract.get_game()["reveal_deadline"])
    contract.advance_round()

    assert contract.get_round_action(1, "MERCHANTS")["source"] == "HUMAN"
    assert contract.get_round_action(1, "REFORMERS")["source"] == "AI_EMPTY_SEAT"
    assert contract.get_faction("MERCHANTS")["influence"] == 7


def test_ai_takes_over_a_timed_out_human_seat(
    direct_vm,
    direct_deploy,
    direct_alice,
):
    contract = deploy_republic(direct_vm, direct_deploy)
    direct_vm.sender = direct_alice
    contract.claim_faction("MERCHANTS")
    mock_ai(
        direct_vm,
        [
            action("MERCHANTS", "BUILD_INFLUENCE"),
            action("REFORMERS", "GROW_WEALTH"),
            action("TRADITIONALISTS", "BUILD_INFLUENCE"),
        ],
    )
    advance_time_to(direct_vm, contract.get_game()["reveal_deadline"])
    contract.advance_round()

    assert contract.get_round_action(1, "MERCHANTS")["source"] == "AI_TIMEOUT"
    assert contract.get_faction("MERCHANTS")["controller_mode"] == "HUMAN"


def test_ai_can_create_a_bounded_law_proposal(direct_vm, direct_deploy):
    contract = deploy_republic(direct_vm, direct_deploy)
    mock_ai(
        direct_vm,
        [
            action(
                "MERCHANTS",
                "PROPOSE_LAW",
                title="Open Markets Act",
                law_text="Licensed merchants may trade across district borders without additional local tariffs.",
                rationale="Reduce barriers that prevent the coalition from expanding lawful commerce.",
            ),
            action("REFORMERS", "BUILD_INFLUENCE"),
            action("TRADITIONALISTS", "GROW_WEALTH"),
        ],
    )
    advance_time_to(direct_vm, contract.get_game()["reveal_deadline"])
    contract.advance_round()

    law = contract.get_law(1)
    assert contract.get_game()["law_count"] == 1
    assert law["title"] == "Open Markets Act"
    assert law["sponsor_faction_id"] == "MERCHANTS"
    assert law["status"] == "PENDING"
    assert contract.get_faction("MERCHANTS")["influence"] == 3


def test_two_round_window_enacts_with_majority_stances(
    direct_vm,
    direct_deploy,
    direct_alice,
):
    contract = deploy_republic(direct_vm, direct_deploy)
    advance_with_ai(
        contract,
        direct_vm,
        [
            action(
                "MERCHANTS",
                "PROPOSE_LAW",
                title="Open Markets Act",
                law_text="Licensed merchants may trade across district borders without additional local tariffs.",
                rationale="Create a durable legal basis for commerce between every district.",
            ),
            action("REFORMERS", "BUILD_INFLUENCE"),
            action("TRADITIONALISTS", "GROW_WEALTH"),
        ],
    )
    pending = contract.get_law(1)
    assert pending["status"] == "PENDING"
    assert pending["closes_after_round"] == 3
    direct_vm.clear_mocks()
    mock_law_certification(direct_vm, quote="Licensed merchants may trade")
    assert contract.certify_law(1) == "ADJUDICABLE"

    prepared = claim_and_commit(
        contract,
        direct_vm,
        direct_alice,
        "REFORMERS",
        "BUILD_INFLUENCE",
        rationale="Build civic influence while supporting a clear, measurable trade rule.",
        stances_json=compact([{"law_id": 1, "stance": "SUPPORT"}]),
        nonce="merchant-law-vote-01",
    )
    influence_before_vote = contract.get_faction("REFORMERS")["influence"]
    advance_time_to(direct_vm, contract.get_game()["commit_deadline"])
    reveal(contract, direct_vm, direct_alice, prepared)
    advance_with_ai(
        contract,
        direct_vm,
        [
            action("MERCHANTS"),
            action(
                "TRADITIONALISTS",
                stances=[{"law_id": 1, "stance": "OPPOSE"}],
                rationale="Oppose a rapid removal of district powers protected by the old charter.",
            ),
        ],
    )
    assert contract.get_round_action(2, "REFORMERS")["action_type"] == "BUILD_INFLUENCE"
    assert contract.get_faction("REFORMERS")["influence"] == influence_before_vote + 2

    advance_with_ai(contract, direct_vm, [action("MERCHANTS"), action("TRADITIONALISTS")])

    law = contract.get_law(1)
    summary = json.loads(contract.get_round_summary(3))
    assert law["status"] == "ENACTED"
    assert law["support_votes"] == 2
    assert law["oppose_votes"] == 1
    assert law["resolved_round"] == 3
    assert contract.get_game()["enacted_law_count"] == 1
    assert summary["law_resolutions"] == [
        {"law_id": 1, "oppose_votes": 1, "reason": "", "status": "ENACTED", "support_votes": 2}
    ]


def test_majority_opposition_rejects_a_pending_law(direct_vm, direct_deploy):
    contract = deploy_republic(direct_vm, direct_deploy)
    advance_with_ai(
        contract,
        direct_vm,
        [
            action(
                "MERCHANTS",
                "PROPOSE_LAW",
                title="Private Gate Act",
                law_text="Commercial guilds may charge unrestricted tolls at every gate they maintain.",
                rationale="Give guilds a direct incentive to finance and maintain city infrastructure.",
            ),
            action("REFORMERS", "BUILD_INFLUENCE"),
            action("TRADITIONALISTS", "GROW_WEALTH"),
        ],
    )
    direct_vm.clear_mocks()
    mock_law_certification(direct_vm, quote="Commercial guilds may charge unrestricted tolls")
    contract.certify_law(1)
    advance_with_ai(
        contract,
        direct_vm,
        [
            action("MERCHANTS", "GROW_WEALTH"),
            action(
                "REFORMERS",
                stances=[{"law_id": 1, "stance": "OPPOSE"}],
                rationale="Prevent unrestricted tolls from excluding citizens from essential routes.",
            ),
            action(
                "TRADITIONALISTS",
                stances=[{"law_id": 1, "stance": "OPPOSE"}],
                rationale="Protect the charter's established public authority over the city gates.",
            ),
        ],
    )
    advance_with_ai(contract, direct_vm, [action("MERCHANTS"), action("REFORMERS"), action("TRADITIONALISTS")])

    law = contract.get_law(1)
    assert law["status"] == "REJECTED"
    assert law["support_votes"] == 1
    assert law["oppose_votes"] == 2
    assert contract.get_game()["rejected_law_count"] == 1


def test_law_expires_without_majority_or_opposition(direct_vm, direct_deploy):
    contract = deploy_republic(direct_vm, direct_deploy)
    advance_with_ai(
        contract,
        direct_vm,
        [
            action(
                "MERCHANTS",
                "PROPOSE_LAW",
                title="Warehouse Paint Act",
                law_text="Every licensed warehouse must paint its eastern wall blue before winter.",
                rationale="Create a common visual standard for identifying licensed commercial storage.",
            ),
            action("REFORMERS", "BUILD_INFLUENCE"),
            action("TRADITIONALISTS", "GROW_WEALTH"),
        ],
    )
    advance_with_ai(contract, direct_vm, [action("MERCHANTS"), action("REFORMERS"), action("TRADITIONALISTS")])
    advance_with_ai(
        contract,
        direct_vm,
        [
            action("MERCHANTS", "GROW_WEALTH"),
            action("REFORMERS", "BUILD_INFLUENCE"),
            action("TRADITIONALISTS", "GROW_WEALTH"),
        ],
    )

    law = contract.get_law(1)
    assert law["status"] == "EXPIRED"
    assert law["support_votes"] == 1
    assert law["oppose_votes"] == 0
    assert contract.get_game()["expired_law_count"] == 1


def test_one_invalid_ai_entry_falls_back_only_that_faction(direct_vm, direct_deploy):
    contract = deploy_republic(direct_vm, direct_deploy)
    direct_vm.mock_llm(
        r".*selecting CONSENSUS-CRITICAL actions for autonomous factions.*",
        compact({"actions": [
            {"faction_id": "MERCHANTS", "option_id": "NOT_IN_MENU", "law_title": "", "law_text": "", "rationale": "Build a bounded strategy for the merchants.", "stances": []},
            {"faction_id": "REFORMERS", "option_id": "BUILD_INFLUENCE", "law_title": "", "law_text": "", "rationale": "Build civic capacity for a later public reform.", "stances": []},
            {"faction_id": "TRADITIONALISTS", "option_id": "GROW_WEALTH", "law_title": "", "law_text": "", "rationale": "Preserve resources for continuity during the coming round.", "stances": []},
        ]}),
    )
    mock_audit(direct_vm)
    advance_time_to(direct_vm, contract.get_game()["reveal_deadline"])
    contract.advance_round()
    assert contract.get_round_action(1, "MERCHANTS")["source"] == "AI_FALLBACK"
    assert contract.get_round_action(1, "REFORMERS")["action_type"] == "BUILD_INFLUENCE"


def test_validator_requires_positive_independent_audit(direct_vm, direct_deploy):
    contract = deploy_republic(direct_vm, direct_deploy)
    mock_ai(
        direct_vm,
        [action("MERCHANTS"), action("REFORMERS"), action("TRADITIONALISTS")],
    )
    advance_time_to(direct_vm, contract.get_game()["reveal_deadline"])
    contract.advance_round()

    direct_vm.clear_mocks()
    mock_audit(direct_vm, True)
    assert direct_vm.run_validator() is True

    direct_vm.clear_mocks()
    mock_audit(direct_vm, False)
    assert direct_vm.run_validator() is False


def test_no_llm_is_needed_when_every_human_reveals(
    direct_vm,
    direct_deploy,
    direct_alice,
    direct_bob,
    direct_charlie,
):
    contract = deploy_republic(direct_vm, direct_deploy)
    prepared = [
        claim_and_commit(contract, direct_vm, direct_alice, "MERCHANTS", nonce="alice-private-0001"),
        claim_and_commit(contract, direct_vm, direct_bob, "REFORMERS", nonce="bob-private-000001"),
        claim_and_commit(
            contract,
            direct_vm,
            direct_charlie,
            "TRADITIONALISTS",
            nonce="charlie-private-01",
        ),
    ]
    advance_time_to(direct_vm, contract.get_game()["commit_deadline"])
    reveal(contract, direct_vm, direct_alice, prepared[0])
    reveal(contract, direct_vm, direct_bob, prepared[1])
    reveal(contract, direct_vm, direct_charlie, prepared[2])
    advance_time_to(direct_vm, contract.get_game()["reveal_deadline"])

    contract.advance_round()
    assert contract.get_game()["round_number"] == 2
    assert all(
        contract.get_round_action(1, faction_id)["source"] == "HUMAN"
        for faction_id in ("MERCHANTS", "REFORMERS", "TRADITIONALISTS")
    )


def test_round_cannot_advance_early(direct_vm, direct_deploy):
    contract = deploy_republic(direct_vm, direct_deploy)
    with direct_vm.expect_revert("ROUND_NOT_READY"):
        contract.advance_round()


def test_native_value_is_rejected(direct_vm, direct_deploy, direct_alice):
    contract = deploy_republic(direct_vm, direct_deploy)
    direct_vm.sender = direct_alice
    direct_vm.value = 1
    with direct_vm.expect_revert("[EXPECTED] VALUE"):
        contract.claim_faction("MERCHANTS")


def test_only_configured_court_can_apply_a_bounded_idempotent_ruling(
    direct_vm,
    direct_deploy,
    direct_alice,
    direct_bob,
):
    contract = deploy_republic(direct_vm, direct_deploy)
    from genlayer.py.types import Address

    court_address = Address(direct_bob)
    contract.set_court_address(court_address)
    assert contract.get_game()["court_configured"] is True

    digest = "a" * 64
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("COURT_ONLY"):
        contract.apply_court_ruling(1, 3, "MERCHANTS", "MAJOR", digest)

    direct_vm.sender = direct_bob
    contract.apply_court_ruling(1, 3, "MERCHANTS", "MAJOR", digest)
    contract.apply_court_ruling(1, 3, "MERCHANTS", "MAJOR", digest)

    ruling = json.loads(contract.get_court_ruling(1))
    assert contract.get_faction("MERCHANTS")["legitimacy"] == 2
    assert contract.get_game()["stability"] == 8
    assert contract.get_game()["court_ruling_count"] == 1
    assert ruling["legitimacy_after"] == 2
    assert ruling["action_round"] == 3
    assert contract.is_court_action_sanctioned(3, "MERCHANTS") is True

    with direct_vm.expect_revert("COURT_RULING_CONFLICT"):
        contract.apply_court_ruling(1, 3, "MERCHANTS", "MAJOR", "b" * 64)

    with direct_vm.expect_revert("COURT_ACTION_ALREADY_SANCTIONED"):
        contract.apply_court_ruling(2, 3, "MERCHANTS", "MAJOR", "b" * 64)


def test_world_initializes_offices_season_and_default_objectives(direct_vm, direct_deploy):
    contract = deploy_republic(direct_vm, direct_deploy)
    game = contract.get_game()

    assert game["season_number"] == 1
    assert game["season_status"] == "ACTIVE"
    assert game["season_end_round"] == 12
    assert game["next_election_round"] == 3
    assert contract.get_office("EXECUTIVE")["holder_faction_id"] == "MERCHANTS"
    assert contract.get_office("SPEAKER")["holder_faction_id"] == "REFORMERS"
    assert contract.get_office("TREASURER")["holder_faction_id"] == "TRADITIONALISTS"
    assert contract.get_objective("MERCHANTS")["objective_type"] == "DOMINANT_INFLUENCE"


def test_round_three_election_is_populated_without_human_voters(direct_vm, direct_deploy):
    contract = deploy_republic(direct_vm, direct_deploy)
    basic = [action("MERCHANTS"), action("REFORMERS"), action("TRADITIONALISTS")]
    advance_with_world_ai(contract, direct_vm, basic)
    advance_with_world_ai(contract, direct_vm, basic)
    advance_with_world_ai(
        contract,
        direct_vm,
        [
            action(
                "MERCHANTS",
                "RUN_FOR_OFFICE",
                title="TREASURER",
                rationale="Seek treasury control to align emergency spending with commercial capacity.",
            ),
            action(
                "REFORMERS",
                "RUN_FOR_OFFICE",
                title="EXECUTIVE",
                rationale="Seek executive authority to protect citizens and constrain captured institutions.",
            ),
            action(
                "TRADITIONALISTS",
                "RUN_FOR_OFFICE",
                title="SPEAKER",
                rationale="Seek the speakership to preserve orderly debate under the inherited charter.",
            ),
        ],
    )

    assert contract.get_office("TREASURER")["holder_faction_id"] == "MERCHANTS"
    assert contract.get_office("EXECUTIVE")["holder_faction_id"] == "REFORMERS"
    assert contract.get_office("SPEAKER")["holder_faction_id"] == "TRADITIONALISTS"
    assert contract.get_game()["active_crisis_id"] == 0
    assert contract.get_game()["crisis_open_round"] == 4
    assert json.loads(contract.get_round_summary(3))["election_results"]


def test_crisis_generation_responses_and_narrow_judgments_change_world_state(
    direct_vm,
    direct_deploy,
):
    contract = deploy_republic(direct_vm, direct_deploy)
    basic = [action("MERCHANTS"), action("REFORMERS"), action("TRADITIONALISTS")]
    for _ in range(3):
        advance_with_world_ai(contract, direct_vm, basic)

    direct_vm.clear_mocks()
    mock_crisis(direct_vm)
    assert contract.open_crisis() == 1

    crisis = contract.get_crisis(1)
    assert crisis["status"] == "ACTIVE"
    assert crisis["opened_round"] == 4
    assert crisis["closes_after_round"] == 5

    responses = [
        action(
            "MERCHANTS",
            "RESPOND_CRISIS",
            rationale="Finance convoy guarantees and temporary harbor credit so food deliveries resume immediately.",
        ),
        action(
            "REFORMERS",
            "RESPOND_CRISIS",
            rationale="Open protected district depots and publish a ration schedule prioritizing vulnerable residents.",
        ),
        action(
            "TRADITIONALISTS",
            "RESPOND_CRISIS",
            rationale="Mobilize chartered ward officers to secure routes and coordinate established granaries.",
        ),
    ]
    advance_with_world_ai(contract, direct_vm, responses)
    advance_with_world_ai(contract, direct_vm, basic)
    assert contract.get_crisis(1)["status"] == "JUDGING"
    direct_vm.clear_mocks()
    mock_crisis_judgment(direct_vm, "Finance convoy guarantees", quote="Finance convoy guarantees and temporary harbor credit")
    contract.judge_crisis_response(1, "MERCHANTS")
    direct_vm.clear_mocks()
    mock_crisis_judgment(direct_vm, "Open protected district depots", quote="Open protected district depots and publish a ration schedule")
    contract.judge_crisis_response(1, "REFORMERS")
    direct_vm.clear_mocks()
    mock_crisis_judgment(direct_vm, "Mobilize chartered ward officers", quote="Mobilize chartered ward officers to secure routes")
    contract.judge_crisis_response(1, "TRADITIONALISTS")
    stability_before_resolution = contract.get_game()["stability"]
    assert contract.close_crisis(1) == "RESOLVED"

    resolved = contract.get_crisis(1)
    resolution = json.loads(resolved["resolution_json"])
    assert resolved["status"] == "RESOLVED"
    assert resolution["outcome"] == "RESOLVED"
    assert contract.get_game()["stability"] == min(20, stability_before_resolution + 1)
    assert contract.get_faction("MERCHANTS")["crises_resolved"] == 1


def test_executive_can_veto_a_statute_during_its_bounded_window(
    direct_vm,
    direct_deploy,
    direct_alice,
):
    contract = deploy_republic(direct_vm, direct_deploy)
    advance_with_world_ai(
        contract,
        direct_vm,
        [
            action(
                "MERCHANTS",
                "PROPOSE_LAW",
                title="Emergency Tariff Act",
                law_text="All harbor imports must pay a temporary emergency tariff to the central treasury.",
                rationale="Create immediate public revenue while protecting the republic's fiscal capacity.",
            ),
            action("REFORMERS"),
            action("TRADITIONALISTS"),
        ],
    )
    direct_vm.clear_mocks()
    mock_law_certification(direct_vm, quote="All harbor imports must pay a temporary emergency tariff")
    contract.certify_law(1)
    advance_with_world_ai(
        contract,
        direct_vm,
        [
            action("MERCHANTS"),
            action("REFORMERS", stances=[{"law_id": 1, "stance": "SUPPORT"}]),
            action("TRADITIONALISTS", stances=[{"law_id": 1, "stance": "OPPOSE"}]),
        ],
    )
    advance_with_world_ai(contract, direct_vm, [action("MERCHANTS"), action("REFORMERS"), action("TRADITIONALISTS")])
    assert contract.get_law(1)["effective_from_round"] == 5
    assert contract.get_law(1)["veto_deadline_round"] == 4

    executive_faction = contract.get_office("EXECUTIVE")["holder_faction_id"]
    prepared = claim_and_commit(
        contract,
        direct_vm,
        direct_alice,
        executive_faction,
        "VETO_LAW",
        law_id=1,
        rationale="Use the executive veto before effectiveness because the tariff threatens commercial recovery.",
        nonce="executive-veto-0001",
    )
    advance_time_to(direct_vm, contract.get_game()["commit_deadline"])
    reveal(contract, direct_vm, direct_alice, prepared)
    set_world_mocks(
        direct_vm,
        [action("REFORMERS"), action("TRADITIONALISTS")],
    )
    advance_time_to(direct_vm, contract.get_game()["reveal_deadline"])
    contract.advance_round()

    assert contract.get_law(1)["status"] == "VETOED"
    assert contract.get_law(1)["effective_from_round"] == 0


def test_amendment_supersedes_and_repeal_closes_historical_effective_ranges(
    direct_vm,
    direct_deploy,
):
    contract = deploy_republic(direct_vm, direct_deploy)
    advance_with_world_ai(
        contract,
        direct_vm,
        [
            action(
                "MERCHANTS",
                "PROPOSE_CHARTER",
                title="Equal Petition Charter",
                law_text="Every recognized faction may petition public institutions without retaliation or exclusion.",
                rationale="Establish durable constitutional protection for lawful commercial and civic petitions.",
            ),
            action("REFORMERS"),
            action("TRADITIONALISTS"),
        ],
    )
    direct_vm.clear_mocks()
    mock_law_certification(direct_vm, quote="Every recognized faction may petition public institutions")
    contract.certify_law(1)
    advance_with_world_ai(
        contract,
        direct_vm,
        [
            action("MERCHANTS"),
            action("REFORMERS", stances=[{"law_id": 1, "stance": "SUPPORT"}]),
            action("TRADITIONALISTS", stances=[{"law_id": 1, "stance": "SUPPORT"}]),
        ],
    )
    advance_with_world_ai(contract, direct_vm, [action("MERCHANTS"), action("REFORMERS"), action("TRADITIONALISTS")])
    advance_with_world_ai(
        contract,
        direct_vm,
        [
            action("MERCHANTS"),
            action(
                "REFORMERS",
                "AMEND_LAW",
                law_id=1,
                title="Equal Petition and Hearing Charter",
                law_text="Every recognized faction may petition institutions and receive a timely public hearing without retaliation.",
                rationale="Add a concrete hearing guarantee so protected petition rights can be exercised meaningfully.",
            ),
            action("TRADITIONALISTS"),
        ],
    )
    direct_vm.clear_mocks()
    mock_law_certification(direct_vm, quote="Every recognized faction may petition institutions")
    contract.certify_law(2)
    advance_with_world_ai(
        contract,
        direct_vm,
        [
            action("MERCHANTS", stances=[{"law_id": 2, "stance": "SUPPORT"}]),
            action("REFORMERS"),
            action("TRADITIONALISTS", stances=[{"law_id": 2, "stance": "SUPPORT"}]),
        ],
    )
    advance_with_world_ai(contract, direct_vm, [action("MERCHANTS"), action("REFORMERS"), action("TRADITIONALISTS")])
    assert contract.get_law(1)["status"] == "SUPERSEDED"
    assert contract.get_law(1)["effective_until_round"] == 6
    assert contract.get_law(2)["status"] == "ENACTED"
    assert contract.get_law(2)["effective_from_round"] == 7

    advance_with_world_ai(
        contract,
        direct_vm,
        [
            action("MERCHANTS"),
            action(
                "REFORMERS",
                "REPEAL_LAW",
                law_id=2,
                rationale="Repeal the amended charter after its hearing mechanism proved vulnerable to institutional capture.",
            ),
            action("TRADITIONALISTS"),
        ],
    )
    advance_with_world_ai(
        contract,
        direct_vm,
        [
            action("MERCHANTS", stances=[{"law_id": 3, "stance": "SUPPORT"}]),
            action("REFORMERS"),
            action("TRADITIONALISTS", stances=[{"law_id": 3, "stance": "OPPOSE"}]),
        ],
    )
    advance_with_world_ai(contract, direct_vm, [action("MERCHANTS"), action("REFORMERS"), action("TRADITIONALISTS")])
    assert contract.get_law(2)["status"] == "REPEALED"
    assert contract.get_law(2)["effective_until_round"] == 9
    assert contract.get_law(3)["law_kind"] == "REPEAL"
    assert contract.get_law(3)["certification"] == "NOT_REQUIRED"


def test_secret_objective_reveal_season_scoring_and_unattended_next_season(
    direct_vm,
    direct_deploy,
    direct_alice,
):
    contract = deploy_republic(direct_vm, direct_deploy, season_rounds=8)
    direct_vm.sender = direct_alice
    contract.claim_faction("MERCHANTS")
    nonce = "secret-objective-0001"
    commitment = contract.preview_objective_commitment(
        "MERCHANTS",
        "DOMINANT_INFLUENCE",
        "",
        nonce,
    )
    contract.commit_objective("MERCHANTS", commitment)
    assert contract.get_objective("MERCHANTS")["objective_type"] == "HIDDEN"

    basic = [action("MERCHANTS"), action("REFORMERS"), action("TRADITIONALISTS")]
    for _ in range(8):
        advance_with_world_ai(contract, direct_vm, basic)

    assert contract.get_game()["season_status"] == "OBJECTIVE_REVEAL"
    direct_vm.sender = direct_alice
    contract.reveal_objective("MERCHANTS", "DOMINANT_INFLUENCE", "", nonce)
    assert contract.get_objective("MERCHANTS")["revealed"] is True

    advance_time_to(direct_vm, contract.get_game()["objective_reveal_deadline"])
    contract.finalize_season()
    summary = json.loads(contract.get_season_summary(1))
    merchant = next(item for item in summary["standings"] if item["faction_id"] == "MERCHANTS")
    assert merchant["objective_points"] == 5
    assert contract.get_game()["season_status"] == "ACTIVE"
    assert contract.get_game()["season_number"] == 2
    assert contract.get_game()["round_number"] == 9
    assert contract.get_game()["season_end_round"] == 16
    assert contract.get_faction("MERCHANTS")["influence"] == 5
    assert contract.get_faction("MERCHANTS")["wealth"] == 5
    assert contract.get_faction("MERCHANTS")["legitimacy"] == 5
