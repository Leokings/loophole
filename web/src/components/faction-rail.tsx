"use client";

import Image from "next/image";

import type { Faction, Office } from "@/lib/types";

const factionGlyphs: Record<string, string> = {
  MERCHANTS: "M",
  REFORMERS: "R",
  TRADITIONALISTS: "C",
  REVOLUTIONARIES: "N",
};

const factionPortraits: Record<string, string> = {
  MERCHANTS: "/art/factions/merchants.webp",
  REFORMERS: "/art/factions/reformers.webp",
  TRADITIONALISTS: "/art/factions/traditionalists.webp",
  REVOLUTIONARIES: "/art/factions/revolutionaries.webp",
};

function shortAddress(value: string) {
  if (!value || value.endsWith("0000000000000000000000000000000000000000")) return "Autonomous";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export function FactionRail({
  factions,
  offices,
  onSelect,
  selectedId,
}: {
  factions: Faction[];
  offices: Office[];
  onSelect: (id: string) => void;
  selectedId: string;
}) {
  return (
    <aside className="faction-rail" aria-label="Republic factions">
      <div className="section-heading compact">
        <span>Power blocs</span>
        <span className="count-badge">{factions.length}</span>
      </div>
      <div className="faction-list">
        {factions.map((faction, index) => {
          const heldOffices = offices.filter((office) => office.holder_faction_id === faction.faction_id);
          const portrait = factionPortraits[faction.faction_id];
          const selected = faction.faction_id === selectedId;
          return (
            <button
              className={`faction-card faction-${index + 1} ${selected ? "selected" : ""}`}
              key={faction.faction_id}
              onClick={() => onSelect(faction.faction_id)}
              type="button"
            >
              <span className={`faction-mark ${portrait ? "has-portrait" : ""}`} aria-hidden="true">
                {portrait ? (
                  <Image
                    alt=""
                    fill
                    sizes="46px"
                    src={portrait}
                  />
                ) : factionGlyphs[faction.faction_id] ?? faction.name.slice(0, 1)}
              </span>
              <span className="faction-card-copy">
                <span className="faction-name-row">
                  <strong>{faction.name}</strong>
                  <span className={`control-dot ${faction.controller_mode.toLowerCase()}`} />
                </span>
                <span className="faction-controller">{shortAddress(faction.controller)}</span>
                <span className="faction-stats">
                  <span><b>{faction.influence}</b> influence</span>
                  <span><b>{faction.wealth}</b> wealth</span>
                  <span><b>{faction.legitimacy}</b> legitimacy</span>
                </span>
                {heldOffices.length > 0 ? (
                  <span className="office-ribbon">{heldOffices.map((office) => office.office_id).join(" · ")}</span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
      <div className="rail-legend">
        <span><i className="control-dot human" /> Human</span>
        <span><i className="control-dot ai" /> Consensus AI</span>
      </div>
    </aside>
  );
}
