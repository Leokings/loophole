import { describe, expect, it, vi } from "vitest";

import worker, {
  KeeperResponseError,
  SchedulerConfigurationError,
  wakeKeeper,
  type SchedulerEnv,
} from "../src/index";

const SECRET = "test-secret-with-at-least-thirty-two-characters";
const ENV = {
  CRON_SECRET: SECRET,
  KEEPER_URL: "https://loophole.vercel.app/api/cron/advance",
} as SchedulerEnv;

function successResponse(overrides: Record<string, unknown> = {}) {
  return Response.json({
    failed: 0,
    ok: true,
    processed: 2,
    skipped: 1,
    submitted: 1,
    ...overrides,
  });
}

describe("keeper scheduler", () => {
  it("calls only the protected keeper endpoint with the shared bearer secret", async () => {
    const fetcher = vi.fn(async () => successResponse());
    const result = await wakeKeeper(ENV, 1_724_000_000_000, fetcher);

    expect(result).toEqual({ failed: 0, ok: true, processed: 2, skipped: 1, submitted: 1 });
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toBe(ENV.KEEPER_URL);
    expect(init?.headers).toMatchObject({
      Authorization: `Bearer ${SECRET}`,
      "X-Loophole-Scheduled-Time": "1724000000000",
    });
    expect(init?.redirect).toBe("manual");
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it("rejects placeholder, non-HTTPS, and malformed configuration before fetching", async () => {
    const fetcher = vi.fn();
    await expect(wakeKeeper({ ...ENV, KEEPER_URL: "https://loophole.invalid/api/cron/advance" }, 1, fetcher))
      .rejects.toBeInstanceOf(SchedulerConfigurationError);
    await expect(wakeKeeper({ ...ENV, KEEPER_URL: "http://example.com/api/cron/advance" }, 1, fetcher))
      .rejects.toBeInstanceOf(SchedulerConfigurationError);
    await expect(wakeKeeper({ ...ENV, CRON_SECRET: "short" }, 1, fetcher))
      .rejects.toBeInstanceOf(SchedulerConfigurationError);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("turns HTTP errors, invalid JSON, and keeper partial failures into failed executions", async () => {
    await expect(wakeKeeper(ENV, 1, async () => new Response("no", { status: 401 })))
      .rejects.toMatchObject({ status: 401 });
    await expect(wakeKeeper(ENV, 1, async () => new Response("not-json")))
      .rejects.toBeInstanceOf(KeeperResponseError);
    await expect(wakeKeeper(ENV, 1, async () => successResponse({ failed: 1, ok: false })))
      .rejects.toThrow("failed operations");
  });

  it("refuses an unexpectedly large upstream body", async () => {
    await expect(wakeKeeper(ENV, 1, async () => new Response("x".repeat(32_769))))
      .rejects.toThrow("size limit");
  });

  it("disables retries for permanent configuration failures", async () => {
    const noRetry = vi.fn();
    await expect(worker.scheduled?.(
      { cron: "*/5 * * * *", noRetry, scheduledTime: 1, type: "scheduled" },
      { ...ENV, CRON_SECRET: "short" },
      { props: {}, waitUntil: vi.fn(), passThroughOnException: vi.fn() },
    )).rejects.toBeInstanceOf(SchedulerConfigurationError);
    expect(noRetry).toHaveBeenCalledOnce();
  });
});
