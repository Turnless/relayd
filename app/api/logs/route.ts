import { NextResponse } from "next/server";
import { catalog } from "@/lib/catalog";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    catalog().map((e) => ({
      id: e.id,
      label: e.label,
      graph: e.graph,
      lastShift: e.lastShift,
      logs: e.logs.map((l) => ({ logId: l.logId, header: l.header, lines: l.lines })),
    })),
  );
}
