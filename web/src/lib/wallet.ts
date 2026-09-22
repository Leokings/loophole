export type EthereumProvider = {
  request: (request: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
};

export type WalletNetwork = {
  blockExplorerUrl?: string;
  chainId: number;
  chainName: string;
  currencyDecimals: number;
  currencyName: string;
  currencySymbol: string;
  rpcUrl: string;
};

type ProviderWindow = Window & {
  ethereum?: EthereumProvider;
};

type ProviderAnnouncement = CustomEvent<{
  info?: { name?: string; rdns?: string };
  provider?: EthereumProvider;
}>;

function errorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  return Number((error as { code?: unknown }).code);
}

export function walletErrorMessage(error: unknown): string {
  const code = errorCode(error);
  if (code === 4001) return "The wallet request was declined. Approve it to continue.";
  if (code === -32002) return "A wallet request is already open. Finish it in your wallet, then try again.";
  if (error instanceof Error && error.message.trim()) return error.message;
  return "The browser wallet could not connect.";
}

export async function ensureWalletNetwork(
  provider: EthereumProvider,
  network: WalletNetwork,
): Promise<void> {
  const expectedChainId = `0x${network.chainId.toString(16)}`;
  const currentChainId = await provider.request({ method: "eth_chainId" });
  if (String(currentChainId).toLowerCase() === expectedChainId) return;

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: expectedChainId }],
    });
    return;
  } catch (error) {
    if (errorCode(error) !== 4902) throw error;
  }

  await provider.request({
    method: "wallet_addEthereumChain",
    params: [{
      blockExplorerUrls: network.blockExplorerUrl ? [network.blockExplorerUrl] : undefined,
      chainId: expectedChainId,
      chainName: network.chainName,
      nativeCurrency: {
        decimals: network.currencyDecimals,
        name: network.currencyName,
        symbol: network.currencySymbol,
      },
      rpcUrls: [network.rpcUrl],
    }],
  });
  await provider.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: expectedChainId }],
  });
}

export async function requestWalletAccount(provider: EthereumProvider): Promise<string> {
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  if (!Array.isArray(accounts) || typeof accounts[0] !== "string") {
    throw new Error("The wallet did not return an account.");
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(accounts[0])) {
    throw new Error("The wallet returned an invalid account address.");
  }
  return accounts[0].toLowerCase();
}

export async function discoverEthereumProvider(
  targetWindow: ProviderWindow,
  settleMs = 150,
): Promise<EthereumProvider | undefined> {
  const announced: Array<{ name: string; provider: EthereumProvider }> = [];
  const onAnnouncement = (event: Event) => {
    const detail = (event as ProviderAnnouncement).detail;
    if (!detail?.provider) return;
    announced.push({ name: detail.info?.name ?? detail.info?.rdns ?? "", provider: detail.provider });
  };

  targetWindow.addEventListener("eip6963:announceProvider", onAnnouncement);
  targetWindow.dispatchEvent(new Event("eip6963:requestProvider"));
  await new Promise((resolve) => targetWindow.setTimeout(resolve, settleMs));
  targetWindow.removeEventListener("eip6963:announceProvider", onAnnouncement);

  const preferred = announced.find((entry) => /metamask/i.test(entry.name));
  return preferred?.provider ?? announced[0]?.provider ?? targetWindow.ethereum;
}
