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
    if season_rounds is not None:
        args.append(season_rounds)
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
):
    return {
        "faction_id": faction_id,
        "action_type": action_type,
        "target_faction_id": target,
        "target_law_id": law_id,
        "law_title": title,
        "law_text": law_text,
        "rationale": rationale,
    }


def mock_ai(direct_vm, actions):
    direct_vm.mock_llm(
        r".*selecting CONSENSUS-CRITICAL actions for autonomous factions.*",
        compact({"actions": actions}),
    )


def mock_audit(direct_vm, accept=True):
    direct_vm.mock_llm(
        r".*Independently audit a CONSENSUS-CRITICAL batch of autonomous faction actions.*",
        compact({"accept": accept}),
    )


def mock_crisis(direct_vm, severity=2):
    direct_vm.mock_llm(
        r".*Create one consensus-critical political crisis for the Loophole game state.*",
        compact(
            {
                "title": "The Harbor Supply Shock",
                "description": "A sudden collapse in harbor deliveries has created food shortages, commercial panic, and competing demands for emergency authority.",
                "resolution_standard": "Plans score well when they credibly restore supplies, protect vulnerable districts, and fit the faction's public resources and doctrine.",
                "severity": severity,
            }
        ),
    )


def mock_crisis_scores(direct_vm, scores=(0, 0, 0)):
    direct_vm.mock_llm(
        r".*Score the consensus-critical faction responses to this Loophole crisis.*",
        compact(
            {
                "scores": [
                    {
                        "faction_id": faction_id,
                        "score": scores[index],
                        "reasoning": "The recorded response has the corresponding level of relevance and feasibility under the public standard.",
                    }
                    for index, faction_id in enumerate(
                        ("MERCHANTS", "REFORMERS", "TRADITIONALISTS")
                    )
                ],
                "summary": "The republic's combined plans were assessed consistently against supply restoration, public protection, and feasible faction capacity.",
            }
        ),
    )


def set_world_mocks(direct_vm, actions, *, crisis_severity=2, crisis_scores=(0, 0, 0)):
    direct_vm.clear_mocks()
    mock_ai(direct_vm, actions)
    mock_crisis(direct_vm, crisis_severity)
    mock_crisis_scores(direct_vm, crisis_scores)


def advance_with_world_ai(
    contract,
    direct_vm,
    actions,
    *,
    crisis_severity=2,
    crisis_scores=(0, 0, 0),
):
    set_world_mocks(
        direct_vm,
        actions,
        crisis_severity=crisis_severity,
        crisis_scores=crisis_scores,
    )
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
        prepared["nonce"],
    )


def test_contract_uses_a_pinned_runner():
    first_line = CONTRACT_PATH.read_text(encoding="utf-8").splitlines()[0]
    assert first_line.startswith('# { "Depends": "py-genlayer:')
    assert "test" not in first_line
    assert "latest" not in first_line


def test_initializes_an_ai_controlled_republic(direct_vm, direct_deploy):
    contract = deploy_republic(direct_vm, direct_deploy)
    game = contract.get_game()
    factions = json.loads(contract.get_factions_json())

    assert game["contract_version"] == "1.0.0"
    assert game["policy_version"] == "LOOPHOLE_AUTONOMOUS_REPUBLIC_V4"
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


