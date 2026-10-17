import {
  ExecutionResult,
  TransactionStatus,
  transactionResultNumberToName,
  transactionsStatusNumberToName,
} from "genlayer-js/types";

export type FinalityReceipt = {
  consensus_data?: {
    leader_receipt?: Array<{
      execution_result?: string;
      genvm_result?: { error_description?: string };
      mode?: string;
    }>;
  };
  result?: number | string;
  result_name?: string;
  resultName?: string;
  statusName?: string;
  txExecutionResultName?: string;
};

export type TransactionStage = "submitted" | "pending" | "accepted" | "finalized-success" | "finalized-error";
export type TrackedTransaction = {
  error?: string;
  label: string;
  stage: TransactionStage;
  transactionHash: string;
  updatedAt: number;
};

const TRANSACTION_STORAGE_KEY = "loophole:v7:transactions";

function transactionStorage(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

export function readTrackedTransactions(): TrackedTransaction[] {
  try {
    const raw = transactionStorage()?.getItem(TRANSACTION_STORAGE_KEY);
    return raw ? JSON.parse(raw) as TrackedTransaction[] : [];
  } catch {
    return [];
  }
}

export function saveTrackedTransaction(transaction: TrackedTransaction): void {
  const storage = transactionStorage();
  if (!storage) return;
  const existing = readTrackedTransactions().filter((item) => item.transactionHash !== transaction.transactionHash);
  storage.setItem(TRANSACTION_STORAGE_KEY, JSON.stringify([transaction, ...existing].slice(0, 30)));
  window.dispatchEvent(new CustomEvent("loophole:transactions-changed"));
}

export function transactionStageForStatus(status: string | number | undefined): TransactionStage {
  const name = typeof status === "number"
    ? transactionsStatusNumberToName[String(status) as keyof typeof transactionsStatusNumberToName]
    : status;
  // FINALIZED still needs its consensus and leader receipt checked before success is shown.
  if (name === TransactionStatus.FINALIZED) return "pending";
  if (name === TransactionStatus.ACCEPTED || name === TransactionStatus.APPEAL_COMMITTING
    || name === TransactionStatus.APPEAL_REVEALING || name === TransactionStatus.READY_TO_FINALIZE) return "accepted";
  if (name === TransactionStatus.CANCELED) return "finalized-error";
  return "pending";
}

export class TransactionFinalityUncertainError extends Error {
  readonly cause: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "TransactionFinalityUncertainError";
    this.cause = cause;
  }
}

export class FinalizedTransactionFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FinalizedTransactionFailure";
  }
}

export function shouldPreservePendingSecret(error: unknown): boolean {
  return !(error instanceof FinalizedTransactionFailure);
}

export function assertFinalizedTransaction(receipt: FinalityReceipt): void {
  if (receipt.statusName !== TransactionStatus.FINALIZED) {
    throw new TransactionFinalityUncertainError(
      `Transaction finality is still uncertain (status: ${receipt.statusName ?? "unknown"}).`,
    );
  }

  const resultKey = String(receipt.result) as keyof typeof transactionResultNumberToName;
  const consensusResult = receipt.result_name
    ?? receipt.resultName
    ?? transactionResultNumberToName[resultKey];
  if (consensusResult === undefined) {
    throw new TransactionFinalityUncertainError(
      "The transaction is finalized, but its consensus result is not yet available.",
    );
  }
  if (consensusResult !== "AGREE" && consensusResult !== "MAJORITY_AGREE") {
    throw new FinalizedTransactionFailure(
      `GenLayer consensus did not accept the transaction (${consensusResult ?? "unknown result"}).`,
    );
  }
  if (
    receipt.txExecutionResultName !== undefined
    && receipt.txExecutionResultName !== ExecutionResult.FINISHED_WITH_RETURN
  ) {
    throw new FinalizedTransactionFailure(
      `Transaction execution failed (${receipt.txExecutionResultName}).`,
    );
  }

  const leaderReceipts = receipt.consensus_data?.leader_receipt ?? [];
  const leader = leaderReceipts.find((entry) => entry.mode === "leader") ?? leaderReceipts[0];
  if (leader?.execution_result && leader.execution_result !== "SUCCESS") {
    throw new FinalizedTransactionFailure(
      leader.genvm_result?.error_description || `Execution failed: ${leader.execution_result}`,
    );
  }
}
