"use client";

import type { Faction, Office, Objective } from "@/lib/types";

const officeCopy: Record<string, { numeral: string; power: string }> = {
  EXECUTIVE: { numeral: "I", power: "May veto a new statute" },
  SPEAKER: { numeral: "II", power: "Proposes statutes for 1 influence" },
  TREASURER: { numeral: "III", power: "Stabilizes without spending wealth" },
};

function displayObjective(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}

export function PowerPanel({
  factions,
  objectives,
  offices,
  selectedFactionId,
}: {
  factions: Faction[];
  objectives: Objective[];
  offices: Office[];
  selectedFactionId: string;
}) {
  const selected = factions.find((faction) => faction.faction_id === selectedFactionId);
  const objective = objectives.find((item) => item.faction_id === selectedFactionId);

  return (
    <aside className="power-panel">
      <div className="section-heading compact">
        <span>Offices of state</span>
        <span className="eyebrow">Term ledger</span>
      </div>
      <div className="office-stack">
        {offices.map((office) => {
          const holder = factions.find((faction) => faction.faction_id === office.holder_faction_id);
          const copy = officeCopy[office.office_id] ?? { numeral: "•", power: "Institutional authority" };
          return (
            <article className="office-card" key={office.office_id}>
              <span className="office-numeral">{copy.numeral}</span>
              <div>
                <span className="office-name">{office.office_id}</span>
                <strong>{holder?.name ?? office.holder_faction_id}</strong>
                <small>{copy.power} · through round {office.term_end_round}</small>
              </div>
            </article>
          );
        })}
      </div>

      <article className="objective-card">
        <span className="eyebrow">Selected faction objective</span>
        <h3>{objective ? displayObjective(objective.objective_type) : "No objective"}</h3>
        <p>
          {objective?.objective_type === "HIDDEN"
            ? "A sealed commitment is onchain. Reveal it after the final round to earn its points."
            : `This ${objective?.source.toLowerCase() ?? "default"} objective is evaluated when the season closes.`}
        </p>
        <div className="objective-meta">
          <span>{selected?.season_points ?? 0} event points</span>
          <span>{objective?.revealed ? "Public" : "Sealed"}</span>
        </div>
      </article>
    </aside>
  );
}
