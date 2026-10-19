"use client";

import { transactionExplorerUrl } from "@/lib/genlayer";
import { useRecordedProof } from "@/lib/proof";

export function ProofPanel() {
  const proof = useRecordedProof();
  if (!proof) return null;
  return <section className="proof-panel" aria-labelledby="recorded-proof-title">
    <header><div><span className="eyebrow">Separate from live state</span><h2 id="recorded-proof-title">Recorded proof</h2></div><span>Historical transactions</span></header>
    {proof.commit ? <p>Source commit <code>{proof.commit}</code></p> : null}
    <div className="proof-contracts">{Object.entries(proof.contracts ?? {}).map(([name, contract]) => <article key={name}>
      <strong>{name}</strong><code>{contract.address ?? "Address not recorded"}</code>
      {contract.deploy_tx ? <a href={transactionExplorerUrl(contract.deploy_tx)} rel="noreferrer" target="_blank">Deployment transaction</a> : null}
    </article>)}</div>
    <div className="proof-steps">{[...(proof.steps ?? []), ...(proof.observed ?? [])].map((step, index) => <article key={step.id ?? `${step.title}-${index}`}>
      <div><strong>{step.title ?? step.id ?? `Step ${index + 1}`}</strong><span>{step.expected_failure ? `Expected failure · ${step.expected_error_code ?? "recorded error"}` : step.status ?? "Unspecified status"}</span>
        {step.execution_result ? <small>Execution: {step.execution_result}</small> : null}
        {step.consensus_result ? <small>Consensus: {step.consensus_result}</small> : null}</div>
      {step.tx_hash ? <a href={transactionExplorerUrl(step.tx_hash)} rel="noreferrer" target="_blank">Transaction</a> : null}
    </article>)}</div>
  </section>;
}
