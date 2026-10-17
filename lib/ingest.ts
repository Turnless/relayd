import type { Graph } from "falkordb";
import { run } from "./falkor";
import type { HandoverLog } from "./log";
import { classesFor } from "./reference";
import type { Fact, ValidatedExtraction } from "./schema";

export type ShiftMeta = {
  seq: number;
  ward: string;
  label: string;
  author: string;
  previous: string | null;
  synthetic: boolean;
};

export function shiftMeta(log: HandoverLog, fallbackSeq = 1): ShiftMeta {
  const h = log.header;
  return {
    seq: Number(h.seq) || fallbackSeq,
    ward: h.ward || "FMW",
    label: h.shift || h.setting || log.logId,
    author: h.author || "unknown",
    previous: h.previous_shift || null,
    synthetic: /SYNTHETIC/i.test(log.raw),
  };
}

/** "Mrs V.A 41F" -> "V.A". Patients are keyed by bed + initials so a later shift links to the same person. */
export function initials(patient: string | null): string | null {
  if (!patient) return null;
  const m = patient.match(/\b([A-Z])\.\s?([A-Z])\.?/);
  return m ? `${m[1]}.${m[2]}` : null;
}

export async function ensureIndexes(g: Graph) {
  for (const q of [
    "CREATE INDEX FOR (s:Shift) ON (s.id)",
    "CREATE INDEX FOR (l:Line) ON (l.key)",
    "CREATE INDEX FOR (f:Fact) ON (f.id)",
    "CREATE INDEX FOR (f:Fact) ON (f.kind)",
    "CREATE INDEX FOR (p:Patient) ON (p.key)",
    "CREATE INDEX FOR (b:Bed) ON (b.id)",
  ]) {
    try {
      await run(g, q);
    } catch {
      // index already exists
    }
  }
}

/** Which patient was last seen in each bed, according to the graph (ward memory across shifts). */
export async function currentBedMap(g: Graph): Promise<Map<string, string>> {
  const rows = await run<{ bed: string; patient: string; t: number }>(
    g,
    "MATCH (p:Patient)-[r:IN_BED]->(b:Bed) RETURN b.id AS bed, p.key AS patient, r.t AS t ORDER BY t",
  );
  const map = new Map<string, string>();
  for (const r of rows) map.set(r.bed, r.patient);
  return map;
}

