import { createAccount, createClient, generatePrivateKey } from "genlayer-js";
import { studionet, testnetBradbury } from "genlayer-js/chains";
import { TransactionStatus, type CalldataEncodable } from "genlayer-js/types";

import type {
  ActionDraft,
  RepublicSnapshot,
} from "@/lib/types";
import { readBoundedRepublicSnapshot } from "@/lib/snapshot";
import { republicSlotSeconds } from "@/lib/heartbeat";
import {
  assertFinalizedTransaction,
  FinalizedTransactionFailure,
  saveTrackedTransaction,
  TransactionFinalityUncertainError,
  transactionStageForStatus,
  type TrackedTransaction,
  type FinalityReceipt,
} from "@/lib/transaction";
import {
  discoverEthereumProvider,
  ensureWalletNetwork,
  requestWalletAccount,
  type EthereumProvider,
} from "@/lib/wallet";

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

export const republicAddress = process.env.NEXT_PUBLIC_REPUBLIC_ADDRESS ?? "";
export const courtAddress = process.env.NEXT_PUBLIC_COURT_ADDRESS ?? "";
export const caseLawAddress = process.env.NEXT_PUBLIC_CASELAW_ADDRESS ?? "";
const configuredNetworkValue = process.env.NEXT_PUBLIC_GENLAYER_NETWORK || "testnetBradbury";
if (configuredNetworkValue !== "studionet" && configuredNetworkValue !== "testnetBradbury") {
  throw new Error("NEXT_PUBLIC_GENLAYER_NETWORK must be studionet or testnetBradbury");
}
const configuredNetwork: "studionet" | "testnetBradbury" = configuredNetworkValue;
const selectedChain = configuredNetwork === "studionet" ? studionet : testnetBradbury;
const rpcUrl = process.env.NEXT_PUBLIC_GENLAYER_RPC_URL || selectedChain.rpcUrls.default.http[0];

export const networkLabel = configuredNetwork === "studionet" ? "StudioNet accepted" : "Bradbury accepted";
export const keeperSlotSeconds = republicSlotSeconds(
  configuredNetwork,
  process.env.NEXT_PUBLIC_LOOPHOLE_KEEPER_SLOT_SECONDS,
);

export const hasLiveRepublic = ADDRESS_PATTERN.test(republicAddress);
export const hasLiveCourt = ADDRESS_PATTERN.test(courtAddress);
export const hasLiveCaseLaw = ADDRESS_PATTERN.test(caseLawAddress);

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

export async function writeCaseLaw(account: string, functionName: string, args: unknown[] = []): Promise<string> {
  if (!hasLiveCaseLaw) throw new Error("No live CaseLaw contract is configured.");
  const client = await writeClientFor(account);
  const hash = await client.writeContract({
    address: caseLawAddress as HexAddress,
    args: args as CalldataEncodable[],
    functionName,
    value: 0n,
  });
  return String(hash);
}

export async function runKeeperOp(
  account: string,
  op: { args: unknown[]; contract: "republic" | "court"; method: string },
  snapshot: RepublicSnapshot,
): Promise<string> {
  const status = op.contract === "republic" ? snapshot.keeperStatus.republic : snapshot.keeperStatus.court;
  if (!status?.ops.some((candidate) => candidate.method === op.method
    && JSON.stringify(candidate.args) === JSON.stringify(op.args))) {
    throw new Error("That permissionless operation is not currently listed by the contract.");
  }
  const allowed = op.contract === "republic"
    ? new Set(["finalize_season", "close_crisis", "judge_crisis_response", "certify_law", "open_crisis", "advance_round", "advance_round_fallback"])
    : new Set(["expire_case", "resolve_case", "resolve_stayed_case", "recover_case_effects"]);
  if (!allowed.has(op.method)) throw new Error("This operation is not available from the public keeper status.");
  return op.contract === "republic"
    ? writeRepublic(account, op.method, op.args)
    : writeCourt(account, op.method, op.args);
}

const activeFinalityPolls = new Map<string, Promise<void>>();

export function waitForFinalizedTransaction(
  hash: string,
  label = "Transaction",
  onStatus?: (transaction: TrackedTransaction) => void,
): Promise<void> {
  const active = activeFinalityPolls.get(hash);
  if (active) return active;
  const polling = pollUntilFinalized(hash, label, onStatus);
  activeFinalityPolls.set(hash, polling);
  void polling.then(() => activeFinalityPolls.delete(hash), () => activeFinalityPolls.delete(hash));
  return polling;
}

