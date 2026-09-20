"use client";

import { useMemo, useState, useTransition } from "react";

import {
  createNonce,
  previewActionCommitment,
  previewObjectiveCommitment,
  writeRepublic,
} from "@/lib/genlayer";
import type { ActionDraft, PendingReveal, RepublicSnapshot } from "@/lib/types";

const actionLabels: Record<string, string> = {
  AMEND_LAW: "Amend a law",
  BUILD_INFLUENCE: "Build influence",
  GROW_WEALTH: "Grow wealth",
  OPPOSE_LAW: "Oppose a bill",
  PROPOSE_CHARTER: "Propose a charter",
  PROPOSE_LAW: "Propose a statute",
  REPEAL_LAW: "Repeal a law",
  RESPOND_CRISIS: "Answer the crisis",
  RUN_FOR_OFFICE: "Run for office",
  STABILIZE: "Stabilize the republic",
  SUPPORT_LAW: "Support a bill",
  UNDERMINE: "Undermine a rival",
  VETO_LAW: "Executive veto",
};

const baseActions = [
  "BUILD_INFLUENCE",
  "GROW_WEALTH",
  "STABILIZE",
  "UNDERMINE",
  "PROPOSE_LAW",
  "PROPOSE_CHARTER",
  "SUPPORT_LAW",
  "OPPOSE_LAW",
  "AMEND_LAW",
  "REPEAL_LAW",
];

const objectiveTypes = [
  "DOMINANT_INFLUENCE",
  "PROSPEROUS",
  "LEGITIMATE",
  "HOLD_OFFICE",
  "RIVAL_FALL",
];

function emptyDraft(factionId: string): ActionDraft {
  return {
    action_type: "BUILD_INFLUENCE",
    faction_id: factionId,
    law_text: "",
    law_title: "",
    rationale: "Build durable political capacity for the faction's long-term agenda.",
    target_faction_id: "",
    target_law_id: 0,
  };
}

function actionStorageKey(address: string, round: number, factionId: string) {
  return `loophole:v1:action:${address}:${round}:${factionId}`;
}

function objectiveStorageKey(address: string, season: number, factionId: string) {
  return `loophole:v1:objective:${address}:${season}:${factionId}`;
}

function ownedByWallet(controller: string, wallet: string) {
  return Boolean(wallet) && controller.toLowerCase() === wallet.toLowerCase();
}

function readPendingReveal(round: number, factionId: string): PendingReveal | null {
  if (typeof window === "undefined") return null;
  const key = actionStorageKey("republic", round, factionId);
  const stored = window.localStorage.getItem(key);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as PendingReveal;
  } catch {
    window.localStorage.removeItem(key);
    return null;
  }
}