/** Write one validated shift into the ward graph. Idempotent (MERGE everywhere). */
export async function ingestShift(g: Graph, log: HandoverLog, meta: ShiftMeta, ex: ValidatedExtraction) {
  await ensureIndexes(g);
  await run(
    g,
    `MERGE (s:Shift {id: $id})
     SET s.seq = $seq, s.ward = $ward, s.label = $label, s.author = $author, s.synthetic = $synthetic, s.lines = $lines
     MERGE (a:Person {name: $author})
     MERGE (a)-[:WROTE]->(s)`,
    { id: log.logId, ...meta, lines: log.lines.length },
  );
  if (meta.previous) {
    await run(g, "MATCH (a:Shift {id: $prev}), (b:Shift {id: $id}) MERGE (a)-[:HANDED_TO]->(b)", {
      prev: meta.previous,
      id: log.logId,
    });
  }
  await run(
    g,
    `UNWIND $lines AS l
     MERGE (x:Line {key: l.key})
     SET x.tag = l.tag, x.n = l.n, x.text = l.text, x.logId = l.logId
     WITH x
     MATCH (s:Shift {id: $id})
     MERGE (x)-[:IN_SHIFT]->(s)`,
    { id: log.logId, lines: log.lines.map(({ key, tag, n, text, logId }) => ({ key, tag, n, text, logId })) },
  );

  const beds = await currentBedMap(g);
  const rows = ex.facts.map((f) => {
    let patientKey: string | null = null;
    if (f.bed) {
      const ini = initials(f.patient);
      if (ini) {
        patientKey = `${f.bed}|${ini}`;
        beds.set(f.bed, patientKey);
      } else {
        patientKey = beds.get(f.bed) ?? `${f.bed}|unknown`;
      }
    }
    return { ...f, patientKey, classes: classesFor(f.drug), patientLabel: f.patient };
  });

  await run(
    g,
    `UNWIND $facts AS f
     MERGE (x:Fact {id: f.id})
     SET x.kind = f.kind, x.quote = f.quote, x.topic = f.topic, x.t = f.t, x.lineKey = f.lineKey,
         x.shift = $shift, x.drug = f.drug, x.supply = f.supply, x.bed = f.bed
     WITH x, f
     MATCH (l:Line {key: f.lineKey})
     MERGE (x)-[:CITES]->(l)`,
    { facts: rows, shift: log.logId },
  );
  const withPatient = rows.filter((r) => r.patientKey);
  await run(
    g,
    `UNWIND $facts AS f
     MATCH (x:Fact {id: f.id})
     MERGE (b:Bed {id: f.bed})
     MERGE (p:Patient {key: f.patientKey})
     SET p.bed = f.bed
     MERGE (x)-[:ABOUT]->(p)
     MERGE (p)-[r:IN_BED]->(b)
     SET r.t = CASE WHEN r.t IS NULL OR r.t < f.t THEN f.t ELSE r.t END`,
    { facts: withPatient },
  );
  await run(
    g,
    `UNWIND $facts AS f
     MATCH (p:Patient {key: f.patientKey})
     SET p.label = f.patientLabel`,
    { facts: withPatient.filter((r) => r.patientLabel) },
  );
  await run(
    g,
    `UNWIND $facts AS f
     MATCH (x:Fact {id: f.id})
     MERGE (d:Drug {name: f.drug})
     MERGE (x)-[:INVOLVES]->(d)
     WITH d, f
     UNWIND f.classes AS c
     MERGE (k:DrugClass {name: c})
     MERGE (d)-[:IN_CLASS]->(k)`,
    { facts: rows.filter((r) => r.drug) },
  );
  await run(
    g,
    `UNWIND $facts AS f
     MATCH (x:Fact {id: f.id})
     MERGE (s:Supply {name: f.supply})
     FOREACH (_ IN CASE WHEN f.kind = 'stock_out' THEN [1] ELSE [] END | MERGE (x)-[:OUT_OF]->(s))
     FOREACH (_ IN CASE WHEN f.kind <> 'stock_out' THEN [1] ELSE [] END | MERGE (x)-[:NEEDS]->(s))`,
    { facts: rows.filter((r) => r.supply) },
  );
  await run(
    g,
    `UNWIND $facts AS f
     MATCH (x:Fact {id: f.id})
     MERGE (p:Person {name: f.person})
     MERGE (p)-[:INVOLVED_IN]->(x)`,
    { facts: rows.filter((r) => r.person) },
  );
  await run(
    g,
    `UNWIND $facts AS f
     MATCH (a:Fact {id: f.id}), (b:Fact {id: f.resolves})
     MERGE (a)-[:RESOLVES]->(b)`,
    { facts: rows.filter((r) => r.resolves) },
  );
  await run(
    g,
    `UNWIND $facts AS f
     MATCH (x:Fact {id: f.id})
     UNWIND f.beds_mentioned AS bid
     MERGE (b:Bed {id: bid})
     MERGE (x)-[:MENTIONS]->(b)`,
    { facts: rows.filter((r) => r.beds_mentioned.length) },
  );
  return { facts: rows.length };
}

/** Open problems the next extraction may close (given to the LLM as context). */
export async function priorOpenItems(g: Graph) {
  return run<{ id: string; bed: string | null; kind: string; quote: string; lineKey: string }>(
    g,
    `MATCH (f:Fact)
     WHERE f.kind IN ['symptom','obs_abnormal','device_problem','stock_out','task_pending','task_blocked','drug_ordered']
       AND NOT (f)<-[:RESOLVES]-(:Fact)
     RETURN f.id AS id, f.bed AS bed, f.kind AS kind, f.quote AS quote, f.lineKey AS lineKey
     ORDER BY f.t`,
  );
}

export type { Fact };
