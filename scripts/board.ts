/** Print the ward board and medicines the graph produces (debug aid): npm run board -- [graph id] */
import { db, graph } from "../lib/falkor";
import { entry } from "../lib/catalog";
import { scan } from "../lib/rules";
import { buildBoard, shiftInfo } from "../lib/board";
import { medicines } from "../lib/medicines";

async function main() {
  const e = entry(process.argv[2] || "ward");
  const g = await graph(e.graph);
  const r = await scan(g, e.lastShift);
  const b = buildBoard(r, e.logs);
  console.log(b.shifts.map((s) => `${s.label} (${s.author})`).join(" | "));
  for (const n of b.nodes) {
    if (n.type === "band") continue;
    const d = n.data as Record<string, unknown>;
    console.log(n.type.padEnd(8), String(Math.round(n.x)).padStart(5), String(Math.round(n.y)).padStart(5), JSON.stringify(d.title ?? d.name), d.target ?? "");
  }
  console.log(`edges ${b.edges.length}, size ${b.width}x${b.height}`);
  const labels = new Map(e.logs.map((l) => [l.logId, shiftInfo(l).label]));
  for (const m of await medicines(g, r, (id) => labels.get(id) ?? id)) console.log(m.tone.padEnd(6), m.drug, `bed ${m.bed}`, m.when, "|", m.check, "|", m.quote);
  await (await db()).close();
}
main().catch((err) => { console.error(err); process.exit(1); });
