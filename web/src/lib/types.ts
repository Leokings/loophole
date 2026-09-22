export type Phase =
  | "COMMIT"
  | "REVEAL"
  | "READY_TO_ADVANCE"
  | "OBJECTIVE_REVEAL"
  | "READY_TO_FINALIZE_SEASON"
  | "SEASON_FINAL";

export type Faction = {
  controller: string;
  controller_mode: "AI" | "HUMAN";
  crises_resolved: number;
  doctrine: string;
  faction_id: string;
  influence: number;
  last_action_round: number;
  last_action_type: string;
  laws_enacted: number;
  legitimacy: number;
  lifetime_points: number;
  name: string;
  season_points: number;
  wealth: number;
};

export type Office = {
  election_count: number;
  holder_faction_id: string;
  office_id: string;
  term_end_round: number;
  term_start_round: number;
};

export type Law = {
  closes_after_round: number;
  effective_from_round: number;
  effective_until_round: number;
  law_id: number;
  law_kind: string;
  oppose_votes: number;
  parent_law_id: number;
  proposed_round: number;
  resolved_round: number;
  sponsor_faction_id: string;
  status: string;
  support_votes: number;
  text: string;
  title: string;
  veto_deadline_round: number;
};

export type CrisisResponse = {
  faction_id: string;
  response: string;
  score: number;
};

export type Crisis = {
  closes_after_round: number;
  crisis_id: number;
  description: string;
  opened_round: number;
  resolution_json: string;
  resolution_standard: string;
  response_count: number;
  responses: CrisisResponse[];
  severity: number;
  stability_after: number;
  stability_before: number;
  status: string;
  title: string;
  total_response_score: number;
};

export type GameState = {
  active_crisis_id: number;
  commit_deadline: number;
  court_configured: boolean;
  court_ruling_count: number;
  crisis_count: number;
  election_open: boolean;
  enacted_law_count: number;
  faction_count: number;
  law_count: number;
  maximum_stability: number;
  next_election_round: number;
  objective_commit_end_round: number;
  objective_reveal_deadline: number;
  phase: Phase;
  policy_version: string;
  republic_id: string;
  reveal_deadline: number;
  round_number: number;
  season_end_round: number;
  season_number: number;
  season_start_round: number;
  season_status: string;
  season_winners_json: string;
  stability: number;
};

export type RoundSummary = {
  actions: Array<{
    action_type: string;
    faction_id: string;
    law_title: string;
    rationale: string;
    source: string;
    target_faction_id: string;
    target_law_id: number;
  }>;
  crisis_resolution: Record<string, unknown>;
  election_results: Array<Record<string, unknown>>;
  law_resolutions: Array<Record<string, unknown>>;
  opened_crisis: Record<string, unknown>;
  round_number: number;
};

export type RoundAction = RoundSummary["actions"][number] & {
  actor: string;
  law_text: string;
  round_number: number;
};

export type CourtCase = {
  appeal_deadline: number;
  appeal_response_deadline: number;
  brief_deadline: number;
  case_id: number;
  case_reference: string;
  claim_text: string;
  defendant_faction_id: string;
  plaintiff_faction_id: string;
  precedent_rule: string;
  reasoning: string;
  sanction: string;
  status: string;
  verdict: string;
};

export type Objective = {
  awarded_points: number;
  commitment: string;
  committed_by: string;
  faction_id: string;
  objective_type: string;
  revealed: boolean;
  source: string;
  target_faction_id: string;
};

export type CourtState = {
  case_count: number;
  finalized_case_count: number;
  open_case_count: number;
  precedent_count: number;
};

export type RepublicSnapshot = {
  cases: CourtCase[];
  court: CourtState | null;
  crisis: Crisis | null;
  current_actions: RoundAction[];
  factions: Faction[];
  game: GameState;
  laws: Law[];
  offices: Office[];
  objectives: Objective[];
  summary: RoundSummary | null;
};

export type ActionDraft = {
  action_type: string;
  faction_id: string;
  law_text: string;
  law_title: string;
  rationale: string;
  target_faction_id: string;
  target_law_id: number;
};

export type PendingReveal = ActionDraft & {
  finalized?: boolean;
  nonce: string;
  round: number;
  transactionHash: string;
};
