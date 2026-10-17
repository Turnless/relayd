import { NextResponse } from "next/server";
import { graph } from "@/lib/falkor";
import { entry } from "@/lib/catalog";
import { bedSubgraph } from "@/lib/subgraph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const bed = (url.searchParams.get("bed") || "").toUpperCase();
  if (!/^B\d{1,3}$/.test(bed)) return NextResponse.json({ error: "bed must look like B6" }, { status: 400 });
  try {
    const g = await graph(entry(url.searchParams.get("g")).graph);
    return NextResponse.json(await bedSubgraph(g, bed));
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 503 });
  }
}
