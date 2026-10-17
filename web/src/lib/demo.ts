import type { RepublicSnapshot } from "@/lib/types";

const now = Math.floor(Date.now() / 1000);
const demoHoldingRecordedAt = Math.floor(Date.UTC(2026, 8, 10) / 1000);
const law1 = "No faction may UNDERMINE a faction that holds public office.";
const law2 = "No faction may UNDERMINE any other faction.";

export const demoSnapshot: RepublicSnapshot = {
  game: {
    active_crisis_id: 1, active_law_count: 2, commit_deadline: now + 900, commit_seconds: 300,
    control_lease_seconds: 86400, court_configured: true, court_ruling_count: 3, crisis_count: 1,
    election_open: false, enacted_law_count: 2, faction_count: 4, law_count: 3, maximum_stability: 20,
    next_election_round: 7, objective_commit_end_round: 2, objective_reveal_deadline: 0,
    phase: "COMMIT", policy_version: "LOOPHOLE_AUTONOMOUS_REPUBLIC_V7", republic_id: "FIRST-REPUBLIC",
    reveal_deadline: now + 1500, reveal_seconds: 300, round_number: 6, season_end_round: 12,
    season_number: 1, season_start_round: 1, season_status: "ACTIVE", season_winners_json: "[]", stability: 13,
  },
  factions: [
    { controller: "0x0000000000000000000000000000000000000000", controller_mode: "AI", control_expires_at: 0, control_recoverable: false, crises_resolved: 1, doctrine: "Build prosperity through trade and public stability.", faction_id: "MERCHANTS", influence: 8, last_action_round: 5, last_action_type: "GROW_WEALTH", laws_enacted: 1, legitimacy: 5, lifetime_points: 0, name: "Merchant Coalition", season_points: 6, wealth: 11 },
    { controller: "0x4ce1f8e2de87c8df231e7c9f80000000000000a1", controller_mode: "HUMAN", control_expires_at: now + 72000, control_recoverable: false, crises_resolved: 1, doctrine: "Protect citizens and constrain concentrated power.", faction_id: "REFORMERS", influence: 7, last_action_round: 5, last_action_type: "STABILIZE", laws_enacted: 1, legitimacy: 8, lifetime_points: 0, name: "Civic Reformers", season_points: 8, wealth: 5 },
    { controller: "0x0000000000000000000000000000000000000000", controller_mode: "AI", control_expires_at: 0, control_recoverable: false, crises_resolved: 0, doctrine: "Defend the constitutional order and preserve precedent.", faction_id: "TRADITIONALISTS", influence: 9, last_action_round: 5, last_action_type: "BUILD_INFLUENCE", laws_enacted: 0, legitimacy: 6, lifetime_points: 0, name: "Old Charter League", season_points: 5, wealth: 7 },
    { controller: "0x0000000000000000000000000000000000000000", controller_mode: "AI", control_expires_at: 0, control_recoverable: false, crises_resolved: 0, doctrine: "Expose elite capture and force rapid change.", faction_id: "REVOLUTIONARIES", influence: 10, last_action_round: 5, last_action_type: "UNDERMINE", laws_enacted: 0, legitimacy: 3, lifetime_points: 0, name: "New Dawn Movement", season_points: 4, wealth: 4 },
  ],
  offices: [
    { election_count: 1, holder_faction_id: "REFORMERS", office_id: "EXECUTIVE", term_end_round: 7, term_start_round: 4 },
    { election_count: 1, holder_faction_id: "TRADITIONALISTS", office_id: "SPEAKER", term_end_round: 7, term_start_round: 4 },
    { election_count: 1, holder_faction_id: "MERCHANTS", office_id: "TREASURER", term_end_round: 7, term_start_round: 4 },
  ],
  laws: [
    { certification: "ADJUDICABLE", certification_quote: "UNDERMINE a faction that holds public office", closes_after_round: 0, effective_from_round: 5, effective_until_round: 0, law_id: 1, law_kind: "STATUTE", oppose_votes: 0, parent_law_id: 0, proposed_round: 1, resolved_round: 3, sponsor_faction_id: "REFORMERS", status: "ENACTED", support_votes: 4, text: law1, title: "Officeholder Protection", veto_deadline_round: 4 },
    { certification: "ADJUDICABLE", certification_quote: "No faction may UNDERMINE any other faction", closes_after_round: 0, effective_from_round: 9, effective_until_round: 0, law_id: 2, law_kind: "AMENDMENT", oppose_votes: 1, parent_law_id: 1, proposed_round: 5, resolved_round: 7, sponsor_faction_id: "MERCHANTS", status: "ENACTED", support_votes: 3, text: law2, title: "Universal Conduct Rule", veto_deadline_round: 0 },
    { certification: "UNCERTIFIED", certification_quote: "", closes_after_round: 7, effective_from_round: 0, effective_until_round: 0, law_id: 3, law_kind: "STATUTE", oppose_votes: 1, parent_law_id: 0, proposed_round: 5, resolved_round: 0, sponsor_faction_id: "MERCHANTS", status: "PENDING", support_votes: 1, text: "Guild lenders will publish emergency-credit offers before the next vote.", title: "Harbor Liquidity Compact", veto_deadline_round: 0 },
  ],
  crisis: { closes_after_round: 7, crisis_id: 1, description: "A chain of harbor closures has stranded grain shipments while lenders threaten to freeze emergency credit.", judging_deadline: now + 1800, opened_round: 6, resolution_json: "", outcome: "", success_criterion: "Reopen two public grain routes without reducing the emergency reserve below three units.", response_count: 1, responses: [{ faction_id: "REFORMERS", response: "Open protected district depots and publish ration ledgers.", judgment: "MET", quote: "Open protected district depots" }], severity: 3, severity_source: "CODE_DERIVED", stability_after: 13, stability_before: 13, status: "JUDGING", title: "The Empty Quays" },
  court: { case_count: 5, open_case_count: 2, contract_version: "5.0.0", policy_version: "LOOPHOLE_REPUBLIC_COURT_V5", republic_address: "0x1111111111111111111111111111111111111111", caselaw_address: "0x3333333333333333333333333333333333333333", brief_seconds: 600, resolution_seconds: 1800 },
  cases: [
    { action_round: 5, case_id: 5, case_reference: "REFORMERS-v-MERCHANTS-05", source: "HUMAN", filed_by: "0x4ce1f8e2de87c8df231e7c9f80000000000000a1", plaintiff_faction_id: "REFORMERS", defendant_faction_id: "MERCHANTS", law_id: 2, law_title: "Universal Conduct Rule", law_text: law2, claim_text: "The recorded action appears to violate the amended conduct rule.", evidence_json: "{}", evidence_digest: "0x1234", target_class: "NON_OFFICEHOLDER", key: "2|UNDERMINE|NON_OFFICEHOLDER", plaintiff_brief: "The recorded action falls within the amended rule.", defense_brief: "The target was not a protected officeholder at the time.", status: "STAYED", filed_at: now - 800, brief_deadline: now + 100, label: "", quote: "", verdict: "", sanction: "", rule_text: "", holding_case_id: 0, ruling_digest: "", decided_at: 0 },
    { action_round: 5, case_id: 4, case_reference: "AI-R6-MERCHANTS-2", source: "REPUBLIC", filed_by: "0x0000000000000000000000000000000000000001", plaintiff_faction_id: "MERCHANTS", defendant_faction_id: "REVOLUTIONARIES", law_id: 2, law_title: "Universal Conduct Rule", law_text: law2, claim_text: "The seat filed against the recorded action.", evidence_json: "{}", evidence_digest: "0x5678", target_class: "NON_OFFICEHOLDER", key: "2|UNDERMINE|NON_OFFICEHOLDER", plaintiff_brief: "", defense_brief: "", status: "SUMMARY", filed_at: now - 950, brief_deadline: now - 700, label: "COVERED_BREACH", quote: "No faction may UNDERMINE any other faction.", verdict: "VIOLATION", sanction: "REPRIMAND", rule_text: "Rule #2 covers UNDERMINE against NON_OFFICEHOLDER.", holding_case_id: 3, ruling_digest: "0xabcd", decided_at: now - 700 },
    { action_round: 4, case_id: 3, case_reference: "TRADITIONALISTS-v-REVOLUTIONARIES-03", source: "HUMAN", filed_by: "0x1111", plaintiff_faction_id: "TRADITIONALISTS", defendant_faction_id: "REVOLUTIONARIES", law_id: 1, law_title: "Officeholder Protection", law_text: law1, claim_text: "The earlier action targeted a faction outside the protected officeholder class.", evidence_json: "{}", evidence_digest: "0x9abc", target_class: "NON_OFFICEHOLDER", key: "1|UNDERMINE|NON_OFFICEHOLDER", plaintiff_brief: "", defense_brief: "", status: "DECIDED", filed_at: now - 2100, brief_deadline: now - 1900, label: "NOT_COVERED", quote: "holds public office", verdict: "NO_VIOLATION", sanction: "NONE", rule_text: "This action class is outside the cited rule.", holding_case_id: 3, ruling_digest: "0xef01", decided_at: now - 1900 },
  ],
  holdings: [
    { action_type: "UNDERMINE", case_id: 3, key: "1|UNDERMINE|NON_OFFICEHOLDER", label: "NOT_COVERED", law_id: 1, quote: "holds public office", recorded_at: demoHoldingRecordedAt - 1900, ruling_digest: "0xef01", target_class: "NON_OFFICEHOLDER" },
    { action_type: "UNDERMINE", case_id: 4, key: "2|UNDERMINE|NON_OFFICEHOLDER", label: "COVERED_BREACH", law_id: 2, quote: "No faction may UNDERMINE any other faction.", recorded_at: demoHoldingRecordedAt - 700, ruling_digest: "0xabcd", target_class: "NON_OFFICEHOLDER" },
  ],
  registry: { holding_count: 2, safe_harbor_count: 1, breach_count: 1, compliant_count: 0, court_address: "0x2222222222222222222222222222222222222222", contract_version: "1.0.0", policy_version: "LOOPHOLE_CASE_LAW_V1" },
  keeperStatus: { republic: { now, phase: "COMMIT", ops: [] }, court: { now, ops: [] } },
  storageStats: { republic: {}, court: {} },
  suitTargets: [{ actionRound: 5, actionType: "UNDERMINE", defendantFactionId: "REVOLUTIONARIES", lawId: 2, lawTitle: "Universal Conduct Rule", targetClass: "NON_OFFICEHOLDER" }],
  historicalActions: [
    { action_round: 5, round_number: 5, action_type: "UNDERMINE", faction_id: "REVOLUTIONARIES", target_faction_id: "MERCHANTS", target_law_id: 0, target_was_officeholder: false, law_title: "", law_text: "", rationale: "Expose the leverage behind the harbor closures.", source: "AI_EMPTY_SEAT", stances: "[]", fallback: false, actor: "0x0000000000000000000000000000000000000000" },
  ],
  lawHistory: [
    { certification: "ADJUDICABLE", certification_quote: "UNDERMINE a faction that holds public office", closes_after_round: 0, effective_from_round: 5, effective_until_round: 0, law_id: 1, law_kind: "STATUTE", oppose_votes: 0, parent_law_id: 0, proposed_round: 1, resolved_round: 3, sponsor_faction_id: "REFORMERS", status: "ENACTED", support_votes: 4, text: law1, title: "Officeholder Protection", veto_deadline_round: 4 },
    { certification: "ADJUDICABLE", certification_quote: "No faction may UNDERMINE any other faction", closes_after_round: 0, effective_from_round: 9, effective_until_round: 0, law_id: 2, law_kind: "AMENDMENT", oppose_votes: 1, parent_law_id: 1, proposed_round: 5, resolved_round: 7, sponsor_faction_id: "MERCHANTS", status: "ENACTED", support_votes: 3, text: law2, title: "Universal Conduct Rule", veto_deadline_round: 0 },
    { certification: "UNCERTIFIED", certification_quote: "", closes_after_round: 7, effective_from_round: 0, effective_until_round: 0, law_id: 3, law_kind: "STATUTE", oppose_votes: 1, parent_law_id: 0, proposed_round: 5, resolved_round: 0, sponsor_faction_id: "MERCHANTS", status: "PENDING", support_votes: 1, text: "Guild lenders will publish emergency-credit offers before the next vote.", title: "Harbor Liquidity Compact", veto_deadline_round: 0 },
  ],
  objectives: [
    { awarded_points: 0, commitment: "", committed_by: "", faction_id: "MERCHANTS", objective_type: "PROSPEROUS", revealed: true, source: "PUBLIC", target_faction_id: "" },
    { awarded_points: 0, commitment: "", committed_by: "", faction_id: "REFORMERS", objective_type: "LEGITIMATE", revealed: true, source: "PUBLIC", target_faction_id: "" },
    { awarded_points: 0, commitment: "", committed_by: "", faction_id: "TRADITIONALISTS", objective_type: "HOLD_OFFICE", revealed: true, source: "PUBLIC", target_faction_id: "" },
    { awarded_points: 0, commitment: "", committed_by: "", faction_id: "REVOLUTIONARIES", objective_type: "RIVAL_FALL", revealed: true, source: "PUBLIC", target_faction_id: "MERCHANTS" },
  ],
  current_actions: [],
  summary: {
    actions: [
      { action_type: "UNDERMINE", faction_id: "REVOLUTIONARIES", law_title: "", law_text: "", rationale: "Expose the leverage behind the harbor closures.", source: "AI_EMPTY_SEAT", target_faction_id: "MERCHANTS", target_law_id: 0, stances: "[]", fallback: false },
      { action_type: "BUILD_INFLUENCE", faction_id: "MERCHANTS", law_title: "", law_text: "", rationale: "Prepare public support before the next vote.", source: "HUMAN", target_faction_id: "", target_law_id: 0, stances: "[{\"law_id\":3,\"stance\":\"SUPPORT\"}]", fallback: false },
    ],
    crisis_skipped: false, crisis_status_after: { crisis_id: 1, status: "JUDGING" }, election_results: [], law_resolutions: [], fallback_round: false, prompt_shortened: false, prompt_overflow: false, round_number: 5,
  },
};
