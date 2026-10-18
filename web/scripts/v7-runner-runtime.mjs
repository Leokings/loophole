import { mkdir, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export class ScenarioStopError extends Error {
  constructor(message) { super(message); this.name = "ScenarioStopError"; }
}
export class SafePauseError extends Error {
  constructor(message) { super(message); this.name = "SafePauseError"; }
}
export class TransientRunError extends Error {
  constructor(message, cause) { super(message, { cause }); this.name = "TransientRunError"; }
}

export function exitCodeFor(error) {
  const seen = new Set();
  for (let item = error; item && !seen.has(item); item = item.cause) {
    seen.add(item);
    if (item instanceof SafePauseError) return 75;
    if (item instanceof ScenarioStopError) return 2;
    if (item instanceof TransientRunError) return 3;
  }
  return 1;
}

const delay = (ms) => new Promise((done) => setTimeout(done, ms));
const retryableFiles = new Set(["EPERM", "EBUSY", "EACCES"]);
const saves = new Map();

/** Serialize writes per path: concurrent receipt updates must not share a tmp file. */
export function save(path, value, options = {}) {
  const data = `${JSON.stringify(value, (key, item) => key.startsWith("_state_") ? undefined : item, 2)}\n`;
  const operation = async () => {
    const fs = options.fs || { mkdir, rename, writeFile };
    await fs.mkdir(resolve(path, ".."), { recursive: true });
    const temporary = `${path}.tmp`;
    await fs.writeFile(temporary, data, { mode: 0o600 });
    for (let attempt = 0; ; attempt += 1) {
      try { await fs.rename(temporary, path); return; }
      catch (error) {
        if (!retryableFiles.has(error.code)) throw error;
        if (attempt === 10) break;
        await (options.sleep || delay)(250 * (attempt + 1));
      }
    }
    (options.warn || console.warn)("Atomic checkpoint rename stayed busy; saving the checkpoint directly.");
    await fs.writeFile(path, data, { mode: 0o600 });
  };
  const pending = (saves.get(path) || Promise.resolve()).catch(() => {}).then(operation);
  saves.set(path, pending);
  return pending.finally(() => { if (saves.get(path) === pending) saves.delete(path); });
}

export function isTransient(error) {
  if (error instanceof ScenarioStopError || error instanceof SafePauseError) return false;
  const messages = [];
  const seen = new Set();
  for (let item = error; item && !seen.has(item); item = item.cause) {
    seen.add(item);
    if (item instanceof ScenarioStopError || item instanceof SafePauseError) return false;
    messages.push(item.message, item.shortMessage, item.details, item.code, item.status, item.statusCode);
  }
  // StudioNet also returns congestion as a JSON-RPC error in an HTTP 200
  // response. Its -32600 code alone is not retryable: require the busy detail.
  return /\b(429|502|503|504|ECONNRESET|ETIMEDOUT)\b|temporarily unavailable|resource not available|fetch failed|server busy:\s*all \d+ execution slots occupied,\s*retry later/i.test(messages.filter(Boolean).join(" "));
}

export async function retryTransient(operation, options = {}) {
  for (let attempt = 0; ; attempt += 1) {
    try { return await operation(); }
    catch (error) {
      if (error instanceof TransientRunError || !isTransient(error)) throw error;
      if (attempt === 6) throw new TransientRunError("Transient RPC failure after six retries; the saved run is resumable.", error);
      (options.warn || console.warn)(`RPC temporarily unavailable; retry ${attempt + 1}/6 in ${15 * (attempt + 1)} seconds.`);
      await (options.sleep || delay)(15_000 * (attempt + 1));
    }
  }
}

/** Retry the identical RPC request, never reconstruct a write with a new nonce. */
export function installRpcRetries(endpoint, options = {}) {
  const original = options.fetch || globalThis.fetch;
  const wrapped = async (input, init) => {
    const url = typeof input === "string" || input instanceof URL ? String(input) : input.url;
    if (url !== endpoint) return original(input, init);
    return retryTransient(async () => {
      const response = await original(input instanceof Request ? input.clone() : input, init);
      if ([429, 502, 503, 504].includes(response.status)) {
        await response.body?.cancel();
        throw new Error(`RPC HTTP ${response.status}`);
      }
      if (response.ok) {
        const body = await response.clone().json().catch(() => null);
        if (body?.error && isTransient(body.error)) {
          await response.body?.cancel();
          throw new Error(body.error.message || "resource not available", { cause: body.error });
        }
      }
      return response;
    }, options);
  };
  if (!options.fetch) globalThis.fetch = wrapped;
  return wrapped;
}

export function runtimeLimit(args, start = Date.now(), clock = Date.now) {
  const index = args.indexOf("--max-runtime-minutes");
  if (index === -1) return { exceeded: () => false, remainingMs: () => Infinity };
  const minutes = Number(args[index + 1]);
  if (!Number.isFinite(minutes) || minutes <= 0) throw new Error("--max-runtime-minutes must be a positive number.");
  const deadline = start + minutes * 60_000;
  return { exceeded: () => clock() >= deadline, remainingMs: () => Math.max(0, deadline - clock()) };
}
