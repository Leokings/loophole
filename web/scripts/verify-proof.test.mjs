import { describe, expect, it } from "vitest";
import { assertProofTransactionReceipt } from "./proof-receipt.mjs";

const contract = "0x7E3304b9D21Aa7071697F39Db3743828C39f4681";
const item = { tx_hash: "0xc6d33e2379086a36ca80d1e385120309ee52aaf2f7fd514063ffc31657b5e17a", method: "deploy", contract };

describe("proof deployment receipt verification", () => {
  it("accepts a finalized deployment when txDataDecoded is undefined but the recipient is the proof contract", () => {
    const receipt = { statusName: "FINALIZED", to_address: contract, txDataDecoded: undefined };
    expect(() => assertProofTransactionReceipt(item, receipt)).not.toThrow();
  });

  it("rejects a finalized receipt whose recipient is a different contract", () => {
    const receipt = { statusName: "FINALIZED", to_address: "0x0000000000000000000000000000000000000001", txDataDecoded: undefined };
    expect(() => assertProofTransactionReceipt(item, receipt)).toThrow("is not a deployment");
  });

  it("rejects an unfinalized deployment even when the recipient matches", () => {
    const receipt = { statusName: "ACCEPTED", to_address: contract, txDataDecoded: undefined };
    expect(() => assertProofTransactionReceipt(item, receipt)).toThrow("is not finalized");
  });

  it("rejects a decoded deployment if its reported recipient contradicts the proof address", () => {
    const receipt = { statusName: "FINALIZED", to_address: "0x0000000000000000000000000000000000000001", txDataDecoded: { type: "deploy" } };
    expect(() => assertProofTransactionReceipt(item, receipt)).toThrow("recipient mismatch");
  });

  it("checks the GenVM readable calldata when txDataDecoded is absent for a call", () => {
    const call = { tx_hash: "0xprobe", method: "write_probe", contract };
    const receipt = {
      statusName: "FINALIZED",
      to_address: contract,
      txDataDecoded: undefined,
      data: { calldata: { readable: '{"args":["loophole-v7-probe",]"method":"write_probe"}' } },
    };
    expect(() => assertProofTransactionReceipt(call, receipt)).not.toThrow();
  });

  it("rejects readable calldata that names a different method", () => {
    const call = { tx_hash: "0xprobe", method: "write_probe", contract };
    const receipt = {
      statusName: "FINALIZED",
      to_address: contract,
      txDataDecoded: undefined,
      data: { calldata: { readable: '{"method":"other_method"}' } },
    };
    expect(() => assertProofTransactionReceipt(call, receipt)).toThrow("does not identify write_probe");
  });
});
