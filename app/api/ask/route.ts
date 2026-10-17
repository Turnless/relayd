import { NextResponse } from "next/server";
import { graph } from "@/lib/falkor";
import { entry } from "@/lib/catalog";
import { ask } from "@/lib/agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Simple spend guard for the public demo: per-instance limits.
const LIMIT_PER_IP = Number(process.env.RELAYD_ASK_PER_IP || 10);
const LIMIT_TOTAL = Number(process.env.RELAYD_ASK_TOTAL || 200);
const hits = new Map<string, number>();
let total = 0;

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Free-form questions are switched off on this deployment (no API key). The safety check above runs on the graph alone." }, { status: 503 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if ((hits.get(ip) ?? 0) >= LIMIT_PER_IP || total >= LIMIT_TOTAL) {
    return NextResponse.json({ error: "Question limit reached for this demo." }, { status: 429 });
  }
  const body = (await req.json().catch(() => ({}))) as { g?: string; question?: string };
  const question = (body.question || "").trim().slice(0, 500);
  if (!question) return NextResponse.json({ error: "Ask a question." }, { status: 400 });
  hits.set(ip, (hits.get(ip) ?? 0) + 1);
  total++;
  try {
    const e = entry(body.g);
    const g = await graph(e.graph);
    return NextResponse.json(await ask(g, e.lastShift, question));
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
