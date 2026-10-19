import type { CourtCase, Law, RepublicSnapshot } from "@/lib/types";

const now = Math.floor(Date.now() / 1000);
const officeRule = "No faction may UNDERMINE a faction that holds public office.";
const universalRule = "No faction may UNDERMINE any other faction.";

const law = (values: Partial<Law> & Pick<Law, "law_id" | "title" | "text" | "status">): Law => ({
  certification: "ADJUDICABLE", certification_quote: "", closes_after_round: 0, effective_from_round: 0,
  effective_until_round: 0, law_kind: "STATUTE", oppose_votes: 0, parent_law_id: 0, proposed_round: 1,
  resolved_round: 0, sponsor_faction_id: "REFORMERS", support_votes: 4, veto_deadline_round: 0, ...values,
});

const laws: Law[] = [
  law({ law_id: 1, title: "Good Faith Principle", text: "Factions must always act in good faith toward the republic.",
    certification: "UNADJUDICABLE", certification_quote: "", status: "UNADJUDICABLE", resolved_round: 2 }),
  law({ law_id: 2, title: "Officeholder Protection", text: officeRule, effective_from_round: 5,
    effective_until_round: 7, status: "SUPERSEDED", proposed_round: 3, resolved_round: 5 }),
  law({ law_id: 3, title: "Universal Conduct Rule", text: universalRule, law_kind: "AMENDMENT",
    parent_law_id: 2, effective_from_round: 8, status: "ENACTED", proposed_round: 6, resolved_round: 7,
    sponsor_faction_id: "MERCHANTS", support_votes: 3, oppose_votes: 1,
    certification_quote: "UNDERMINE any other faction" }),
];

const rule = (lawId: number, action: string, targetClass: string, label: string, originCaseId: number) =>
  `Under law #${lawId}, ${action} against ${targetClass} is ${label} (case ${originCaseId}).`;

function makeCase(input: {
  id: number; round: number; lawId: number; action: string; targetClass: string; status: string;
  label?: string; quote?: string; verdict?: string; sanction?: string; origin?: number;
}): CourtCase {
  const cited = laws.find((item) => item.law_id === input.lawId)!;
  const key = `${input.lawId}|${input.action}|${input.targetClass}`;
  return {
    action_round: input.round,
    case_id: input.id,
    case_reference: `DEMO-${String(input.id).padStart(2, "0")}`,
    source: "HUMAN",
    filed_by: "0x1111111111111111111111111111111111111111",
    plaintiff_faction_id: "REFORMERS",
    defendant_faction_id: "REVOLUTIONARIES",
    law_id: input.lawId,
    law_title: cited.title,
    law_text: cited.text,
    claim_text: "Compare the recorded action with the cited rule.",
    evidence_json: JSON.stringify({ law: { law_id: input.lawId, title: cited.title, text: cited.text },
      action: { action_round: input.round, action_type: input.action, target_class: input.targetClass } }),
    evidence_digest: `0x${String(input.id).padStart(64, "0")}`,
    target_class: input.targetClass,
    key,
    plaintiff_brief: "The recorded facts fit the quoted rule.",
    defense_brief: "The rule and the recorded action should be compared directly.",
    status: input.status,
    filed_at: now - 7200 + input.id * 30,
    brief_deadline: now - 600,
    label: input.label ?? "",
    quote: input.quote ?? "",
    verdict: input.verdict ?? "",
    sanction: input.sanction ?? "",
    rule_text: input.label && input.origin
      ? rule(input.lawId, input.action, input.targetClass, input.label, input.origin) : "",
    holding_case_id: input.origin ?? 0,
    ruling_digest: input.origin ? `0x${String(input.origin).padStart(64, "f")}` : "",
    decided_at: input.origin ? now - 3600 + input.id * 30 : 0,
    holding_present: Boolean(input.origin && ["DECIDED", "SUMMARY"].includes(input.status)),
    outcome_present: Boolean(input.origin && ["DECIDED", "SUMMARY"].includes(input.status)),
  };
}

