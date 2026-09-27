import {
  ExecutionResult,
  TransactionStatus,
  transactionResultNumberToName,
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
