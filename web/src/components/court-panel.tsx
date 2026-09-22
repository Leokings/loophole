"use client";

import Image from "next/image";
import { useEffect, useState, useTransition } from "react";

import { waitForFinalizedTransaction, writeCourt } from "@/lib/genlayer";
import type { RepublicSnapshot } from "@/lib/types";

function sentenceCase(value: string) {
  return value ? value.toLowerCase().replaceAll("_", " ") : "Awaiting judgment";
}

export function CourtPanel({
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
  const [reference, setReference] = useState("");
  const [defendant, setDefendant] = useState("");
  const [actionRound, setActionRound] = useState(Math.max(1, snapshot.game.round_number - 1));
  const [lawId, setLawId] = useState(snapshot.laws.find((law) => law.status === "ENACTED")?.law_id ?? 0);
  const [claim, setClaim] = useState("");
  const [caseText, setCaseText] = useState("");
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  function run(task: () => Promise<void>) {
    startTransition(async () => {
      try {
        await task();
      } catch (cause) {
        onToast(cause instanceof Error ? cause.message : "The court transaction failed.", "bad");
      }
    });
  }

  async function activeWallet() {
    return wallet || onConnect();
  }

  async function confirmFinality(hash: string, label: string) {
    onToast(`${label} submitted · waiting for GenLayer finality`);
    await waitForFinalizedTransaction(hash);
    onToast(`${label} finalized onchain · ${hash.slice(0, 10)}…`);
  }

  async function fileCase() {
    if (!defendant || !lawId || claim.trim().length < 20) {
      throw new Error("Choose a defendant and enacted law, then state a claim of at least 20 characters.");
    }
    if (isDemo) {
      onToast("Case filed in demo mode. Live filing freezes the action and law evidence onchain.");
      return;
    }
    const account = await activeWallet();
    const caseReference = reference || `${selectedFactionId}-v-${defendant}-${Date.now().toString(36)}`;
    const hash = await writeCourt(account, "file_case", [
      caseReference,
      selectedFactionId,
      defendant,
      actionRound,
      JSON.stringify([lawId]),
      claim,
    ]);
    await confirmFinality(hash, "Court case");
    setClaim("");
    setReference("");
    await onRefresh();
  }

  async function moveCase(caseId: number, status: string, briefDeadline: number, appealDeadline: number, responseDeadline: number) {
    if (isDemo) {
      onToast("Court step simulated. Onchain, GenLayer validators independently audit every ruling.");
      return;
    }
    const account = await activeWallet();
    let functionName = "";
    let args: unknown[] = [];
    if (status === "BRIEFING") {
      if (now >= briefDeadline) {
        functionName = "resolve_case";
        args = [caseId];
      } else {
        if (caseText.trim().length < 20) throw new Error("A brief must be at least 20 characters.");
        functionName = "submit_brief";
        args = [caseId, selectedFactionId, caseText];
      }
    } else if (status === "APPEAL_WINDOW") {
      if (now >= appealDeadline) {
        functionName = "finalize_case";
        args = [caseId];
      } else {
        if (caseText.trim().length < 20) throw new Error("An appeal must be at least 20 characters.");
        functionName = "appeal_case";
        args = [caseId, selectedFactionId, caseText];
      }
    } else if (status === "APPEALED") {
      if (now >= responseDeadline) {
        functionName = "resolve_appeal";
        args = [caseId];
      } else {
        if (caseText.trim().length < 20) throw new Error("A response must be at least 20 characters.");
        functionName = "submit_appeal_response";
        args = [caseId, selectedFactionId, caseText];
      }
    } else {
      throw new Error("This case is already final.");
    }
    const hash = await writeCourt(account, functionName, args);
    await confirmFinality(hash, functionName.replaceAll("_", " "));
    setCaseText("");
    await onRefresh();
  }

  return (
    <section className="court-view" aria-labelledby="court-heading">
      <div className="court-intro">
        <Image
          alt=""
          aria-hidden="true"
          className="court-intro-art"
          fill
          sizes="(max-width: 760px) calc(100vw - 32px), (max-width: 1080px) calc(100vw - 245px), 65vw"
          src="/art/consensus-court.webp"
        />
        <div className="court-intro-copy">
          <span className="eyebrow">Republic Court</span>
          <h2 id="court-heading">Law becomes strategy when precedent remembers.</h2>
          <p>Cases freeze a resolved action and the laws effective on that round. The leader judge proposes a ruling; validators independently audit it before any sanction can alter the republic.</p>
        </div>
        <div className="court-stats">
          <span><b>{snapshot.court?.open_case_count ?? 0}</b> open</span>
          <span><b>{snapshot.court?.finalized_case_count ?? 0}</b> final</span>
          <span><b>{snapshot.court?.precedent_count ?? 0}</b> precedents</span>
        </div>
      </div>

      <div className="court-layout">
        <div className="case-list">
          <div className="section-heading"><span>Current docket</span><span className="eyebrow">Newest first</span></div>
          {snapshot.cases.length === 0 ? <p className="empty-state">No cases have been filed.</p> : snapshot.cases.map((item) => (
            <article className="case-card" key={item.case_id}>
              <div className="case-topline">
                <span>Case {item.case_id.toString().padStart(3, "0")}</span>
                <span className={`case-status status-${item.status.toLowerCase()}`}>{sentenceCase(item.status)}</span>
              </div>
              <h3>{item.plaintiff_faction_id} <i>v.</i> {item.defendant_faction_id}</h3>
              <p>{item.claim_text}</p>
              {item.verdict ? (
                <div className="verdict-block">
                  <strong>{sentenceCase(item.verdict)}</strong>
                  <span>{item.sanction && item.sanction !== "NONE" ? `${sentenceCase(item.sanction)} sanction` : "No sanction"}</span>
                  <p>{item.reasoning}</p>
                  {item.precedent_rule ? <blockquote>{item.precedent_rule}</blockquote> : null}
                </div>
              ) : null}
              {item.status !== "FINAL" ? (
                <button
                  className="text-button"
                  disabled={isPending}
                  onClick={() => run(() => moveCase(item.case_id, item.status, item.brief_deadline, item.appeal_deadline, item.appeal_response_deadline))}
                  type="button"
                >
                  Advance this case <span aria-hidden="true">→</span>
                </button>
              ) : null}
            </article>
          ))}
          <label className="case-writing">
            <span>Brief, appeal, or response for the selected open case</span>
            <textarea rows={4} maxLength={2400} value={caseText} onChange={(event) => setCaseText(event.target.value)} placeholder="Make the narrowest argument the record supports…" />
          </label>
        </div>

        <form className="file-case-card" onSubmit={(event) => { event.preventDefault(); run(fileCase); }}>
          <span className="eyebrow">File a challenge</span>
          <h3>{selectedFactionId} as plaintiff</h3>
          <label><span>Case reference</span><input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Optional unique reference" /></label>
          <label>
            <span>Defendant</span>
            <select value={defendant} onChange={(event) => setDefendant(event.target.value)} required>
              <option value="">Choose faction</option>
              {snapshot.factions.filter((faction) => faction.faction_id !== selectedFactionId).map((faction) => <option key={faction.faction_id} value={faction.faction_id}>{faction.name}</option>)}
            </select>
          </label>
          <div className="split-fields">
            <label><span>Action round</span><input min={1} max={snapshot.game.round_number - 1} type="number" value={actionRound} onChange={(event) => setActionRound(Number(event.target.value))} /></label>
            <label>
              <span>Cited law</span>
              <select value={lawId} onChange={(event) => setLawId(Number(event.target.value))}>
                <option value={0}>Choose law</option>
                {snapshot.laws.filter((law) => law.effective_from_round > 0).map((law) => <option key={law.law_id} value={law.law_id}>#{law.law_id} · {law.title}</option>)}
              </select>
            </label>
          </div>
          <label><span>Claim</span><textarea rows={6} maxLength={1200} value={claim} onChange={(event) => setClaim(event.target.value)} placeholder="Explain how the recorded action violated the cited law…" /></label>
          <button className="primary-button full" type="submit" disabled={isPending}>Freeze evidence & file</button>
        </form>
      </div>
    </section>
  );
}
