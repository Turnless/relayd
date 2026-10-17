import { NextResponse } from "next/server";
import { db } from "@/lib/falkor";
import { MODEL } from "@/lib/extract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Which settings this deployment can see (never their values), and whether FalkorDB answers. */
export async function GET() {
  const set = (k: string) => Boolean(process.env[k]?.trim());
  const mode = set("FALKORDB_HOST") ? "host" : set("FALKORDB_URL") ? "url" : "default (localhost)";
  let falkordb: { ok: boolean; graphs?: number; ms?: number; error?: string };
  const t0 = Date.now();
  try {
    const graphs = await (await db()).list();
    falkordb = { ok: true, graphs: graphs.filter((g) => g.startsWith("relayd_")).length, ms: Date.now() - t0 };
  } catch (err) {
    falkordb = { ok: false, error: (err as Error).message };
  }
  return NextResponse.json({
    falkordb: {
      mode,
      FALKORDB_HOST: set("FALKORDB_HOST"),
      FALKORDB_PORT: set("FALKORDB_PORT"),
      FALKORDB_USERNAME: set("FALKORDB_USERNAME"),
      FALKORDB_PASSWORD: set("FALKORDB_PASSWORD"),
      ...falkordb,
    },
    anthropic: { ANTHROPIC_API_KEY: set("ANTHROPIC_API_KEY"), ANTHROPIC_WORKSPACE_ID: set("ANTHROPIC_WORKSPACE_ID"), model: MODEL },
    region: process.env.VERCEL_REGION ?? null,
  });
}
