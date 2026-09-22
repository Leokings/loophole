import { createAccount, createClient, generatePrivateKey } from "genlayer-js";
import { studionet, testnetBradbury } from "genlayer-js/chains";
import { TransactionStatus, type CalldataEncodable } from "genlayer-js/types";

import type {
  ActionDraft,
  CourtCase,
  CourtState,
  Crisis,
  Faction,
  GameState,
  Law,
  Office,
  Objective,
  RepublicSnapshot,
  RoundAction,
  RoundSummary,
} from "@/lib/types";
import { assertFinalizedTransaction, type FinalityReceipt } from "@/lib/transaction";
import {
  discoverEthereumProvider,
  ensureWalletNetwork,
  requestWalletAccount,
  type EthereumProvider,
} from "@/lib/wallet";

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

export const republicAddress = process.env.NEXT_PUBLIC_REPUBLIC_ADDRESS ?? "";
export const courtAddress = process.env.NEXT_PUBLIC_COURT_ADDRESS ?? "";
const configuredNetworkValue = process.env.NEXT_PUBLIC_GENLAYER_NETWORK || "testnetBradbury";
if (configuredNetworkValue !== "studionet" && configuredNetworkValue !== "testnetBradbury") {
  throw new Error("NEXT_PUBLIC_GENLAYER_NETWORK must be studionet or testnetBradbury");
}
const configuredNetwork: "studionet" | "testnetBradbury" = configuredNetworkValue;
const selectedChain = configuredNetwork === "studionet" ? studionet : testnetBradbury;
const rpcUrl = process.env.NEXT_PUBLIC_GENLAYER_RPC_URL || selectedChain.rpcUrls.default.http[0];

export const networkLabel = configuredNetwork === "studionet" ? "StudioNet accepted" : "Bradbury accepted";

export const hasLiveRepublic = ADDRESS_PATTERN.test(republicAddress);
export const hasLiveCourt = ADDRESS_PATTERN.test(courtAddress);

type HexAddress = `0x${string}`;
type ClientConfig = NonNullable<Parameters<typeof createClient>[0]>;
type ClientAccount = ClientConfig["account"];
type SdkEthereumProvider = NonNullable<ClientConfig["provider"]>;
type TransactionHash = Parameters<ReturnType<typeof createClient>["waitForTransactionReceipt"]>[0]["hash"];

export type WalletKind = "browser" | "studio";
export type ConnectedWallet = { address: string; kind: WalletKind };

const STUDIO_SESSION_KEY = "loophole:v1:studio-session-private-key";
let activeBrowserProvider: EthereumProvider | undefined;

declare global {
  interface Window {
    ethereum?: SdkEthereumProvider;
  }
}

function clientFor(account?: ClientAccount, provider?: EthereumProvider) {
  return createClient({
    account,
    chain: selectedChain,
    endpoint: rpcUrl,
    provider: provider as SdkEthereumProvider | undefined,
  });
}

function walletNetwork() {
  return {
    blockExplorerUrl: selectedChain.blockExplorers?.default.url,
    chainId: selectedChain.id,
    chainName: selectedChain.name,
    currencyDecimals: selectedChain.nativeCurrency.decimals,
    currencyName: selectedChain.nativeCurrency.name,
    currencySymbol: selectedChain.nativeCurrency.symbol,
    rpcUrl,
  };
}

function readStudioSessionAccount(address?: string) {
  if (typeof window === "undefined") return undefined;
  try {
    const privateKey = window.sessionStorage.getItem(STUDIO_SESSION_KEY);
    if (!privateKey || !/^0x[a-fA-F0-9]{64}$/.test(privateKey)) return undefined;
    const account = createAccount(privateKey as `0x${string}`);
    if (address && account.address.toLowerCase() !== address.toLowerCase()) return undefined;
    return account;
  } catch {
    return undefined;
  }
}

async function writeClientFor(address: string) {
  const sessionAccount = readStudioSessionAccount(address);
  if (sessionAccount) return clientFor(sessionAccount);

  if (typeof window === "undefined") throw new Error("Signed writes are only available in the browser.");
  const provider = activeBrowserProvider ?? await discoverEthereumProvider(window);
  if (!provider) throw new Error("Reconnect a browser wallet before submitting a signed action.");
  await ensureWalletNetwork(provider, walletNetwork());
  activeBrowserProvider = provider;
  return clientFor(address as HexAddress, provider);
}

function serializable<T>(value: unknown): T {
  return JSON.parse(
    JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? Number(item) : item)),
  ) as T;
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function read(address: string, functionName: string, args: unknown[] = []) {
  return clientFor().readContract({
    address: address as HexAddress,
    args: args as CalldataEncodable[],
    functionName,
  });
}

export async function connectWallet(kind: WalletKind): Promise<ConnectedWallet> {
  if (typeof window === "undefined") throw new Error("Wallet connection is only available in the browser.");

  if (kind === "studio") {
    if (configuredNetwork !== "studionet") {
      throw new Error("The temporary review wallet is available only on gasless GenLayer StudioNet.");
    }
    let account = readStudioSessionAccount();
    if (!account) {
      const privateKey = generatePrivateKey();
      window.sessionStorage.setItem(STUDIO_SESSION_KEY, privateKey);
      account = createAccount(privateKey);
    }
    return { address: account.address.toLowerCase(), kind };
  }

  const provider = await discoverEthereumProvider(window);
  if (!provider) {
    throw new Error("No injected wallet was detected. Use MetaMask in desktop Chrome/Edge, or choose the temporary Studio wallet.");
  }
  const address = await requestWalletAccount(provider);
  await ensureWalletNetwork(provider, walletNetwork());
  activeBrowserProvider = provider;
  return { address, kind };
}

