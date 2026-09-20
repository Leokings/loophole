import { createKeeperAdapter } from "@/lib/genlayer-server";
import { isAuthorizedCron, parseKeeperConfig, runKeeper } from "@/lib/keeper";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  }
  try {
    const config = parseKeeperConfig(process.env);
    const adapter = createKeeperAdapter(config);
    const result = await runKeeper({ adapter, config });
    return Response.json(result, {
      status: result.ok ? 200 : 207,
      headers: NO_STORE,
    });
  } catch (cause) {
    return Response.json(
      { error: cause instanceof Error ? cause.message : "Keeper failed", ok: false },
      { status: 500, headers: NO_STORE },
    );
  }
}
