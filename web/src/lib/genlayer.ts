import { createClient } from "genlayer-js";
import { studionet, testnetBradbury } from "genlayer-js/chains";
import type { CalldataEncodable } from "genlayer-js/types";

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
  RoundSummary,
} from "@/lib/types";

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
type EthereumProvider = NonNullable<ClientConfig["provider"]>;

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

function clientFor(account?: HexAddress) {
  return createClient({
    account,
    chain: selectedChain,
    endpoint: rpcUrl,
    provider: account && typeof window !== "undefined" ? window.ethereum : undefined,
  });
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

export async function connectWallet(): Promise<string> {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("A browser wallet such as MetaMask is required for signed actions.");
  }
  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  if (!Array.isArray(accounts) || typeof accounts[0] !== "string") {
    throw new Error("The wallet did not return an account.");
  }
  const address = accounts[0] as HexAddress;
  const client = clientFor(address);
  await client.connect(configuredNetwork);
  return address.toLowerCase();
}

export async function writeRepublic(
  account: string,
  functionName: string,
  args: unknown[] = [],
): Promise<string> {
  if (!hasLiveRepublic) throw new Error("No live republic contract is configured.");
  const client = clientFor(account as HexAddress);
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
  const client = clientFor(account as HexAddress);
  const hash = await client.writeContract({
    address: courtAddress as HexAddress,
    args: args as CalldataEncodable[],
    functionName,
    value: 0n,
  });
  return String(hash);
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
  const crisisRecord = crisisRaw ? serializable<Crisis & { responses_json?: string }>(crisisRaw) : null;
  const crisis = crisisRecord
    ? { ...crisisRecord, responses: parseJson(crisisRecord.responses_json, []) }
    : null;

  return {
    cases: court ? await readCourtCases(court) : [],
    court,
    crisis,
    factions,
    game,
    laws: serializable<Law[]>(lawsRaw),
    offices: parseJson<Office[]>(officesRaw, []),
    objectives: serializable<Objective[]>(await Promise.all(objectiveRequests)),
    summary: summaryRaw ? parseJson<RoundSummary | null>(summaryRaw, null) : null,
  };
}
