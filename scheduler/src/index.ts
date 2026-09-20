const KEEPER_PATH = "/api/cron/advance";
const REQUEST_TIMEOUT_MS = 280_000;
const MAX_RESPONSE_BYTES = 32_768;

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type SchedulerEnv = Env & {
  CRON_SECRET: string;
};

export type KeeperWakeResult = {
  failed: number;
  ok: true;
  processed: number;
  skipped: number;
  submitted: number;
};

export class SchedulerConfigurationError extends Error {}

export class KeeperResponseError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function positiveInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new KeeperResponseError(`Keeper response has invalid ${field}`, 502);
  }
  return value;
}

function validateEnvironment(env: SchedulerEnv): URL {
  const secret = String(env.CRON_SECRET ?? "").trim();
  if (secret.length < 32) {
    throw new SchedulerConfigurationError("CRON_SECRET must contain at least 32 characters");
  }

  let endpoint: URL;
  try {
    endpoint = new URL(String(env.KEEPER_URL ?? ""));
  } catch {
    throw new SchedulerConfigurationError("KEEPER_URL must be a valid URL");
  }
  if (
    endpoint.protocol !== "https:" ||
    endpoint.pathname !== KEEPER_PATH ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    endpoint.hostname.endsWith(".invalid")
  ) {
    throw new SchedulerConfigurationError(`KEEPER_URL must be an HTTPS URL ending in ${KEEPER_PATH}`);
  }
  return endpoint;
}

async function readBoundedBody(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel("response too large");
        throw new KeeperResponseError("Keeper response exceeded the size limit", 502);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

function parseKeeperResult(response: Response, body: string): KeeperWakeResult {
  if (!response.ok) {
    throw new KeeperResponseError(`Keeper endpoint returned HTTP ${response.status}`, response.status);
  }

  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    throw new KeeperResponseError("Keeper endpoint returned invalid JSON", 502);
  }
  if (!value || typeof value !== "object") {
    throw new KeeperResponseError("Keeper endpoint returned an invalid result", 502);
  }

  const result = value as Record<string, unknown>;
  if (result.ok !== true) {
    throw new KeeperResponseError("Keeper reported one or more failed operations", response.status);
  }
  return {
    failed: positiveInteger(result.failed, "failed"),
    ok: true,
    processed: positiveInteger(result.processed, "processed"),
    skipped: positiveInteger(result.skipped, "skipped"),
    submitted: positiveInteger(result.submitted, "submitted"),
  };
}

export async function wakeKeeper(
  env: SchedulerEnv,
  scheduledTime: number,
  fetcher: Fetcher = fetch,
): Promise<KeeperWakeResult> {
  const endpoint = validateEnvironment(env);
  const response = await fetcher(endpoint, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${env.CRON_SECRET}`,
      "X-Loophole-Scheduled-Time": String(scheduledTime),
    },
    method: "GET",
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = await readBoundedBody(response);
  return parseKeeperResult(response, body);
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Unknown scheduler failure";
}

export default {
  async scheduled(controller, env): Promise<void> {
    const startedAt = Date.now();
    try {
      const result = await wakeKeeper(env, controller.scheduledTime);
      console.log(JSON.stringify({
        cron: controller.cron,
        durationMs: Date.now() - startedAt,
        event: "keeper_wake_succeeded",
        failed: result.failed,
        processed: result.processed,
        scheduledTime: controller.scheduledTime,
        skipped: result.skipped,
        submitted: result.submitted,
      }));
    } catch (cause) {
      if (
        cause instanceof SchedulerConfigurationError ||
        (cause instanceof KeeperResponseError && cause.status >= 400 && cause.status < 500)
      ) {
        controller.noRetry();
      }
      console.error(JSON.stringify({
        cron: controller.cron,
        durationMs: Date.now() - startedAt,
        error: errorMessage(cause),
        event: "keeper_wake_failed",
        scheduledTime: controller.scheduledTime,
      }));
      throw cause;
    }
  },
} satisfies ExportedHandler<SchedulerEnv>;