const cases: CourtCase[] = [
  makeCase({ id: 1, round: 5, lawId: 2, action: "UNDERMINE", targetClass: "OTHER_FACTION",
    status: "DECIDED", label: "NOT_COVERED", quote: "holds public office", verdict: "NO_VIOLATION", sanction: "NONE", origin: 1 }),
  makeCase({ id: 2, round: 5, lawId: 2, action: "UNDERMINE", targetClass: "OTHER_FACTION",
    status: "SUMMARY", label: "NOT_COVERED", quote: "holds public office", verdict: "NO_VIOLATION", sanction: "NONE", origin: 1 }),
  makeCase({ id: 3, round: 6, lawId: 2, action: "UNDERMINE", targetClass: "OFFICEHOLDER",
    status: "DECIDED", label: "COVERED_BREACH", quote: officeRule, verdict: "VIOLATION", sanction: "REPRIMAND", origin: 3 }),
  makeCase({ id: 4, round: 8, lawId: 3, action: "UNDERMINE", targetClass: "OTHER_FACTION",
    status: "DECIDED", label: "COVERED_BREACH", quote: universalRule, verdict: "VIOLATION", sanction: "REPRIMAND", origin: 4 }),
  makeCase({ id: 5, round: 8, lawId: 3, action: "GROW_WEALTH", targetClass: "NONE",
    status: "BRIEFING" }),
  makeCase({ id: 6, round: 8, lawId: 3, action: "GROW_WEALTH", targetClass: "NONE",
    status: "STAYED" }),
  makeCase({ id: 7, round: 9, lawId: 3, action: "STABILIZE", targetClass: "NONE",
    status: "EXPIRED" }),
];

