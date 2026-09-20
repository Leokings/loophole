"use client";

import Image from "next/image";

import { Countdown } from "@/components/countdown";
import type { RepublicSnapshot } from "@/lib/types";

function words(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}

export function Chamber({ snapshot }: { snapshot: RepublicSnapshot }) {
  const { crisis, game, laws } = snapshot;
  const pending = laws.filter((law) => law.status === "PENDING");
  const enacted = laws.filter((law) => law.status === "ENACTED");
  const deadline = game.phase === "COMMIT" ? game.commit_deadline : game.reveal_deadline;

  return (
    <section className="chamber-view" aria-labelledby="chamber-heading">
      <div className="world-banner">
        <Image
          alt=""
          aria-hidden="true"
          className="world-banner-art"
          fill
          preload
          sizes="(max-width: 760px) calc(100vw - 32px), (max-width: 1080px) calc(100vw - 245px), 65vw"
          src="/art/republic-chamber.webp"
        />
        <div className="world-banner-copy">
          <span className="eyebrow">Season {game.season_number} · Round {game.round_number} of {game.season_end_round}</span>
          <h1 id="chamber-heading">The republic does not wait.</h1>
          <p>Take a faction. Bend the law. Let consensus AI keep every empty seat alive.</p>
          <span className="autonomy-caption"><i /> Four autonomous seats stay active</span>
        </div>
        <div className="deadline-block">
          <span>{game.phase === "COMMIT" ? "Commit closes" : game.phase === "REVEAL" ? "Reveal closes" : "Next transition"}</span>
          <strong>{deadline > 0 ? <Countdown deadline={deadline} key={deadline} /> : "Ready"}</strong>
        </div>
      </div>

      <div className="world-metrics">
        <div className="stability-meter">
          <div className="metric-copy"><span>Republic stability</span><strong>{game.stability}<i>/{game.maximum_stability}</i></strong></div>
          <div className="meter-track"><span style={{ width: `${(game.stability / game.maximum_stability) * 100}%` }} /></div>
        </div>
        <div><span>Enacted law</span><strong>{game.enacted_law_count}</strong><small>{pending.length} on the docket</small></div>
        <div><span>Next election</span><strong>R{game.next_election_round}</strong><small>{game.election_open ? "nominations open" : "office terms active"}</small></div>
        <div><span>Court rulings</span><strong>{game.court_ruling_count}</strong><small>{snapshot.court?.open_case_count ?? 0} cases unresolved</small></div>
      </div>

      <div className="chamber-columns">
        <article className={`crisis-card ${crisis ? "active" : "quiet"}`}>
          <div className="crisis-header">
            <div>
              <span className="eyebrow">{crisis ? `Active crisis · Severity ${crisis.severity}` : "Civic conditions"}</span>
              <h2>{crisis?.title ?? "A rare quiet interval"}</h2>
            </div>
            {crisis ? <span className="crisis-pulse"><i /> live</span> : null}
          </div>
          <p>{crisis?.description ?? "No crisis is currently open. Factions can prepare influence, wealth, and legislation before the next pressure event."}</p>
          {crisis ? (
            <>
              <div className="resolution-standard"><span>Judgment standard</span><p>{crisis.resolution_standard}</p></div>
              <div className="crisis-footer">
                <span>{crisis.response_count}/{game.faction_count} responses</span>
                <span>Closes after round {crisis.closes_after_round}</span>
              </div>
            </>
          ) : null}
        </article>

        <section className="docket-card" aria-labelledby="docket-heading">
          <div className="section-heading">
            <span id="docket-heading">Legislative docket</span>
            <span className="eyebrow">Latest law first</span>
          </div>
          <div className="law-list">
            {[...pending, ...enacted].slice(0, 4).map((law) => (
              <article className="law-row" key={law.law_id}>
                <span className="law-number">§{law.law_id}</span>
                <div>
                  <div><strong>{law.title}</strong><span className={`law-status law-${law.status.toLowerCase()}`}>{words(law.status)}</span></div>
                  <p>{law.text}</p>
                  <small>{words(law.law_kind)} · {law.sponsor_faction_id} · {law.support_votes} for / {law.oppose_votes} against</small>
                </div>
              </article>
            ))}
            {pending.length + enacted.length === 0 ? <p className="empty-state">The docket is empty.</p> : null}
          </div>
        </section>
      </div>
    </section>
  );
}