export function ActionPanel({
  isDemo,
  onConnect,
  onRefresh,
  onToast,
  selectedFactionId,
  snapshot,
  wallet,
}: {
  isDemo: boolean;
  onConnect: () => Promise<string>;
  onRefresh: () => Promise<void>;
  onToast: (message: string, tone?: "good" | "bad") => void;
  selectedFactionId: string;
  snapshot: RepublicSnapshot;
  wallet: string;
}) {
  const [draft, setDraft] = useState<ActionDraft>(() => emptyDraft(selectedFactionId));
  const [pendingReveal, setPendingReveal] = useState<PendingReveal | null>(() =>
    readPendingReveal(snapshot.game.round_number, selectedFactionId),
  );
  const [objectiveType, setObjectiveType] = useState("DOMINANT_INFLUENCE");
  const [objectiveTarget, setObjectiveTarget] = useState("");
  const [isPending, startTransition] = useTransition();
  const faction = snapshot.factions.find((item) => item.faction_id === selectedFactionId);
  const objective = snapshot.objectives.find((item) => item.faction_id === selectedFactionId);
  const isAiSeat = faction?.controller_mode === "AI";

  const availableActions = useMemo(() => {
    const result = [...baseActions];
    if (snapshot.game.election_open) result.push("RUN_FOR_OFFICE");
    if (snapshot.crisis?.status === "ACTIVE") result.push("RESPOND_CRISIS");
    const executive = snapshot.offices.find((office) => office.office_id === "EXECUTIVE");
    if (executive?.holder_faction_id === selectedFactionId) result.push("VETO_LAW");
    return result;
  }, [selectedFactionId, snapshot.crisis?.status, snapshot.game.election_open, snapshot.offices]);

  function chooseAction(actionType: string) {
    setDraft({ ...emptyDraft(selectedFactionId), action_type: actionType });
  }

  function run(task: () => Promise<unknown>) {
    startTransition(async () => {
      try {
        await task();
      } catch (cause) {
        onToast(cause instanceof Error ? cause.message : "The transaction could not be submitted.", "bad");
      }
    });
  }

  async function claimSeat() {
    const account = wallet || await onConnect();
    if (isDemo) {
      onToast(`${faction?.name ?? selectedFactionId} is yours in the demo. Live claims require a deployed republic.`);
      return;
    }
    const hash = await writeRepublic(account, "claim_faction", [selectedFactionId]);
    onToast(`Seat claim submitted · ${hash.slice(0, 10)}…`);
    await onRefresh();
  }

  async function commitAction() {
    const account = wallet || await onConnect();
    if ((!faction || !ownedByWallet(faction.controller, account)) && !isDemo) {
      throw new Error("Claim this faction before committing its action.");
    }
    if (draft.rationale.trim().length < 8) throw new Error("Add a rationale of at least 8 characters.");
    if (isDemo) {
      onToast(`${actionLabels[draft.action_type]} staged. The live contract uses commit/reveal before settlement.`);
      return;
    }
    const nonce = createNonce();
    const commitment = await previewActionCommitment(draft, nonce);
    const transactionHash = await writeRepublic(account, "commit_action", [draft.faction_id, commitment]);
    const record: PendingReveal = { ...draft, nonce, round: snapshot.game.round_number, transactionHash };
    const key = actionStorageKey("republic", snapshot.game.round_number, selectedFactionId);
    window.localStorage.setItem(key, JSON.stringify(record));
    setPendingReveal(record);
    onToast(`Action sealed onchain · ${transactionHash.slice(0, 10)}…`);
    await onRefresh();
  }

  async function revealAction() {
    if (!pendingReveal) throw new Error("No local action secret was found for this round.");
    const account = wallet || await onConnect();
    if (isDemo) {
      onToast("Action revealed in demo mode.");
      return;
    }
    const hash = await writeRepublic(account, "reveal_action", [
      pendingReveal.faction_id,
      pendingReveal.action_type,
      pendingReveal.target_faction_id,
      pendingReveal.target_law_id,
      pendingReveal.law_title,
      pendingReveal.law_text,
      pendingReveal.rationale,
      pendingReveal.nonce,
    ]);
    window.localStorage.removeItem(
      actionStorageKey("republic", snapshot.game.round_number, selectedFactionId),
    );
    setPendingReveal(null);
    onToast(`Reveal submitted · ${hash.slice(0, 10)}…`);
    await onRefresh();
  }

  async function advanceWorld() {
    const account = wallet || await onConnect();
    if (isDemo) {
      onToast("The keeper would now wake GenLayer; validators choose every missing faction action.");
      return;
    }
    const method = snapshot.game.phase === "READY_TO_FINALIZE_SEASON"
      ? "finalize_season"
      : snapshot.game.phase === "SEASON_FINAL"
        ? "start_next_season"
        : "advance_round";
    const hash = await writeRepublic(account, method);
    onToast(`${method.replaceAll("_", " ")} submitted · ${hash.slice(0, 10)}…`);
    await onRefresh();
  }

  async function commitObjective() {
    const account = wallet || await onConnect();
    if (snapshot.game.round_number > snapshot.game.objective_commit_end_round) {
      throw new Error("The objective commit window has closed for this season.");
    }
    if (isDemo) {
      onToast("Secret objective sealed in demo mode.");
      return;
    }
    const nonce = createNonce();
    const commitment = await previewObjectiveCommitment(
      selectedFactionId,
      objectiveType,
      objectiveTarget,
      nonce,
    );
    const hash = await writeRepublic(account, "commit_objective", [selectedFactionId, commitment]);
    window.localStorage.setItem(
      objectiveStorageKey("republic", snapshot.game.season_number, selectedFactionId),
      JSON.stringify({ nonce, objectiveTarget, objectiveType }),
    );
    onToast(`Objective sealed · ${hash.slice(0, 10)}…`);
    await onRefresh();
  }

  async function revealObjective() {
    const account = wallet || await onConnect();
    const key = objectiveStorageKey("republic", snapshot.game.season_number, selectedFactionId);
    const stored = window.localStorage.getItem(key);
    if (!stored) throw new Error("This browser does not have the secret objective nonce.");
    const secret = JSON.parse(stored) as { nonce: string; objectiveTarget: string; objectiveType: string };
    if (isDemo) {
      onToast("Secret objective revealed in demo mode.");
      return;
    }
    const hash = await writeRepublic(account, "reveal_objective", [
      selectedFactionId,
      secret.objectiveType,
      secret.objectiveTarget,
      secret.nonce,
    ]);
    window.localStorage.removeItem(key);
    onToast(`Objective revealed · ${hash.slice(0, 10)}…`);
    await onRefresh();
  }

  const needsFactionTarget = draft.action_type === "UNDERMINE";
  const needsLaw = ["SUPPORT_LAW", "OPPOSE_LAW", "AMEND_LAW", "REPEAL_LAW", "VETO_LAW"].includes(draft.action_type);
  const needsText = ["PROPOSE_LAW", "PROPOSE_CHARTER", "AMEND_LAW"].includes(draft.action_type);
  const needsOffice = draft.action_type === "RUN_FOR_OFFICE";
  const canAdvance = ["READY_TO_ADVANCE", "READY_TO_FINALIZE_SEASON", "SEASON_FINAL"].includes(snapshot.game.phase);

  return (
    <section className="action-panel" aria-labelledby="action-heading">
      <div className="action-panel-header">
        <div>
          <span className="eyebrow">Your move</span>
          <h2 id="action-heading">Write the next chapter</h2>
        </div>
        <span className={`phase-chip phase-${snapshot.game.phase.toLowerCase()}`}>
          {snapshot.game.phase.replaceAll("_", " ")}
        </span>
      </div>

      {!wallet ? (
        <button className="primary-button full" type="button" onClick={() => run(onConnect)} disabled={isPending}>
          Connect wallet to take a seat
        </button>
      ) : isAiSeat && !isDemo ? (
        <div className="claim-callout">
          <div><strong>This seat is autonomous.</strong><span>You can take control without stopping its AI fallback.</span></div>
          <button className="primary-button" type="button" onClick={() => run(claimSeat)} disabled={isPending}>Claim faction</button>
        </div>
      ) : null}

      <div className="action-grid">
        <label>
          <span>Faction</span>
          <input readOnly value={faction?.name ?? selectedFactionId} />
        </label>
        <label>
          <span>Action</span>
          <select value={draft.action_type} onChange={(event) => chooseAction(event.target.value)}>
            {availableActions.map((item) => <option key={item} value={item}>{actionLabels[item]}</option>)}
          </select>
        </label>

        {needsFactionTarget ? (
          <label>
            <span>Target faction</span>
            <select value={draft.target_faction_id} onChange={(event) => setDraft((current) => ({ ...current, target_faction_id: event.target.value }))}>
              <option value="">Choose a rival</option>
              {snapshot.factions.filter((item) => item.faction_id !== selectedFactionId).map((item) => (
                <option key={item.faction_id} value={item.faction_id}>{item.name}</option>
              ))}
            </select>
          </label>
        ) : null}

        {needsLaw ? (
          <label>
            <span>Law</span>
            <select value={draft.target_law_id} onChange={(event) => setDraft((current) => ({ ...current, target_law_id: Number(event.target.value) }))}>
              <option value={0}>Choose a law</option>
              {snapshot.laws.map((law) => <option key={law.law_id} value={law.law_id}>#{law.law_id} · {law.title} · {law.status}</option>)}
            </select>
          </label>
        ) : null}

        {needsOffice ? (
          <label>
            <span>Office</span>
            <select value={draft.law_title} onChange={(event) => setDraft((current) => ({ ...current, law_title: event.target.value }))}>
              <option value="">Choose an office</option>
              {snapshot.offices.map((office) => <option key={office.office_id} value={office.office_id}>{office.office_id}</option>)}
            </select>
          </label>
        ) : null}

        {needsText ? (
          <>
            <label className="wide-field">
              <span>Title</span>
              <input maxLength={80} value={draft.law_title} onChange={(event) => setDraft((current) => ({ ...current, law_title: event.target.value }))} placeholder="Name the proposal" />
            </label>
            <label className="wide-field">
              <span>Legal text</span>
              <textarea maxLength={800} rows={3} value={draft.law_text} onChange={(event) => setDraft((current) => ({ ...current, law_text: event.target.value }))} placeholder="Write the rule that future courts must interpret" />
            </label>
          </>
        ) : null}

        <label className="wide-field">
          <span>{draft.action_type === "RESPOND_CRISIS" ? "Response plan" : "Rationale"}</span>
          <textarea maxLength={300} rows={3} value={draft.rationale} onChange={(event) => setDraft((current) => ({ ...current, rationale: event.target.value }))} />
        </label>
      </div>

      <div className="action-footer">
        <span className="commit-note">Actions are sealed first. The reveal phase prevents AI factions from reacting to hidden human moves.</span>
        {snapshot.game.phase === "COMMIT" ? (
          <button className="primary-button" type="button" onClick={() => run(commitAction)} disabled={isPending}>Seal action</button>
        ) : snapshot.game.phase === "REVEAL" ? (
          <button className="primary-button" type="button" onClick={() => run(revealAction)} disabled={isPending || !pendingReveal}>Reveal action</button>
        ) : canAdvance ? (
          <button className="primary-button" type="button" onClick={() => run(advanceWorld)} disabled={isPending}>Advance republic</button>
        ) : null}
      </div>

      <details className="objective-drawer">
        <summary><span>Secret objective</span><b>{objective?.objective_type.toLowerCase().replaceAll("_", " ")}</b></summary>
        <div className="objective-form">
          <label>
            <span>Objective</span>
            <select value={objectiveType} onChange={(event) => setObjectiveType(event.target.value)}>
              {objectiveTypes.map((item) => <option value={item} key={item}>{item.toLowerCase().replaceAll("_", " ")}</option>)}
            </select>
          </label>
          {objectiveType === "RIVAL_FALL" ? (
            <label>
              <span>Rival</span>
              <select value={objectiveTarget} onChange={(event) => setObjectiveTarget(event.target.value)}>
                <option value="">Choose rival</option>
                {snapshot.factions.filter((item) => item.faction_id !== selectedFactionId).map((item) => <option value={item.faction_id} key={item.faction_id}>{item.name}</option>)}
              </select>
            </label>
          ) : null}
          {snapshot.game.phase === "OBJECTIVE_REVEAL" ? (
            <button type="button" className="secondary-button" onClick={() => run(revealObjective)} disabled={isPending}>Reveal objective</button>
          ) : (
            <button type="button" className="secondary-button" onClick={() => run(commitObjective)} disabled={isPending || objective?.source === "SECRET"}>Seal objective</button>
          )}
        </div>
      </details>
    </section>
  );
}
