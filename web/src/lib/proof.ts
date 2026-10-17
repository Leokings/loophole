"use client";

import { useEffect, useState } from "react";

export type RecordedCaseLinks = { filing_tx?: string; ruling_tx?: string };
export type ProofStep = {
  args?: unknown[]; case_id?: number; consensus_result?: string; contract?: string; execution_result?: string;
  expected_error_code?: string; expected_failure?: boolean; id?: string; method?: string; readback?: unknown;
  status?: string; title?: string; tx_hash?: string;
};
export type ProofRecord = {
  cases?: Record<string, RecordedCaseLinks>;
  commit?: string;
  contracts?: Record<string, { address?: string; deploy_tx?: string; source_sha256?: string }>;
  observed?: ProofStep[];
  steps?: ProofStep[];
};

export function useRecordedProof() {
  const [proof, setProof] = useState<ProofRecord | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/proof.json", { cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<ProofRecord> : null)
      .then((record) => { if (record && typeof record === "object") setProof(record); })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  return proof;
}
