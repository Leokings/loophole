import { describe, expect, it } from "vitest";
import { TransactionStatus } from "genlayer-js/types";

import {
  assertFinalizedTransaction,
  FinalizedTransactionFailure,
  shouldPreservePendingSecret,
  TransactionFinalityUncertainError,
} from "./transaction";

describe("transaction finality", () => {
  it("accepts finalized consensus with successful execution", () => {
    expect(() => assertFinalizedTransaction({
      consensus_data: { leader_receipt: [{ execution_result: "SUCCESS", mode: "leader" }] },
      result_name: "MAJORITY_AGREE",
      statusName: TransactionStatus.FINALIZED,
    })).not.toThrow();
  });

  it("rejects a finalized transaction that consensus did not accept", () => {
    expect(() => assertFinalizedTransaction({
      result_name: "MAJORITY_DISAGREE",
      statusName: TransactionStatus.FINALIZED,
    })).toThrow("consensus did not accept");
  });

  it("surfaces a failed leader execution", () => {
    expect(() => assertFinalizedTransaction({
      consensus_data: {
        leader_receipt: [{
          execution_result: "ERROR",
          genvm_result: { error_description: "Faction is already controlled" },
          mode: "leader",
        }],
      },
      result_name: "AGREE",
      statusName: TransactionStatus.FINALIZED,
    })).toThrow("Faction is already controlled");
  });

  it("distinguishes definitive failure from uncertain polling for secret retention", () => {
    const definitive = new FinalizedTransactionFailure("execution reverted");
    const uncertain = new TransactionFinalityUncertainError("rpc timed out");

    expect(shouldPreservePendingSecret(definitive)).toBe(false);
    expect(shouldPreservePendingSecret(uncertain)).toBe(true);
    expect(shouldPreservePendingSecret(new Error("network disconnected"))).toBe(true);
  });

  it("treats a non-final receipt as uncertain instead of deleting a commit secret", () => {
    expect(() => assertFinalizedTransaction({ statusName: "ACCEPTED" })).toThrow(
      TransactionFinalityUncertainError,
    );
  });

  it("preserves the secret when a finalized receipt is missing consensus data", () => {
    expect(() => assertFinalizedTransaction({ statusName: TransactionStatus.FINALIZED })).toThrow(
      TransactionFinalityUncertainError,
    );
  });
});
