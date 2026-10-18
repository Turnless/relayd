import type { Graph } from "falkordb";
import { runRO } from "./falkor";
import { clock } from "./board";
import type { ScanResult } from "./rules";

export type MedRow = { id: string; drug: string; quote: string; bed: string | null; key: string; when: string; check: string; tone: "red" | "amber" | "ok" };

export const MEDS_CYPHER = `
MATCH (f:Fact)-[:INVOLVES]->(d:Drug), (f)-[:CITES]->(l:Line)
WHERE f.kind IN ['drug_given','drug_ordered','stock_out']
OPTIONAL MATCH (f)-[:ABOUT]->(p:Patient)
RETURN f.id AS id, f.kind AS kind, d.name AS drug, f.quote AS quote, l.key AS key, l.text AS text, p.bed AS bed, f.t AS t
ORDER BY t`;

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** Every drug fact in the graph, checked against the safety rules' results. */
export function medRows(rows: any[], report: ScanResult, shiftLabel: (logId: string) => string): MedRow[] {
  const clash = new Map<string, string>();
  for (const f of report.findings) {
    if (f.rule !== "allergy_conflict" || !f.shared) continue;
    for (const k of f.shared.keys) clash.set(k, f.shared.label.replace(/ family$/, ""));
  }
  const blocked = new Map<string, string>();
  for (const f of report.findings) if (f.rule === "blocked_by_supply" && f.bed && f.shared) blocked.set(f.bed, f.shared.label);
  const out: MedRow[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const id = `${r.key}|${r.drug}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const when = `${shiftLabel(r.key.split(":")[0])}${clock(r.text) ? ", " + clock(r.text) : ""}`;
    let check = "No problem found";
    let tone: MedRow["tone"] = "ok";
    if (clash.has(r.key) && r.kind !== "stock_out") {
      check = `Allergy clash: this patient is allergic to ${clash.get(r.key)}`;
      tone = "red";
    } else if (r.drug === "insulin" && r.bed && blocked.has(r.bed)) {
      check = `Blood sugar checks blocked: ${blocked.get(r.bed)} ran out`;
      tone = "amber";
    } else if (r.kind === "stock_out") {
      check = "Ran out on the ward";
      tone = "amber";
    }
    out.push({ id, drug: cap(r.drug), quote: r.quote, bed: r.bed ? r.bed.replace(/^B/, "") : null, key: r.key, when, check, tone });
  }
  for (const u of report.unclear) {
    out.push({ id: `${u.key}|unclear`, drug: "Unclear abbreviation", quote: u.quote, bed: u.bed ? u.bed.replace(/^B/, "") : null, key: u.key,
      when: `${shiftLabel(u.key.split(":")[0])}${clock(u.text) ? ", " + clock(u.text) : ""}`, check: "Check the drug chart before giving it", tone: "amber" });
  }
  const order = { red: 0, amber: 1, ok: 2 };
  return out.sort((a, b) => order[a.tone] - order[b.tone]);
}

export async function medicines(g: Graph, report: ScanResult, shiftLabel: (logId: string) => string) {
  return medRows(await runRO<any>(g, MEDS_CYPHER), report, shiftLabel);
}