async function pollUntilFinalized(hash: string, label: string, onStatus?: (transaction: TrackedTransaction) => void) {
  const transactionHash = hash as TransactionHash;
  let lastStage: TrackedTransaction["stage"] = "submitted";
  let transaction: TrackedTransaction = { label, stage: lastStage, transactionHash: hash, updatedAt: Date.now() };
  saveTrackedTransaction(transaction);
  onStatus?.(transaction);
  const client = clientFor();
  for (let attempt = 0; attempt < 240; attempt += 1) {
    try {
      const receipt = await client.getTransaction({ hash: transactionHash });
      const stage = transactionStageForStatus(receipt.statusName ?? receipt.status);
      if (stage !== lastStage) {
        lastStage = stage;
        transaction = { ...transaction, stage, updatedAt: Date.now() };
        saveTrackedTransaction(transaction);
        onStatus?.(transaction);
      }
      if (receipt.statusName === TransactionStatus.FINALIZED || receipt.status === TransactionStatus.FINALIZED) {
        try {
          assertFinalizedTransaction(receipt as unknown as FinalityReceipt);
          transaction = { ...transaction, stage: "finalized-success", updatedAt: Date.now() };
          saveTrackedTransaction(transaction);
          onStatus?.(transaction);
          return;
        } catch (cause) {
          if (cause instanceof TransactionFinalityUncertainError) throw cause;
          const message = cause instanceof Error ? cause.message : "The finalized transaction failed.";
          transaction = { ...transaction, error: message, stage: "finalized-error", updatedAt: Date.now() };
          saveTrackedTransaction(transaction);
          onStatus?.(transaction);
          throw cause;
        }
      }
      if (receipt.statusName === TransactionStatus.CANCELED || receipt.status === TransactionStatus.CANCELED) {
        const message = "GenLayer cancelled this transaction.";
        transaction = { ...transaction, error: message, stage: "finalized-error", updatedAt: Date.now() };
        saveTrackedTransaction(transaction);
        onStatus?.(transaction);
        throw new Error(message);
      }
    } catch (cause) {
      if (cause instanceof FinalizedTransactionFailure) throw cause;
      if (cause instanceof Error && cause.message === "GenLayer cancelled this transaction.") throw cause;
      if (cause instanceof TransactionFinalityUncertainError) throw cause;
      // Transient RPC errors are retried at the same five-second cadence as status reads.
    }
    await new Promise((resolve) => window.setTimeout(resolve, 5_000));
  }
  throw new TransactionFinalityUncertainError(
    "Finality is still pending after 20 minutes. This transaction remains saved and will resume checking after a reload.",
  );
}

export function transactionExplorerUrl(hash: string): string {
  const base = selectedChain.blockExplorers?.default.url;
  return base ? `${base.replace(/\/$/, "")}/tx/${hash}` : "";
}

export function contractExplorerUrl(address: string): string {
  const base = selectedChain.blockExplorers?.default.url;
  return base && ADDRESS_PATTERN.test(address) ? `${base.replace(/\/$/, "")}/address/${address}` : "";
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
    JSON.stringify(draft.stances ?? []),
    nonce,
  ]);
  return String(result);
}

export async function fileCase(
  account: string,
  input: { actionRound: number; claim: string; defendantFactionId: string; lawId: number; plaintiffFactionId: string; reference: string },
) {
  return writeCourt(account, "file_case", [input.reference, input.plaintiffFactionId, input.defendantFactionId,
    input.actionRound, input.lawId, input.claim]);
}

export async function submitBrief(account: string, caseId: number, factionId: string, brief: string) {
  return writeCourt(account, "submit_brief", [caseId, factionId, brief]);
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

export async function readRepublicSnapshot(): Promise<RepublicSnapshot> {
  if (!hasLiveRepublic) throw new Error("No live republic contract is configured.");
  return readBoundedRepublicSnapshot(read, {
    republic: republicAddress,
    court: hasLiveCourt ? courtAddress : undefined,
    caseLaw: hasLiveCaseLaw ? caseLawAddress : undefined,
  });
}
