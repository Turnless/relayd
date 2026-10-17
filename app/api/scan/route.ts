import { NextResponse } from "next/server";
import { graph } from "@/lib/falkor";
import { cachedReport, entry } from "@/lib/catalog";
import { scan } from "@/lib/rules";
import { graphStats } from "@/lib/subgraph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const e = entry(new URL(req.url).searchParams.get("g"));
  const t0 = Date.now();
  try {
    const g = await graph(e.graph);
    const [report, stats] = await Promise.all([scan(g, e.lastShift), graphStats(g)]);
    return NextResponse.json({ source: "live", graph: e.graph, ms: Date.now() - t0, stats, report });
  } catch (err) {
    const report = cachedReport(e.graph);
    if (!report) return NextResponse.json({ error: `graph unavailable: ${(err as Error).message}` }, { status: 503 });
    return NextResponse.json({ source: "cached", graph: e.graph, ms: Date.now() - t0, stats: null, report });
  }
}
