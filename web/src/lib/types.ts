export type Phase = "COMMIT" | "REVEAL" | "READY_TO_ADVANCE" | "OBJECTIVE_REVEAL" | "READY_TO_FINALIZE_SEASON";

export type Faction = {
  control_expires_at: number; control_recoverable: boolean; controller: string;
  controller_mode: "AI" | "HUMAN"; crises_resolved: number; doctrine: string; faction_id: string;
  influence: number; last_action_round: number; last_action_type: string; laws_enacted: number;
  legitimacy: number; lifetime_points: number; name: string; season_points: number; wealth: number;
};
export type Office = { election_count: number; holder_faction_id: string; office_id: string; term_end_round: number; term_start_round: number };
export type Law = {
  certification: string; certification_quote: string; closes_after_round: number; effective_from_round: number;
  effective_until_round: number; law_id: number; law_kind: string; oppose_votes: number; parent_law_id: number;
  proposed_round: number; resolved_round: number; sponsor_faction_id: string; status: string; support_votes: number;
  text: string; title: string; veto_deadline_round: number;
};
export type CrisisResponse = { faction_id: string; response: string; judgment?: string; quote?: string };
export type Crisis = {
  closes_after_round: number; crisis_id: number; description: string; opened_round: number; resolution_json: string;
  judging_deadline?: number; outcome?: string; success_criterion: string; response_count: number; responses: CrisisResponse[];
  severity: number; severity_source?: string; stability_after: number; stability_before: number; status: string;
  title: string;
};
export type GameState = {
  active_crisis_id: number; commit_deadline: number; commit_seconds: number; control_lease_seconds: number;
  court_configured: boolean; court_ruling_count: number; crisis_count: number; election_open: boolean;
  enacted_law_count: number; faction_count: number; law_count: number; maximum_stability: number;
  next_election_round: number; objective_commit_end_round: number; objective_reveal_deadline: number;
  phase: Phase; policy_version: string; republic_id: string; reveal_deadline: number; reveal_seconds: number;
  round_number: number; season_end_round: number; season_number: number; season_start_round: number;
  season_status: string; season_winners_json: string; stability: number; active_law_count: number;
};
export type RoundSummary = {
  actions: Array<{ action_type: string; faction_id: string; law_title: string; rationale: string; source: string;
    target_faction_id: string; target_law_id: number; law_text: string; stances: string; fallback: boolean }>;
  crisis_skipped: boolean; crisis_status_after: { crisis_id: number; status: string };
  election_results: Array<Record<string, unknown>>; law_resolutions: Array<Record<string, unknown>>;
  fallback_round: boolean; prompt_shortened: boolean; prompt_overflow: boolean; round_number: number;
};
export type RoundAction = RoundSummary["actions"][number] & { actor: string; round_number: number; target_was_officeholder: boolean };
export type Holding = { action_type: string; case_id: number; key: string; label: string; law_id: number; quote: string; recorded_at: number; ruling_digest: string; target_class: string };
export type CourtCase = {
  action_round: number; case_id: number; case_reference: string; source: "HUMAN" | "REPUBLIC"; filed_by: string;
  plaintiff_faction_id: string; defendant_faction_id: string; law_id: number; law_title: string; law_text: string;
  claim_text: string; evidence_json: string; evidence_digest: string; target_class: string; key: string;
  plaintiff_brief: string; defense_brief: string; status: string; filed_at: number; brief_deadline: number;
  label: string; quote: string; verdict: string; sanction: string; rule_text: string; holding_case_id: number;
  ruling_digest: string; decided_at: number; effectsPending?: "holding" | "outcome" | "holding and outcome" | "finality window";
};
export type HistoricalAction = RoundAction & { action_round: number };
export type Objective = { awarded_points: number; commitment: string; committed_by: string; faction_id: string; objective_type: string; revealed: boolean; source: string; target_faction_id: string };
export type CourtState = { case_count: number; open_case_count: number; contract_version?: string; policy_version?: string; republic_address?: string; caselaw_address?: string; brief_seconds?: number; resolution_seconds?: number };
export type KeeperOp = { method: string; args: Array<string | number> };
export type KeeperStatus = { now: number; phase?: string; ops: KeeperOp[] };
export type StorageStats = Record<string, number>;
export type CaseLawRegistry = { holding_count: number; safe_harbor_count: number; breach_count: number; compliant_count: number; court_address: string; contract_version: string; policy_version: string };
export type SuitTarget = { actionRound: number; actionType: string; defendantFactionId: string; lawId: number; lawTitle: string; targetClass: string };
export type RepublicSnapshot = {
  cases: CourtCase[]; court: CourtState | null; crisis: Crisis | null; current_actions: RoundAction[]; factions: Faction[];
  game: GameState; laws: Law[]; offices: Office[]; objectives: Objective[]; summary: RoundSummary | null;
  keeperStatus: { republic: KeeperStatus; court: KeeperStatus | null }; storageStats: { republic: StorageStats; court: StorageStats | null };
  holdings: Holding[]; registry: CaseLawRegistry | null; suitTargets: SuitTarget[];
  historicalActions: HistoricalAction[];
  lawHistory: Law[];
};
export type ActionDraft = { action_type: string; faction_id: string; law_text: string; law_title: string; rationale: string; target_faction_id: string; target_law_id: number; stances?: Array<{ law_id: number; stance: "SUPPORT" | "OPPOSE" | "ABSTAIN" }> };
export type PendingReveal = ActionDraft & { finalized?: boolean; nonce: string; round: number; transactionHash: string };