export function restoreStudioWallet(): ConnectedWallet | null {
  if (configuredNetwork !== "studionet") return null;
  const account = readStudioSessionAccount();
  return account ? { address: account.address.toLowerCase(), kind: "studio" } : null;
}

export async function writeRepublic(
  account: string,
  functionName: string,
  args: unknown[] = [],
): Promise<string> {
  if (!hasLiveRepublic) throw new Error("No live republic contract is configured.");
  const client = await writeClientFor(account);
  const hash = await client.writeContract({
    address: republicAddress as HexAddress,
    args: args as CalldataEncodable[],
    functionName,
    value: 0n,
  });
  return String(hash);
}

export async function writeCourt(
  account: string,
  functionName: string,
  args: unknown[] = [],
): Promise<string> {
  if (!hasLiveCourt) throw new Error("No live court contract is configured.");
  const client = await writeClientFor(account);
  const hash = await client.writeContract({
    address: courtAddress as HexAddress,
    args: args as CalldataEncodable[],
    functionName,
    value: 0n,
  });
  return String(hash);
}

export async function waitForFinalizedTransaction(hash: string): Promise<void> {
  const receipt = await clientFor().waitForTransactionReceipt({
    hash: hash as TransactionHash,
    interval: 3_000,
    retries: 240,
    status: TransactionStatus.FINALIZED,
  }) as unknown as FinalityReceipt;
  assertFinalizedTransaction(receipt);
}

export function transactionExplorerUrl(hash: string): string {
  const base = selectedChain.blockExplorers?.default.url;
  return base ? `${base.replace(/\/$/, "")}/tx/${hash}` : "";
}

export function createNonce(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function previewActionCommitment(draft: ActionDraft, nonce: string): Promise<string> {
  const result = await read(republicAddress, "preview_action_commitment", [
    draft.faction_id,
    draft.action_type,
    draft.target_faction_id,
    draft.target_law_id,
    draft.law_title,
    draft.law_text,
    draft.rationale,
    nonce,
  ]);
  return String(result);
}

export async function previewObjectiveCommitment(
  factionId: string,
  objectiveType: string,
  targetFactionId: string,
  nonce: string,
): Promise<string> {
  const result = await read(republicAddress, "preview_objective_commitment", [
    factionId,
    objectiveType,
    targetFactionId,
    nonce,
  ]);
  return String(result);
}

async function readCourtCases(state: CourtState): Promise<CourtCase[]> {
  const first = Math.max(1, state.case_count - 3);
  const requests: Array<Promise<unknown>> = [];
  for (let id = state.case_count; id >= first; id -= 1) {
    requests.push(read(courtAddress, "get_case", [id]));
  }
  return serializable<CourtCase[]>(await Promise.all(requests));
}

export async function readRepublicSnapshot(): Promise<RepublicSnapshot> {
  if (!hasLiveRepublic) throw new Error("No live republic contract is configured.");
  const game = serializable<GameState>(await read(republicAddress, "get_game"));
  const firstLaw = Math.max(1, game.law_count - 3);
  const lawRequests: Array<Promise<unknown>> = [];
  for (let id = game.law_count; id >= firstLaw; id -= 1) {
    lawRequests.push(read(republicAddress, "get_law", [id]));
  }

  const factionsPromise = read(republicAddress, "get_factions_json");
  const officesPromise = read(republicAddress, "get_offices_json");
  const summaryPromise = game.round_number > 1
    ? read(republicAddress, "get_round_summary", [game.round_number - 1])
    : Promise.resolve(null);
  const crisisPromise = game.active_crisis_id > 0
    ? read(republicAddress, "get_crisis", [game.active_crisis_id])
    : Promise.resolve(null);
  const courtPromise = hasLiveCourt ? read(courtAddress, "get_court") : Promise.resolve(null);

  const [factionsRaw, officesRaw, summaryRaw, crisisRaw, courtRaw, lawsRaw] = await Promise.all([
    factionsPromise,
    officesPromise,
    summaryPromise,
    crisisPromise,
    courtPromise,
    Promise.all(lawRequests),
  ]);

  const court = courtRaw ? serializable<CourtState>(courtRaw) : null;
  const factions = parseJson<Faction[]>(factionsRaw, []);
  const objectiveRequests = factions.map((faction) =>
    read(republicAddress, "get_objective", [faction.faction_id]),
  );
  const currentActionRequests = factions.map((faction) =>
    read(republicAddress, "get_round_action", [game.round_number, faction.faction_id])
      .then((action) => serializable<RoundAction>(action))
      .catch(() => null),
  );
  const crisisRecord = crisisRaw ? serializable<Crisis & { responses_json?: string }>(crisisRaw) : null;
  const crisis = crisisRecord
    ? { ...crisisRecord, responses: parseJson(crisisRecord.responses_json, []) }
    : null;

  return {
    cases: court ? await readCourtCases(court) : [],
    court,
    crisis,
    current_actions: (await Promise.all(currentActionRequests)).filter(
      (action): action is RoundAction => action !== null,
    ),
    factions,
    game,
    laws: serializable<Law[]>(lawsRaw),
    offices: parseJson<Office[]>(officesRaw, []),
    objectives: serializable<Objective[]>(await Promise.all(objectiveRequests)),
    summary: summaryRaw ? parseJson<RoundSummary | null>(summaryRaw, null) : null,
  };
}
