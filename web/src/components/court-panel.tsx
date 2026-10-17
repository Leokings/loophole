"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import {
  contractExplorerUrl,
  fileCase as submitCase,
  runKeeperOp,
  submitBrief,
  transactionExplorerUrl,
  waitForFinalizedTransaction,
} from "@/lib/genlayer";
import type { CourtCase, RepublicSnapshot } from "@/lib/types";

function sentenceCase(value: string) {
  return value ? value.toLowerCase().replaceAll("_", " ") : "Awaiting judgment";
}

function HighlightedLaw({ text, quote }: { text: string; quote: string }) {
  const index = quote ? text.indexOf(quote) : -1;
  return index < 0
    ? <>{text}{quote ? <span className="quote-warning">Quote not found in frozen law text</span> : null}</>
    : <>{text.slice(0, index)}<mark>{text.slice(index, index + quote.length)}</mark>{text.slice(index + quote.length)}</>;
}

function evidenceAction(item: CourtCase) {
  try { return (JSON.parse(item.evidence_json) as { action?: Record<string, unknown> }).action ?? {}; }
  catch { return {}; }
}

function CaseCard({
  item, isDemo, isPending, filingTx, onBrief, onKeeper, selectedFactionId, snapshot,
}: {
  item: CourtCase; isDemo: boolean; isPending: boolean; filingTx?: string;
  onBrief: (item: CourtCase, brief: string) => void; onKeeper: (item: CourtCase, method: string) => void;
  selectedFactionId: string; snapshot: RepublicSnapshot;
}) {
  const [brief, setBrief] = useState("");
  const action = evidenceAction(item);
  const keeperOp = snapshot.keeperStatus.court?.ops.find((op) => Number(op.args[0]) === item.case_id);
  const courtLink = contractExplorerUrl(process.env.NEXT_PUBLIC_COURT_ADDRESS ?? "");
  const republicLink = contractExplorerUrl(process.env.NEXT_PUBLIC_REPUBLIC_ADDRESS ?? "");
  return <article className="case-card" id={`case-${item.case_id}`}>
    <div className="case-topline"><span>Case {item.case_id.toString().padStart(3, "0")} · {item.case_reference}</span>
      <span className={`case-status status-${item.status.toLowerCase()}`}>{sentenceCase(item.status)}</span></div>
    <h3>{item.plaintiff_faction_id} <i>v.</i> {item.defendant_faction_id}</h3>
    <p>{item.claim_text}</p>
    <div className="case-facts">
      <span>Filed by {item.source === "REPUBLIC" ? "Republic seat" : item.filed_by}</span>
      <span>Action round {item.action_round} · {String(action.action_type ?? "Unknown action")}</span>
      <span>Key <code>{item.key}</code> · target class {item.target_class}</span>
    </div>
    <div className="case-law-block"><strong>Law #{item.law_id} · {item.law_title || "Cited rule"}</strong>
      <p><HighlightedLaw text={item.law_text} quote={item.quote} /></p></div>
    {item.label ? <div className="verdict-block"><strong>{sentenceCase(item.label)}</strong>
      <span>{sentenceCase(item.verdict)} · {item.sanction && item.sanction !== "NONE" ? sentenceCase(item.sanction) : "no sanction"}</span>
      {item.rule_text ? <blockquote>{item.rule_text}</blockquote> : null}</div> : null}
    {item.holding_case_id > 0 ? <p className="case-summary-link">Decided by holding from <a href={`#case-${item.holding_case_id}`}>case #{item.holding_case_id}</a>.</p> : null}
    {item.effectsPending ? <div className="effects-pending" role="status">
      <strong>Effects pending: {item.effectsPending}</strong>
      {item.status === "DECIDED" ? <p>Accepted — GenLayer appeal window open; the holding takes effect at finality.</p> : null}
      <small>The keeper retries missing callbacks after 30 minutes. Refresh this docket to check again.</small>
    </div> : null}
    {item.status === "BRIEFING" ? <div className="case-briefs">
      {item.plaintiff_brief ? <p><strong>Plaintiff brief</strong> {item.plaintiff_brief}</p> : null}
      {item.defense_brief ? <p><strong>Defense brief</strong> {item.defense_brief}</p> : null}
    </div> : null}
    {item.status === "BRIEFING" || item.status === "STAYED" ? <div className="case-actions">
      {item.status === "BRIEFING" && [item.plaintiff_faction_id, item.defendant_faction_id].includes(selectedFactionId) ? (
        <form onSubmit={(event) => { event.preventDefault(); onBrief(item, brief); }}>
          <label><span>Brief as {selectedFactionId}</span><textarea maxLength={2400} minLength={20} rows={3} value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="Make a focused argument about the frozen action and rule." /></label>
          <button className="secondary-button" disabled={isPending || brief.trim().length < 20} type="submit">Submit brief</button>
        </form>
      ) : null}
      {keeperOp ? <button className="text-button" disabled={isPending} onClick={() => onKeeper(item, keeperOp.method)} type="button">Run public step: {sentenceCase(keeperOp.method)} →</button> : null}
    </div> : null}
    <div className="case-links">
      {filingTx ? <a href={transactionExplorerUrl(filingTx)} rel="noreferrer" target="_blank">Filing transaction</a> : null}
      {courtLink ? <a href={courtLink} rel="noreferrer" target="_blank">Court contract</a> : null}
      {republicLink ? <a href={republicLink} rel="noreferrer" target="_blank">Republic contract</a> : null}
      {isDemo ? <span>Demonstration record</span> : null}
    </div>
  </article>;
}

export function CourtPanel({
  isDemo, onConnect, onRefresh, onToast, selectedFactionId, snapshot, wallet,
}: {
  isDemo: boolean; onConnect: () => Promise<string>; onRefresh: () => Promise<void>;
  onToast: (message: string, tone?: "good" | "bad") => void; selectedFactionId: string;
  snapshot: RepublicSnapshot; wallet: string;
}) {
  const rounds = [...new Set(snapshot.historicalActions.map((action) => action.action_round))].sort((a, b) => b - a);
  const [reference, setReference] = useState("");
  const [defendant, setDefendant] = useState("");
  const [actionRound, setActionRound] = useState(rounds[0] ?? Math.max(1, snapshot.game.round_number - 1));
  const [lawId, setLawId] = useState(0);
  const [claim, setClaim] = useState("");
  const [filingTransactions, setFilingTransactions] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();
  const availableDefendants = snapshot.historicalActions.filter((item) => item.action_round === actionRound && item.faction_id !== selectedFactionId);
  const selectedDefendant = availableDefendants.some((item) => item.faction_id === defendant) ? defendant : availableDefendants[0]?.faction_id ?? "";
  const action = snapshot.historicalActions.find((item) => item.action_round === actionRound && item.faction_id === selectedDefendant);
  const eligibleLaws = snapshot.lawHistory.filter((law) => law.certification === "ADJUDICABLE"
    && law.effective_from_round > 0 && law.effective_from_round <= actionRound
    && (!law.effective_until_round || actionRound <= law.effective_until_round));
  const selectedLawId = eligibleLaws.some((item) => item.law_id === lawId) ? lawId : eligibleLaws[0]?.law_id ?? 0;
  const citedLaw = eligibleLaws.find((law) => law.law_id === selectedLawId);
  const suitTarget = action ? snapshot.suitTargets.find((target) => target.actionRound === actionRound
    && target.defendantFactionId === selectedDefendant && target.lawId === selectedLawId) : undefined;
  const key = suitTarget?.key ?? "";
  const existingHolding = snapshot.holdings.find((holding) => holding.key === key);
  const currentCases = useMemo(() => ({
    open: snapshot.cases.filter((item) => item.status === "BRIEFING" || item.status === "STAYED"),
    terminal: snapshot.cases.filter((item) => ["DECIDED", "SUMMARY", "EXPIRED"].includes(item.status)),
  }), [snapshot.cases]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { setFilingTransactions(JSON.parse(window.localStorage.getItem("loophole:v7:case-filings") ?? "{}") as Record<string, string>); }
      catch { setFilingTransactions({}); }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function run(task: () => Promise<unknown>) {
    startTransition(async () => {
      try { await task(); }
      catch (cause) { onToast(cause instanceof Error ? cause.message : "The court transaction failed.", "bad"); }
    });
  }

  async function confirmFinality(hash: string, label: string) {
    onToast(`${label} submitted · waiting for GenLayer finality`);
    await waitForFinalizedTransaction(hash, label, (transaction) => {
      if (transaction.stage === "accepted") onToast(`${label} accepted · appeal window open`);
    });
    onToast(`${label} finalized · ${hash.slice(0, 10)}…`);
  }

  async function fileCase() {
    if (!action || !citedLaw || !suitTarget || claim.trim().length < 20) throw new Error("Choose a contract-listed recorded action and an effective law, then write a claim of at least 20 characters.");
    if (isDemo) { onToast("Case filing shown in demonstration mode. Live filing freezes the selected action and law onchain."); return; }
    const account = wallet || await onConnect();
    const caseReference = reference || `${selectedFactionId}-R${actionRound}-${selectedDefendant}-L${selectedLawId}-${Date.now().toString(36)}`;
    const hash = await submitCase(account, { actionRound, claim: claim.trim(), defendantFactionId: selectedDefendant,
      lawId: selectedLawId, plaintiffFactionId: selectedFactionId, reference: caseReference });
    const updated = { ...filingTransactions, [caseReference]: hash };
    window.localStorage.setItem("loophole:v7:case-filings", JSON.stringify(updated));
    setFilingTransactions(updated);
    await confirmFinality(hash, "Case filing");
    setClaim(""); setReference(""); await onRefresh();
  }

  async function addBrief(item: CourtCase, text: string) {
    if (text.trim().length < 20) throw new Error("A brief must be at least 20 characters.");
    const account = wallet || await onConnect();
    if (isDemo) { onToast("Brief shown in demonstration mode."); return; }
    const hash = await submitBrief(account, item.case_id, selectedFactionId, text.trim());
    await confirmFinality(hash, "Brief"); await onRefresh();
  }

  async function performKeeperOp(item: CourtCase, method: string) {
    const account = wallet || await onConnect();
    if (isDemo) { onToast(`Public ${sentenceCase(method)} step shown in demonstration mode.`); return; }
    const op = snapshot.keeperStatus.court?.ops.find((candidate) => candidate.method === method && Number(candidate.args[0]) === item.case_id);
    if (!op) throw new Error("This case has no matching permissionless step listed by the court.");
    const hash = await runKeeperOp(account, { ...op, contract: "court" }, snapshot);
    await confirmFinality(hash, sentenceCase(method)); await onRefresh();
  }

  function caseList(items: CourtCase[]) {
    return items.length ? items.map((item) => <CaseCard key={item.case_id} item={item} isDemo={isDemo} isPending={isPending}
      filingTx={filingTransactions[item.case_reference]} onBrief={(record, text) => run(() => addBrief(record, text))}
      onKeeper={(record, method) => run(() => performKeeperOp(record, method))} selectedFactionId={selectedFactionId} snapshot={snapshot} />)
      : <p className="empty-state">Nothing to show in this group.</p>;
  }

  return <section className="court-view" aria-labelledby="court-heading">
    <div className="court-intro">
      <div className="court-intro-copy"><span className="eyebrow">Republic Court · Public docket</span>
        <h2 id="court-heading">One rule. One frozen action. A public holding.</h2>
        <p>Each case uses the action and law as they stood at that round. Validators decide whether the quoted rule covers the recorded action.</p></div>
      <div className="court-stats"><span><b>{currentCases.open.filter((item) => item.status === "BRIEFING").length}</b> briefing</span>
        <span><b>{currentCases.open.filter((item) => item.status === "STAYED").length}</b> stayed</span>
        <span><b>{currentCases.terminal.length}</b> recent decided</span></div>
    </div>

    <div className="court-layout">
      <div className="case-list">
        <section><div className="section-heading"><span>Open cases</span><span className="eyebrow">Briefing or action due</span></div>{caseList(currentCases.open.filter((item) => item.status === "BRIEFING"))}</section>
        <section><div className="section-heading"><span>Stayed cases</span><span className="eyebrow">Waiting for the first holding</span></div>{caseList(currentCases.open.filter((item) => item.status === "STAYED"))}</section>
        <section><div className="section-heading"><span>Recent decisions</span><span className="eyebrow">Latest 20 terminal cases</span></div>{caseList(currentCases.terminal)}</section>
      </div>

      <form className="file-case-card" onSubmit={(event) => { event.preventDefault(); run(fileCase); }}>
        <span className="eyebrow">File a case</span><h3>{selectedFactionId} as plaintiff</h3>
        <label><span>Case reference (optional)</span><input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Generated if left blank" /></label>
        <label><span>Recorded action round (last 8)</span><select value={actionRound} onChange={(event) => setActionRound(Number(event.target.value))}>
          {rounds.map((round) => <option key={round} value={round}>Round {round}</option>)}</select></label>
        <label><span>Defendant</span><select value={selectedDefendant} onChange={(event) => setDefendant(event.target.value)} required>
          <option value="">Choose a faction with a recorded action</option>{availableDefendants.map((record) => <option key={record.faction_id} value={record.faction_id}>{record.faction_id} · {record.action_type}</option>)}</select></label>
        <label><span>Cited law (certified and effective then)</span><select value={selectedLawId} onChange={(event) => setLawId(Number(event.target.value))} required>
          <option value={0}>Choose one law</option>{eligibleLaws.map((law) => <option key={law.law_id} value={law.law_id}>#{law.law_id} · {law.title}</option>)}</select></label>
        {action && citedLaw ? <div className="key-preview"><span>Contract-computed holding key</span>{suitTarget ? <code>{key}</code> : <p>The contract has not listed this action and law as eligible for filing.</p>}<p>Recorded action: {action.action_type}{action.target_faction_id ? ` · target ${action.target_faction_id}` : ""}</p>
          {existingHolding ? <strong>This will be decided instantly by precedent: {existingHolding.label}.</strong> : null}</div> : null}
        <label><span>Claim</span><textarea rows={5} maxLength={1200} minLength={20} value={claim} onChange={(event) => setClaim(event.target.value)} placeholder="Explain how this recorded action violated the cited rule." /></label>
        <button className="primary-button full" type="submit" disabled={isPending || !action || !citedLaw || !suitTarget || claim.trim().length < 20}>Freeze evidence & file</button>
      </form>
    </div>
  </section>;
}