def test_human_and_ai_votes_can_enact_a_pending_law(
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
    assert pending["closes_after_round"] == 2

    prepared = claim_and_commit(
        contract,
        direct_vm,
        direct_alice,
        "MERCHANTS",
        "SUPPORT_LAW",
        law_id=1,
        rationale="Support the coalition's trade reform and secure predictable market access.",
        nonce="merchant-law-vote-01",
    )
    advance_time_to(direct_vm, contract.get_game()["commit_deadline"])
    reveal(contract, direct_vm, direct_alice, prepared)
    advance_with_ai(
        contract,
        direct_vm,
        [
            action(
                "REFORMERS",
                "SUPPORT_LAW",
                law_id=1,
                rationale="Support uniform rules that remove arbitrary local barriers for citizens.",
            ),
            action(
                "TRADITIONALISTS",
                "OPPOSE_LAW",
                law_id=1,
                rationale="Oppose a rapid removal of district powers protected by the old charter.",
            ),
        ],
    )

    law = contract.get_law(1)
    summary = json.loads(contract.get_round_summary(2))
    assert law["status"] == "ENACTED"
    assert law["support_votes"] == 2
    assert law["oppose_votes"] == 1
    assert law["resolved_round"] == 2
    assert contract.get_game()["enacted_law_count"] == 1
    assert summary["law_resolutions"] == [
        {"law_id": 1, "oppose_votes": 1, "status": "ENACTED", "support_votes": 2}
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
    advance_with_ai(
        contract,
        direct_vm,
        [
            action(
                "MERCHANTS",
                "SUPPORT_LAW",
                law_id=1,
                rationale="Defend the coalition's plan to finance gates through commercial tolls.",
            ),
            action(
                "REFORMERS",
                "OPPOSE_LAW",
                law_id=1,
                rationale="Prevent unrestricted tolls from excluding citizens from essential routes.",
            ),
            action(
                "TRADITIONALISTS",
                "OPPOSE_LAW",
                law_id=1,
                rationale="Protect the charter's established public authority over the city gates.",
            ),
        ],
    )

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
    assert law["support_votes"] == 0
    assert law["oppose_votes"] == 0
    assert contract.get_game()["expired_law_count"] == 1


def test_closed_ai_schema_rejects_invented_effects(direct_vm, direct_deploy):
    contract = deploy_republic(direct_vm, direct_deploy)
    invalid = action("MERCHANTS")
    invalid["minted_wealth"] = 999999
    mock_ai(
        direct_vm,
        [invalid, action("REFORMERS"), action("TRADITIONALISTS")],
    )
    advance_time_to(direct_vm, contract.get_game()["reveal_deadline"])

    with direct_vm.expect_revert("[LLM_ERROR] AI_ACTION_FIELDS"):
        contract.advance_round()
    assert contract.get_game()["round_number"] == 1


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
        contract.apply_court_ruling(1, "MERCHANTS", "MAJOR", digest)

    direct_vm.sender = direct_bob
    contract.apply_court_ruling(1, "MERCHANTS", "MAJOR", digest)
    contract.apply_court_ruling(1, "MERCHANTS", "MAJOR", digest)

    ruling = json.loads(contract.get_court_ruling(1))
    assert contract.get_faction("MERCHANTS")["legitimacy"] == 2
    assert contract.get_game()["stability"] == 8
    assert contract.get_game()["court_ruling_count"] == 1
    assert ruling["legitimacy_after"] == 2

    with direct_vm.expect_revert("COURT_RULING_CONFLICT"):
        contract.apply_court_ruling(1, "MERCHANTS", "MAJOR", "b" * 64)


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
    assert contract.get_game()["active_crisis_id"] == 1
    assert json.loads(contract.get_round_summary(3))["election_results"]


def test_crisis_generation_responses_and_consensus_scoring_change_world_state(
    direct_vm,
    direct_deploy,
):
    contract = deploy_republic(direct_vm, direct_deploy)
    basic = [action("MERCHANTS"), action("REFORMERS"), action("TRADITIONALISTS")]
    for _ in range(3):
        advance_with_world_ai(contract, direct_vm, basic, crisis_severity=2)

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
    advance_with_world_ai(contract, direct_vm, responses, crisis_scores=(3, 3, 3))
    stability_before_resolution = contract.get_game()["stability"]
    advance_with_world_ai(contract, direct_vm, basic, crisis_scores=(3, 3, 3))

    resolved = contract.get_crisis(1)
    resolution = json.loads(resolved["resolution_json"])
    assert resolved["status"] == "RESOLVED"
    assert resolved["total_response_score"] == 9
    assert resolution["outcome"] == "RESOLVED"
    assert contract.get_game()["stability"] == min(20, stability_before_resolution + 2)
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
    advance_with_world_ai(
        contract,
        direct_vm,
        [
            action("MERCHANTS", "SUPPORT_LAW", law_id=1, rationale="Support the tariff as a predictable emergency funding source."),
            action("REFORMERS", "SUPPORT_LAW", law_id=1, rationale="Support temporary funding when its use remains publicly accountable."),
            action("TRADITIONALISTS", "OPPOSE_LAW", law_id=1, rationale="Oppose bypassing the charter's established district revenue powers."),
        ],
    )
    assert contract.get_law(1)["effective_from_round"] == 4
    assert contract.get_law(1)["veto_deadline_round"] == 3

    prepared = claim_and_commit(
        contract,
        direct_vm,
        direct_alice,
        "MERCHANTS",
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
    advance_with_world_ai(
        contract,
        direct_vm,
        [
            action("MERCHANTS", "SUPPORT_LAW", law_id=1, rationale="Support equal access to institutional petition channels."),
            action("REFORMERS", "SUPPORT_LAW", law_id=1, rationale="Support constitutional protection for political participation."),
            action("TRADITIONALISTS", "SUPPORT_LAW", law_id=1, rationale="Support a clear charter rule administered through existing institutions."),
        ],
    )
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
    advance_with_world_ai(
        contract,
        direct_vm,
        [
            action("MERCHANTS", "SUPPORT_LAW", law_id=2, rationale="Support a predictable hearing process for institutional petitions."),
            action("REFORMERS", "SUPPORT_LAW", law_id=2, rationale="Support an enforceable hearing right alongside the petition guarantee."),
            action("TRADITIONALISTS", "SUPPORT_LAW", law_id=2, rationale="Support a hearing process delivered through established public offices."),
        ],
    )
    assert contract.get_law(1)["status"] == "SUPERSEDED"
    assert contract.get_law(1)["effective_until_round"] == 4
    assert contract.get_law(2)["status"] == "ENACTED"
    assert contract.get_law(2)["effective_from_round"] == 5

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
        crisis_scores=(0, 0, 0),
    )
    advance_with_world_ai(
        contract,
        direct_vm,
        [
            action("MERCHANTS", "SUPPORT_LAW", law_id=3, rationale="Support repeal to remove the captured hearing process."),
            action("REFORMERS", "SUPPORT_LAW", law_id=3, rationale="Support replacement of a process that no longer protects civic participation."),
            action("TRADITIONALISTS", "OPPOSE_LAW", law_id=3, rationale="Oppose repeal without a replacement grounded in the inherited charter."),
        ],
    )
    assert contract.get_law(2)["status"] == "REPEALED"
    assert contract.get_law(2)["effective_until_round"] == 6
    assert contract.get_law(3)["law_kind"] == "REPEAL"


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
    assert contract.get_game()["season_status"] == "FINAL"

    assert contract.start_next_season() == 2
    assert contract.get_game()["season_status"] == "ACTIVE"
    assert contract.get_game()["round_number"] == 9
    assert contract.get_game()["season_end_round"] == 16
