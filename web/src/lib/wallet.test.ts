import { describe, expect, it, vi } from "vitest";

import { ensureWalletNetwork, requestWalletAccount, walletErrorMessage } from "./wallet";

describe("wallet connection", () => {
  it("uses the existing GenLayer network without prompting", async () => {
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_chainId") return "0xf22f";
      throw new Error(`Unexpected method: ${method}`);
    });

    await ensureWalletNetwork({ request }, {
      chainId: 61999,
      chainName: "GenLayer StudioNet",
      currencyDecimals: 18,
      currencyName: "GEN",
      currencySymbol: "GEN",
      rpcUrl: "https://studio.genlayer.com/api",
    });

    expect(request).toHaveBeenCalledTimes(1);
  });

  it("adds an unknown network and then switches to it", async () => {
    const methods: string[] = [];
    const request = vi.fn(async ({ method }: { method: string }) => {
      methods.push(method);
      if (method === "eth_chainId") return "0x1";
      if (method === "wallet_switchEthereumChain" && methods.filter((item) => item === method).length === 1) {
        throw Object.assign(new Error("Unknown chain"), { code: 4902 });
      }
      return null;
    });

    await ensureWalletNetwork({ request }, {
      blockExplorerUrl: "https://explorer-studio.genlayer.com",
      chainId: 61999,
      chainName: "GenLayer StudioNet",
      currencyDecimals: 18,
      currencyName: "GEN",
      currencySymbol: "GEN",
      rpcUrl: "https://studio.genlayer.com/api",
    });

    expect(methods).toEqual([
      "eth_chainId",
      "wallet_switchEthereumChain",
      "wallet_addEthereumChain",
      "wallet_switchEthereumChain",
    ]);
  });

  it("normalizes a valid account and rejects malformed responses", async () => {
    const address = "0xAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    await expect(requestWalletAccount({ request: async () => [address] })).resolves.toBe(address.toLowerCase());
    await expect(requestWalletAccount({ request: async () => [] })).rejects.toThrow("did not return an account");
    await expect(requestWalletAccount({ request: async () => ["not-an-address"] })).rejects.toThrow("invalid account");
  });

  it("turns common provider failures into actionable messages", () => {
    expect(walletErrorMessage({ code: 4001 })).toContain("declined");
    expect(walletErrorMessage({ code: -32002 })).toContain("already open");
  });
});
