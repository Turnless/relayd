import { NextResponse } from "next/server";
import { graph } from "@/lib/falkor";
import { cachedReport, catalog, entry } from "@/lib/catalog";
import { scan, type ScanResult } from "@/lib/rules";
import { graphStats } from "@/lib/subgraph";
import { buildBoard, shiftInfo } from "@/lib/board";
import { medicines, medRows } from "@/lib/medicines";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Everything the ward screen needs in one call: safety results, board layout, medicines, notes. */
export async function GET(req: Request) {
  const e = entry(new URL(req.url).searchParams.get("g"));
  const graphs = catalog().map((c) => ({ id: c.id, label: c.label }));
  const t0 = Date.now();
  let report: ScanResult;
  let source: "live" | "cached" = "live";
  let stats: Awaited<ReturnType<typeof graphStats>> | null = null;
  let meds;
  const labels = new Map(e.logs.map((l) => [l.logId, shiftInfo(l).label]));
  const label = (id: string) => labels.get(id) ?? id;
  try {
    const g = await graph(e.graph);
    report = await scan(g, e.lastShift);
    [stats, meds] = await Promise.all([graphStats(g), medicines(g, report, label)]);
  } catch (err) {
    const cached = cachedReport(e.graph);
    if (!cached) return NextResponse.json({ error: `graph unavailable: ${(err as Error).message}` }, { status: 503 });
    report = cached;
    source = "cached";
    meds = medRows([], report, label);
  }
  const board = buildBoard(report, e.logs);
  return NextResponse.json({ source, graph: e.graph, id: e.id, graphs, ms: Date.now() - t0, stats, report, board, meds });
}
