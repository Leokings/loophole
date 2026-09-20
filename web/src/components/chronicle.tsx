"use client";

import type { RepublicSnapshot } from "@/lib/types";

function words(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}

export function Chronicle({ snapshot }: { snapshot: RepublicSnapshot }) {
  const summary = snapshot.summary;
  return (
    <section className="chronicle-view" aria-labelledby="chronicle-heading">
      <div className="chronicle-title">
        <span className="eyebrow">Immutable chronicle</span>
        <h2 id="chronicle-heading">Round {summary?.round_number ?? "—"}, entered into the record.</h2>
        <p>Every revealed and autonomous action is preserved in stable faction order. AI seats are visible, attributable, and judged from the same pre-settlement public state.</p>
      </div>
      <div className="chronicle-grid">
        {(summary?.actions ?? []).map((item, index) => {
          const faction = snapshot.factions.find((candidate) => candidate.faction_id === item.faction_id);
          return (
            <article className="chronicle-entry" key={`${item.faction_id}-${index}`}>
              <span className="entry-index">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <div className="entry-meta">
                  <strong>{faction?.name ?? item.faction_id}</strong>
                  <span className={item.source.startsWith("AI") ? "source-ai" : "source-human"}>{words(item.source)}</span>
                </div>
                <h3>{words(item.action_type)}</h3>
                <p>{item.rationale}</p>
                {item.law_title ? <blockquote>“{item.law_title}”</blockquote> : null}
              </div>
            </article>
          );
        })}
      </div>
      <div className="record-footer">
        <span>Policy</span>
        <code>{snapshot.game.policy_version}</code>
        <span>Accepted state</span>
        <b>Round {summary?.round_number ?? 0}</b>
      </div>
    </section>
  );
}
