"use client";

import { useEffect, useState } from "react";

import { transactionExplorerUrl, waitForFinalizedTransaction } from "@/lib/genlayer";
import { readTrackedTransactions, type TrackedTransaction } from "@/lib/transaction";

function stageText(stage: TrackedTransaction["stage"]) {
  if (stage === "accepted") return "Accepted · appeal window open";
  if (stage === "finalized-success") return "Finalized successfully";
  if (stage === "finalized-error") return "Finalized with error";
  return stage === "submitted" ? "Submitted" : "Pending";
}

export function TransactionFeed() {
  const [transactions, setTransactions] = useState<TrackedTransaction[]>([]);

  useEffect(() => {
    const refresh = () => setTransactions(readTrackedTransactions());
    const kickoff = window.setTimeout(() => {
      refresh();
      const unfinished = readTrackedTransactions().filter((item) => !["finalized-success", "finalized-error"].includes(item.stage));
      for (const item of unfinished.slice(0, 5)) {
        void waitForFinalizedTransaction(item.transactionHash, item.label).catch(() => undefined);
      }
    }, 0);
    window.addEventListener("loophole:transactions-changed", refresh);
    return () => {
      window.clearTimeout(kickoff);
      window.removeEventListener("loophole:transactions-changed", refresh);
    };
  }, []);

  if (!transactions.length) return null;
  return <section className="transaction-feed" aria-label="Transaction status" aria-live="polite">
    <div className="transaction-feed-heading"><strong>Recent transactions</strong><span>Status resumes after reload</span></div>
    {transactions.slice(0, 4).map((transaction) => <article key={transaction.transactionHash}>
      <div><strong>{transaction.label}</strong><span>{stageText(transaction.stage)}</span>{transaction.error ? <small>{transaction.error}</small> : null}</div>
      <a href={transactionExplorerUrl(transaction.transactionHash)} rel="noreferrer" target="_blank">View</a>
    </article>)}
  </section>;
}
