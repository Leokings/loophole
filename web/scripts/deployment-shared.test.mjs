import { describe, expect, it } from "vitest";

import { assertSuccessfulReceipt, deployedAddress } from "./deployment-shared.mjs";

const CHECKSUMMED_ADDRESS = "0x83AC7CCD379b054373f04709Fe56D51f9f1af0a7";

describe("deployment receipt verification", () => {
  it("preserves the exact address casing returned by StudioNet", () => {
    expect(deployedAddress({ data: { contract_address: CHECKSUMMED_ADDRESS } }, "contract"))
      .toBe(CHECKSUMMED_ADDRESS);
  });

  it("accepts majority consensus only when leader execution succeeded", () => {
    expect(() => assertSuccessfulReceipt({
      consensus_data: { leader_receipt: [{ execution_result: "SUCCESS", mode: "leader" }] },
      result: 6,
      statusName: "FINALIZED",
    }, "deployment")).not.toThrow();
  });

  it("rejects consensus on a GenVM execution error", () => {
    expect(() => assertSuccessfulReceipt({
      consensus_data: {
        leader_receipt: [{
          execution_result: "ERROR",
          genvm_result: { error_description: "constructor failed" },
          mode: "leader",
        }],
      },
      result: 6,
      statusName: "FINALIZED",
    }, "deployment")).toThrow("deployment execution failed (constructor failed)");
  });
});
