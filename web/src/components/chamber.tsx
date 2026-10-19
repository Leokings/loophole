"use client";

import Image from "next/image";

import { Countdown } from "@/components/countdown";
import type { RepublicSnapshot } from "@/lib/types";

function words(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}

function QuoteText({ text, quote }: { text: string; quote: string }) {
  const index = quote ? text.indexOf(quote) : -1;
  if (index < 0) return <>{text}{quote ? <small className="quote-warning">Certification quote not found in law text.</small> : null}</>;
  return <>{text.slice(0, index)}<mark>{text.slice(index, index + quote.length)}</mark>{text.slice(index + quote.length)}</>;
}

export function Chamber({ snapshot }: { snapshot: RepublicSnapshot }) {
  const { crisis, game, laws } = snapshot;
  const pending = laws.filter((law) => law.status === "PENDING");
  const enacted = laws.filter((law) => law.status === "ENACTED");
  const deadline = game.phase === "COMMIT" ? game.commit_deadline : game.reveal_deadline;
  const recentSummary = snapshot.summary;
  const responsesByFaction = new Map(crisis?.responses.map((response) => [response.faction_id, response]) ?? []);

  return (
    <section className="chamber-view" aria-labelledby="chamber-heading">
      <div className="world-banner">
        <Image alt="" aria-hidden="true" className="world-banner-art" fill preload
          sizes="(max-width: 760px) calc(100vw - 32px), (max-width: 1080px) calc(100vw - 245px), 65vw" src="/art/republic-chamber.webp" />
        <div className="world-banner-copy">
          <span className="eyebrow">Season {game.season_number} · Round {game.round_number} of {game.season_end_round}</span>
          <h1 id="chamber-heading">The republic does not wait.</h1>
          <p>Take a faction. Shape its laws. Validators settle each judgment from the recorded evidence.</p>
          <span className="autonomy-caption"><i /> Autonomous factions keep the world moving</span>
        </div>
        <div className="deadline-block">
          <span>{game.phase === "COMMIT" ? "Commit closes" : game.phase === "REVEAL" ? "Reveal closes" : "Next transition"}</span>
          <strong>{deadline > 0 ? <Countdown deadline={deadline} key={deadline} /> : "Ready"}</strong>
        </div>
      </div>

      <div className="world-metrics">
        <div className="stability-meter"><div className="metric-copy"><span>Republic stability</span><strong>{game.stability}<i>/{game.maximum_stability}</i></strong></div>
          <div className="meter-track"><span style={{ width: `${(game.stability / game.maximum_stability) * 100}%` }} /></div></div>
        <div><span>Active laws</span><strong>{game.active_law_count}/16</strong><small>{pending.length} bills open</small></div>
        <div><span>Next election</span><strong>R{game.next_election_round}</strong><small>{game.election_open ? "nominations open" : "office terms active"}</small></div>
        <div><span>Case law</span><strong>{snapshot.registry?.holding_count ?? 0}</strong><small>{snapshot.court?.open_case_count ?? 0} cases open</small></div>
      </div>

      <div className="chamber-columns">
        <article className={`crisis-card ${crisis ? "active" : "quiet"}`}>
          <div className="crisis-header"><div><span className="eyebrow">{crisis ? `Crisis · Severity ${crisis.severity} (${words(crisis.severity_source ?? "CODE_DERIVED")})` : "Civic conditions"}</span>
            <h2>{crisis?.title ?? "A rare quiet interval"}</h2></div>{crisis ? <span className="crisis-pulse"><i /> {words(crisis.status)}</span> : null}</div>
          <p>{crisis?.description ?? "No crisis is open. Factions can prepare influence, wealth, and legislation."}</p>
          {crisis ? <>
            <div className="resolution-standard"><span>Success criterion</span><p>{crisis.success_criterion}</p></div>
            <div className="crisis-footer"><span>{crisis.response_count}/{game.faction_count} responses</span><span>Closes after round {crisis.closes_after_round}</span>
              {crisis.status === "JUDGING" && crisis.judging_deadline ? <span>Judgment deadline <Countdown deadline={crisis.judging_deadline} /></span> : null}</div>
            <div className="crisis-results">{snapshot.factions.map((faction) => {
              const response = responsesByFaction.get(faction.faction_id);
              return <article key={faction.faction_id}><strong>{faction.name}</strong><span className={`case-status status-${(response?.judgment ?? "NOT_RESPONDED").toLowerCase()}`}>{response?.judgment ?? "NOT_RESPONDED"}</span>
                {response ? <p>{response.quote ? <QuoteText text={response.response} quote={response.quote} /> : response.response}</p> : null}</article>;
            })}</div>
            {crisis.resolution_json ? <p className="resolution-outcome"><strong>Outcome:</strong> {crisis.resolution_json}</p> : null}
          </> : null}
        </article>

        <section className="docket-card" aria-labelledby="docket-heading">
          <div className="section-heading"><span id="docket-heading">Legislative docket</span><span className="eyebrow">Latest law first</span></div>
          <div className="law-list">
            {[...pending, ...enacted].sort((a, b) => b.law_id - a.law_id).map((law) => {
              const supersedingLaw = laws.find((candidate) => candidate.parent_law_id === law.law_id && candidate.status === "ENACTED");
              return <article className="law-row" key={law.law_id}>
                <span className="law-number">§{law.law_id}</span><div>
                  <div><strong>{law.title}</strong><span className={`law-status law-${law.status.toLowerCase()}`}>{words(law.status)}</span></div>
                  <span className={`certification-badge certification-${law.certification.toLowerCase()}`}>{law.certification === "UNCERTIFIED" ? "Certification pending" : law.certification}</span>
                  <p><QuoteText text={law.text} quote={law.certification_quote} /></p>
                  <small>{words(law.law_kind)} · {law.sponsor_faction_id} · {law.support_votes} support (sponsor included) / {law.oppose_votes} oppose · {law.certification === "UNCERTIFIED" ? "certification pending" : law.certification}</small>
                  {law.status === "PENDING" ? <small>Closes after round {law.closes_after_round}</small> : null}
                  {law.parent_law_id > 0 ? <small>Amends law #{law.parent_law_id}</small> : null}
                  {supersedingLaw ? <small>Superseded by law #{supersedingLaw.law_id}</small> : null}
                </div>
              </article>;
            })}
            {pending.length + enacted.length === 0 ? <p className="empty-state">The docket is empty.</p> : null}
          </div>
        </section>
      </div>

      <section className="round-summary" aria-labelledby="round-summary-heading">
        <div className="section-heading"><span id="round-summary-heading">Round {recentSummary?.round_number ?? "—"} summary</span>
          <span className="eyebrow">Recorded faction actions</span></div>
        {recentSummary ? <>
          {recentSummary.fallback_round ? <p className="status-banner">Fallback round: missing seats used their precommitted fallback actions.</p> : null}
          {recentSummary.crisis_skipped ? <p className="status-banner">Crisis judgment was skipped for this round.</p> : null}
          <div className="round-summary-grid">{recentSummary.actions.map((action) => <article key={action.faction_id}>
            <strong>{snapshot.factions.find((faction) => faction.faction_id === action.faction_id)?.name ?? action.faction_id}</strong>
            <span>{action.source === "HUMAN" ? "HUMAN" : action.source === "AI_FALLBACK" ? "AI_FALLBACK" : "AI"}</span><p>{words(action.action_type)}{action.target_faction_id ? ` · ${action.target_faction_id}` : ""}</p>
          </article>)}</div>
        </> : <p className="empty-state">The previous round summary is not available yet.</p>}
      </section>
    </section>
  );
}