export const demoSnapshot: RepublicSnapshot = {
  game: {
    active_crisis_id: 1, active_law_count: 1, commit_deadline: now + 900, commit_seconds: 300,
    control_lease_seconds: 86400, court_configured: true, court_ruling_count: 4, crisis_count: 1,
    election_open: false, enacted_law_count: 1, faction_count: 4, law_count: 3, maximum_stability: 20,
    next_election_round: 14, objective_commit_end_round: 2, objective_reveal_deadline: 0,
    phase: "COMMIT", policy_version: "LOOPHOLE_AUTONOMOUS_REPUBLIC_V7", republic_id: "FIRST-REPUBLIC",
    reveal_deadline: now + 1500, reveal_seconds: 300, round_number: 9, season_end_round: 12,
    season_number: 1, season_start_round: 1, season_status: "ACTIVE", season_winners_json: "[]", stability: 13,
  },
  factions: [
    { faction_id: "MERCHANTS", name: "Merchant Coalition", doctrine: "Build prosperity through trade.", controller: "0x0000000000000000000000000000000000000000", controller_mode: "AI", control_expires_at: 0, control_recoverable: false, crises_resolved: 1, influence: 8, last_action_round: 8, last_action_type: "GROW_WEALTH", laws_enacted: 1, legitimacy: 5, lifetime_points: 0, season_points: 6, wealth: 11 },
    { faction_id: "REFORMERS", name: "Civic Reformers", doctrine: "Protect citizens and constrain power.", controller: "0x1111111111111111111111111111111111111111", controller_mode: "HUMAN", control_expires_at: now + 72000, control_recoverable: false, crises_resolved: 1, influence: 7, last_action_round: 8, last_action_type: "STABILIZE", laws_enacted: 1, legitimacy: 8, lifetime_points: 0, season_points: 8, wealth: 5 },
    { faction_id: "TRADITIONALISTS", name: "Old Charter League", doctrine: "Preserve the constitutional order.", controller: "0x0000000000000000000000000000000000000000", controller_mode: "AI", control_expires_at: 0, control_recoverable: false, crises_resolved: 0, influence: 9, last_action_round: 8, last_action_type: "BUILD_INFLUENCE", laws_enacted: 0, legitimacy: 6, lifetime_points: 0, season_points: 5, wealth: 7 },
    { faction_id: "REVOLUTIONARIES", name: "New Dawn Movement", doctrine: "Challenge elite capture and demand change.", controller: "0x0000000000000000000000000000000000000000", controller_mode: "AI", control_expires_at: 0, control_recoverable: false, crises_resolved: 0, influence: 10, last_action_round: 8, last_action_type: "UNDERMINE", laws_enacted: 0, legitimacy: 3, lifetime_points: 0, season_points: 4, wealth: 4 },
  ],
  offices: [
    { office_id: "EXECUTIVE", holder_faction_id: "REFORMERS", election_count: 1, term_start_round: 4, term_end_round: 10 },
    { office_id: "SPEAKER", holder_faction_id: "TRADITIONALISTS", election_count: 1, term_start_round: 4, term_end_round: 10 },
    { office_id: "TREASURER", holder_faction_id: "MERCHANTS", election_count: 1, term_start_round: 4, term_end_round: 10 },
  ],
  laws,
  crisis: { closes_after_round: 10, crisis_id: 1, description: "A harbor closure has stranded grain shipments.",
    judging_deadline: now + 1800, opened_round: 8, resolution_json: "", outcome: "",
    success_criterion: "Reopen two grain routes while preserving the emergency reserve.", response_count: 1,
    responses: [{ faction_id: "REFORMERS", response: "Open protected depots and publish ration ledgers.", judgment: "MET", quote: "Open protected depots" }],
    severity: 3, severity_source: "CODE_DERIVED", stability_after: 13, stability_before: 13, status: "JUDGING", title: "The Empty Quays" },
  court: { case_count: 7, open_case_count: 2, contract_version: "5.0.0", policy_version: "LOOPHOLE_REPUBLIC_COURT_V5", republic_address: "0x1111111111111111111111111111111111111111", caselaw_address: "0x3333333333333333333333333333333333333333", brief_seconds: 600, resolution_seconds: 10800 },
  cases,
  holdings: [
    { action_type: "UNDERMINE", case_id: 1, key: cases[0].key, label: "NOT_COVERED", law_id: 2, quote: "holds public office", recorded_at: now - 3600, ruling_digest: cases[0].ruling_digest, target_class: "OTHER_FACTION" },
    { action_type: "UNDERMINE", case_id: 3, key: cases[2].key, label: "COVERED_BREACH", law_id: 2, quote: officeRule, recorded_at: now - 3300, ruling_digest: cases[2].ruling_digest, target_class: "OFFICEHOLDER" },
    { action_type: "UNDERMINE", case_id: 4, key: cases[3].key, label: "COVERED_BREACH", law_id: 3, quote: universalRule, recorded_at: now - 3000, ruling_digest: cases[3].ruling_digest, target_class: "OTHER_FACTION" },
  ],
  registry: { holding_count: 3, safe_harbor_count: 1, breach_count: 2, compliant_count: 0, court_address: "0x2222222222222222222222222222222222222222", contract_version: "1.0.0", policy_version: "LOOPHOLE_CASE_LAW_V1" },
  keeperStatus: { republic: { now, phase: "COMMIT", ops: [] }, court: { now, ops: [] } },
  storageStats: { republic: {}, court: {} },
  suitTargets: [{ actionRound: 9, actionType: "GROW_WEALTH", defendantFactionId: "MERCHANTS", key: "3|GROW_WEALTH|NONE", lawId: 3, lawTitle: "Universal Conduct Rule", targetClass: "NONE" }],
  historicalActions: [
    { action_round: 8, round_number: 8, action_type: "UNDERMINE", faction_id: "REVOLUTIONARIES", target_faction_id: "MERCHANTS", target_law_id: 0, target_was_officeholder: false, law_title: "", law_text: "", rationale: "Challenge the old rules.", source: "AI_EMPTY_SEAT", stances: "[]", fallback: false, actor: "0x0000000000000000000000000000000000000000" },
  ],
  lawHistory: laws,
  objectives: ["MERCHANTS", "REFORMERS", "TRADITIONALISTS", "REVOLUTIONARIES"].map((faction_id) => ({ awarded_points: 0, commitment: "", committed_by: "", faction_id, objective_type: "PROSPEROUS", revealed: true, source: "PUBLIC", target_faction_id: "" })),
  current_actions: [],
  summary: { actions: [], crisis_skipped: false, crisis_status_after: { crisis_id: 1, status: "JUDGING" }, election_results: [], law_resolutions: [], fallback_round: false, prompt_shortened: false, prompt_overflow: false, round_number: 8 },
};
