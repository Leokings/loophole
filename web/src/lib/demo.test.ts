import { describe, expect, it } from "vitest";

import { demoSnapshot } from "./demo";

describe("demo fixture", () => {
  it("demo fixture obeys contract invariants", () => {
    const classes = new Set(["NONE", "LAW", "LAW_SPONSOR", "OFFICEHOLDER", "OTHER_FACTION"]);
    const lawsById = new Map(demoSnapshot.lawHistory.map((law) => [law.law_id, law]));
    const casesById = new Map(demoSnapshot.cases.map((item) => [item.case_id, item]));
    const holdingByKey = new Map(demoSnapshot.holdings.map((holding) => [holding.key, holding]));

    for (const item of demoSnapshot.cases) {
      expect(item.key).toBe(`${item.law_id}|${JSON.parse(item.evidence_json).action.action_type}|${item.target_class}`);
      expect(classes.has(item.target_class)).toBe(true);
      const citedLaw = lawsById.get(item.law_id);
      expect(citedLaw).toBeDefined();
      expect(citedLaw!.effective_from_round).toBeLessThanOrEqual(item.action_round);
      expect(citedLaw!.effective_until_round === 0 || citedLaw!.effective_until_round >= item.action_round).toBe(true);
      if (item.status === "SUMMARY") {
        const holding = holdingByKey.get(item.key);
        expect(holding).toBeDefined();
        expect(item.holding_case_id).toBe(holding!.case_id);
        expect(casesById.get(holding!.case_id)?.key).toBe(item.key);
      }
      if (item.status === "STAYED") expect(holdingByKey.has(item.key)).toBe(false);
      if (item.rule_text) {
        const origin = item.holding_case_id;
        expect(item.rule_text).toBe(`Under law #${item.law_id}, ${JSON.parse(item.evidence_json).action.action_type} against ${item.target_class} is ${item.label} (case ${origin}).`);
      }
    }
    for (const holding of demoSnapshot.holdings) {
      const origin = casesById.get(holding.case_id);
      expect(origin?.status).toBe("DECIDED");
      expect(origin?.key).toBe(holding.key);
    }
    for (const item of demoSnapshot.cases.filter((candidate) => candidate.status === "SUMMARY")) {
      expect(demoSnapshot.holdings.some((holding) => holding.key === item.key && holding.case_id === item.holding_case_id)).toBe(true);
    }
    for (const item of demoSnapshot.lawHistory.filter((candidate) => candidate.status === "SUPERSEDED")) {
      expect(item.effective_until_round).toBeGreaterThan(0);
    }
    expect(demoSnapshot.cases.some((item) => item.status === "EXPIRED")).toBe(true);
    expect(demoSnapshot.cases.some((item) => item.status === "STAYED")).toBe(true);
    expect(demoSnapshot.cases.some((item) => item.status === "BRIEFING")).toBe(true);
  });
});
