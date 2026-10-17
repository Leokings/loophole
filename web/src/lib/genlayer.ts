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
import { republicSlotSeconds } from "@/lib/heartbeat";
import {
  assertFinalizedTransaction,
  TransactionFinalityUncertainError,
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

export async function waitForFinalizedTransaction(hash: string): Promise<void> {
  let receipt: FinalityReceipt;
  try {
    receipt = await clientFor().waitForTransactionReceipt({
      hash: hash as TransactionHash,
      interval: 5_000,
      retries: 240,
      status: TransactionStatus.FINALIZED,
    }) as unknown as FinalityReceipt;
  } catch (cause) {
    throw new TransactionFinalityUncertainError(
      "Finality polling was interrupted. The transaction may still finalize; its local secret has been preserved.",
      cause,
    );
  }
  assertFinalizedTransaction(receipt);
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

async function readCourtCases(state: CourtState): Promise<CourtCase[]> {
  const openIds = hasLiveCourt ? serializable<number[]>(await read(courtAddress, "get_open_case_ids", [64])) : [];
  const recentIds: number[] = [];
  for (let id = state.case_count; id >= Math.max(1, state.case_count - 79); id -= 1) recentIds.push(id);
  const ids = [...new Set([...openIds, ...recentIds])].sort((a, b) => b - a);
  const cases = await Promise.all(ids.map(async (id) => {
    try {
      return serializable<CourtCase>(await read(courtAddress, "get_case", [id]));
    } catch {
      return null;
    }
  }));
  const openSet = new Set(openIds);
  const retained = cases.filter((item): item is CourtCase => item !== null);
  const open = retained.filter((item) => openSet.has(item.case_id));
  const terminal = retained.filter((item) => !openSet.has(item.case_id)
    && ["DECIDED", "SUMMARY", "EXPIRED"].includes(item.status)).slice(0, 20);
  return [...open, ...terminal].sort((a, b) => b.case_id - a.case_id);
}

export async function readRepublicSnapshot(): Promise<RepublicSnapshot> {
  if (!hasLiveRepublic) throw new Error("No live republic contract is configured.");
  const game = serializable<GameState>(await read(republicAddress, "get_game"));
  const lawRequests: Array<Promise<unknown>> = [];
  for (let id = 1; id <= game.law_count; id += 1) {
    lawRequests.push(read(republicAddress, "get_law", [id]).catch(() => null));
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
  const republicKeeperPromise = read(republicAddress, "get_keeper_status").catch(() => ({ now: 0, phase: game.phase, ops: [] }));
  const republicStatsPromise = read(republicAddress, "get_storage_stats").catch(() => ({}));
  const courtKeeperPromise = hasLiveCourt ? read(courtAddress, "get_keeper_status").catch(() => ({ now: 0, ops: [] })) : Promise.resolve(null);
  const courtStatsPromise = hasLiveCourt ? read(courtAddress, "get_storage_stats").catch(() => ({})) : Promise.resolve(null);
  const registryPromise = hasLiveCaseLaw ? read(caseLawAddress, "get_registry_summary").catch(() => null) : Promise.resolve(null);

  const [factionsRaw, officesRaw, summaryRaw, crisisRaw, courtRaw, lawsRaw, republicKeeperRaw, republicStatsRaw, courtKeeperRaw, courtStatsRaw, registryRaw] = await Promise.all([
    factionsPromise,
    officesPromise,
    summaryPromise,
    crisisPromise,
    courtPromise,
    Promise.all(lawRequests),
    republicKeeperPromise,
    republicStatsPromise,
    courtKeeperPromise,
    courtStatsPromise,
    registryPromise,
  ]);

  const court = courtRaw ? serializable<CourtState>(courtRaw) : null;
  const factions = parseJson<Faction[]>(factionsRaw, []);
  const objectiveRequests = factions.map((faction) =>
    read(republicAddress, "get_objective", [faction.faction_id]),
  );
  const currentActionRequests = factions.map((faction) =>
    read(republicAddress, "get_round_action", [game.round_number, faction.faction_id])
      .then((action) => serializable<RoundAction>(action)).catch(() => null));
  const crisisRecord = crisisRaw ? serializable<Crisis & { responses_json?: string }>(crisisRaw) : null;
  const crisis = crisisRecord ? (() => {
    const responses = parseJson<Array<{ faction_id: string; response: string; judgment?: string; quote?: string }>>(crisisRecord.responses_json, []);
    const finalJudgment = parseJson<{ labels?: Record<string, string>; quotes?: Record<string, string> }>(crisisRecord.resolution_json, {});
    return {
      ...crisisRecord,
      severity_source: "CODE_DERIVED",
      outcome: crisisRecord.outcome || "",
      responses: responses.map((item) => {
        let judgment = item.judgment ?? "";
        let quote = item.quote ?? "";
        if (judgment.startsWith("{")) {
          const parsed = parseJson<{ label?: string; quote?: string }>(judgment, {});
          judgment = parsed.label ?? "INSUFFICIENT";
          quote = parsed.quote ?? "";
        }
        return { ...item, judgment: finalJudgment.labels?.[item.faction_id] ?? judgment, quote: finalJudgment.quotes?.[item.faction_id] ?? quote };
      }),
    };
  })() : null;

  const lawHistory = serializable<Array<Law | null>>(lawsRaw).filter((law): law is Law => law !== null);
  const laws = lawHistory.filter((law) => ["ENACTED", "PENDING"].includes(law.status));
  const holdingLawIds = lawHistory.map((law) => law.law_id);
  const holdings = hasLiveCaseLaw ? (await Promise.all(Array.from({ length: Math.ceil(holdingLawIds.length / 16) }, (_, index) =>
    read(caseLawAddress, "get_holdings_for_laws", [JSON.stringify(holdingLawIds.slice(index * 16, index * 16 + 16))]).catch(() => []))))
    .flatMap((result) => serializable<RepublicSnapshot["holdings"]>(result)) : [];
  const lawById = new Map(lawHistory.map((law) => [law.law_id, law]));
  const cases = court ? await readCourtCases(court) : [];
  const settledCases = cases.filter((item) => ["DECIDED", "SUMMARY"].includes(item.status));
  const effects = await Promise.all(settledCases.map(async (item) => {
    const [outcome, holding] = await Promise.all([
      read(republicAddress, "get_case_outcome", [item.case_id]).then(String).catch(() => ""),
      item.label === "UNCLEAR" ? Promise.resolve({}) : read(courtAddress, "get_holding_for_case", [item.case_id]).catch(() => ({})),
    ]);
    return [item.case_id, { outcome, holding: serializable<Record<string, unknown>>(holding) }] as const;
  }));
  const effectByCase = new Map(effects);
  const enrichedCases = cases.map((item) => {
    const caseEffects = effectByCase.get(item.case_id);
    const holdingMissing = item.label !== "UNCLEAR" && ["DECIDED", "SUMMARY"].includes(item.status)
      && !caseEffects?.holding?.key;
    const outcomeMissing = item.verdict !== "AMBIGUOUS" && ["DECIDED", "SUMMARY"].includes(item.status)
      && !caseEffects?.outcome;
    const effectsPending: CourtCase["effectsPending"] = holdingMissing && outcomeMissing ? "holding and outcome"
      : holdingMissing ? "holding" : outcomeMissing ? "outcome" : undefined;
    return { ...item, law_text: lawById.get(item.law_id)?.text ?? "", law_title: lawById.get(item.law_id)?.title ?? "", effectsPending };
  });
  const keeperStatus: RepublicSnapshot["keeperStatus"] = {
    republic: serializable(republicKeeperRaw),
    court: courtKeeperRaw ? serializable(courtKeeperRaw) : null,
  };
  const storageStats: RepublicSnapshot["storageStats"] = {
    republic: serializable(republicStatsRaw),
    court: courtStatsRaw ? serializable(courtStatsRaw) : null,
  };
  const suitTargets: RepublicSnapshot["suitTargets"] = [];
  const historicalActions: RepublicSnapshot["historicalActions"] = [];
  const held = new Set(holdings.filter((item) => ["NOT_COVERED", "COVERED_COMPLIANT"].includes(item.label)).map((item) => item.key));
  for (let round = Math.max(1, game.round_number - 8); round < game.round_number; round += 1) {
    const actions = await Promise.all(factions.map((faction) => read(republicAddress, "get_round_action", [round, faction.faction_id])
      .then((action) => serializable<RoundAction>(action)).catch(() => null)));
    for (const action of actions) {
      if (!action) continue;
      historicalActions.push({ ...action, action_round: round });
      if (suitTargets.length >= 16) continue;
      for (const law of laws) {
        if (law.status !== "ENACTED" || law.certification !== "ADJUDICABLE"
          || law.effective_from_round > round || (law.effective_until_round > 0 && law.effective_until_round < round)) continue;
        const targetClass = action.target_law_id > 0 && ["AMEND_LAW", "REPEAL_LAW", "VETO_LAW"].includes(action.action_type)
          ? "LAW" : action.target_faction_id === "" ? "NONE"
            : action.target_faction_id === law.sponsor_faction_id ? "LAW_SPONSOR"
              : action.target_was_officeholder ? "OFFICEHOLDER" : "OTHER_FACTION";
        const key = `${law.law_id}|${action.action_type}|${targetClass}`;
        if (held.has(key)) continue;
        const defendantFactionId = action.faction_id;
        if (defendantFactionId === action.faction_id) continue;
        suitTargets.push({ actionRound: round, actionType: action.action_type, defendantFactionId,
          lawId: law.law_id, lawTitle: law.title, targetClass });
        if (suitTargets.length >= 16) break;
      }
    }
  }

  return {
    cases: enrichedCases,
    court,
    crisis,
    current_actions: (await Promise.all(currentActionRequests)).filter(
      (action): action is RoundAction => action !== null,
    ),
    factions,
    game,
    laws,
    keeperStatus,
    storageStats,
    holdings,
    registry: registryRaw ? serializable(registryRaw) : null,
    suitTargets,
    historicalActions,
    lawHistory,
    offices: parseJson<Office[]>(officesRaw, []),
    objectives: serializable<Objective[]>(await Promise.all(objectiveRequests)),
    summary: summaryRaw ? parseJson<RoundSummary | null>(summaryRaw, null) : null,
  };
}
