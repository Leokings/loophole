import pytest

from test_autonomous_republic import (
    FACTIONS,
    action,
    advance_time_to,
    advance_with_ai,
    deploy_republic,
    mock_crisis,
)


def _stored_string_proxy(contract):
    total = 0
    for key in contract.round_summaries_json:
        total += len(contract.round_summaries_json[key])
    for key in contract.round_actions:
        action_record = contract.round_actions[key]
        for field in ("source", "action_type", "target_faction_id", "law_title", "law_text", "rationale"):
            value = getattr(action_record, field, "")
            if isinstance(value, str):
                total += len(value)
        stances = getattr(action_record, "stances_json", "")
        if isinstance(stances, str):
            total += len(stances)
    for key in contract.laws:
        law = contract.laws[key]
        for field in ("title", "text", "status", "law_kind", "certification", "certification_quote"):
            value = getattr(law, field, "")
            if isinstance(value, str):
                total += len(value)
    for key in contract.crises:
        crisis = contract.crises[key]
        for field in ("title", "description", "success_criterion", "status", "outcome", "resolution_json"):
            value = getattr(crisis, field, "")
            if isinstance(value, str):
                total += len(value)
    for key in contract.crisis_responses:
        total += len(contract.crisis_responses[key])
    judgments = getattr(contract, "crisis_judgments", None)
    if judgments is not None:
        for key in judgments:
            total += len(judgments[key])
    for key in contract.season_summaries_json:
        total += len(contract.season_summaries_json[key])
    return total


def _advance_fallback(contract, direct_vm):
    game = contract.get_game()
    if game["season_status"] != "ACTIVE":
        advance_time_to(direct_vm, game["objective_reveal_deadline"])
        return contract.finalize_season()
    advance_time_to(direct_vm, game["reveal_deadline"] + game["fallback_grace_seconds"])
    return contract.advance_round_fallback()


def _advance_to_round(contract, direct_vm, next_round):
    while contract.get_game()["round_number"] < next_round:
        _advance_fallback(contract, direct_vm)


def test_round_records_older_than_history_window_are_pruned(direct_vm, direct_deploy):
    contract = deploy_republic(direct_vm, direct_deploy)
    _advance_to_round(contract, direct_vm, 31)

    with direct_vm.expect_revert("ROUND_PRUNED"):
        contract.get_round_action(6, "MERCHANTS")
    assert contract.get_round_summary(6) == ""
    assert contract.get_round_action(7, "MERCHANTS")["round_number"] == 7
    assert contract.get_round_summary(7)
    assert contract.get_storage_stats()["retained_rounds"] == 24


def test_terminal_laws_are_pruned_after_history_window(direct_vm, direct_deploy):
    contract = deploy_republic(direct_vm, direct_deploy)
    advance_with_ai(contract, direct_vm, [
        action(
            "MERCHANTS",
            "PROPOSE_LAW",
            title="Observable Rule",
            law_text="A faction may use one action to build two influence in a round.",
            rationale="Create a concrete rule that can be checked against the public action record.",
        ),
        action("REFORMERS"),
        action("TRADITIONALISTS"),
    ])
    _advance_to_round(contract, direct_vm, 28)
    with direct_vm.expect_revert("LAW_PRUNED"):
        contract.get_law(1)
    assert contract.get_storage_stats()["retained_laws"] == 0


def test_resolved_crises_are_pruned_after_history_window(direct_vm, direct_deploy):
    contract = deploy_republic(direct_vm, direct_deploy)
    _advance_to_round(contract, direct_vm, 4)
    direct_vm.clear_mocks()
    mock_crisis(direct_vm)
    assert contract.open_crisis() == 1
    _advance_to_round(contract, direct_vm, 6)
    assert contract.get_crisis(1)["status"] == "JUDGING"
    assert contract.close_crisis(1) == "FAILED"
    _advance_to_round(contract, direct_vm, 31)
    with direct_vm.expect_revert("CRISIS_PRUNED"):
        contract.get_crisis(1)
    assert contract.get_storage_stats()["retained_crises"] == 0


def test_enacted_law_cap_rejects_with_code_full(direct_vm, direct_deploy):
    contract = deploy_republic(direct_vm, direct_deploy)
    contract.active_law_count = 16
    advance_with_ai(contract, direct_vm, [
        action(
            "MERCHANTS",
            "PROPOSE_LAW",
            title="Observable Rule",
            law_text="A faction may use one action to build two influence in a round.",
            rationale="Create a concrete rule that can be checked against the public action record.",
        ),
        action("REFORMERS"),
        action("TRADITIONALISTS"),
    ])
    direct_vm.clear_mocks()
    from test_autonomous_republic import mock_law_certification

    mock_law_certification(direct_vm, quote="build two influence in a round")
    contract.certify_law(1)
    advance_with_ai(contract, direct_vm, [
        action("MERCHANTS"),
        action("REFORMERS", stances=[{"law_id": 1, "stance": "SUPPORT"}]),
        action("TRADITIONALISTS"),
    ])
    advance_with_ai(contract, direct_vm, [action("MERCHANTS"), action("REFORMERS"), action("TRADITIONALISTS")])
    law = contract.get_law(1)
    assert law["status"] == "REJECTED"
    summary = contract.get_round_summary(3)
    assert '"reason":"CODE_FULL"' in summary


@pytest.mark.slow
def test_storage_stats_stay_bounded_over_200_rounds(direct_vm, direct_deploy):
    contract = deploy_republic(direct_vm, direct_deploy)
    _advance_to_round(contract, direct_vm, 201)
    stats = contract.get_storage_stats()
    assert stats["retained_rounds"] <= 24
    assert stats["retained_laws"] <= stats["active_law_count"] + 3 * 3
    assert stats["retirement_queue"] <= 24 * (len(FACTIONS) + 1)
    print(f"V7_STORED_STRING_PROXY_200={_stored_string_proxy(contract)}")
