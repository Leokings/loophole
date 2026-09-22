import { describe, expect, it } from "vitest";
import { TransactionStatus } from "genlayer-js/types";

import { assertFinalizedTransaction } from "./transaction";

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
});
