import type { Graph } from "falkordb";
import { runRO } from "./falkor";

/**
 * Safety rules. Each rule is one Cypher query over the ward graph; the graph,
 * not the LLM, decides what is unsafe. Each finding carries the exact lines
 * behind it and the path the query walked.
 */

export type Evidence = { key: string; quote: string; text: string; shift: string; kind?: string; drug?: string | null };
export type PathEdge = { from: string; rel: string; to: string };
export type Severity = "critical" | "high" | "medium";

export type Finding = {
  rule: string;
  severity: Severity;
  bed: string | null;
  patient: string | null;
  title: string;
  claim: string;
  evidence: Evidence[];
  path: PathEdge[];
  cypher: string;
  notes: string[];
  /** A node several evidence lines share in the graph (drug family, supply), for the ward board. */
  shared?: { label: string; tone: "red" | "amber"; keys: string[] };
};

type Ev = { id: string | null; kind?: string | null; drug?: string | null; quote: string | null; key: string | null; text: string | null; shift: string | null };

const ev = (e: Ev): Evidence | null =>
  e && e.key && e.quote && e.text ? { key: e.key, quote: e.quote, text: e.text, shift: e.shift ?? "", kind: e.kind ?? "", drug: e.drug ?? null } : null;

const uniq = (xs: (Evidence | null)[]) => {
  const byKey = new Map<string, Evidence>();
  for (const x of xs) {
    if (!x) continue;
    const prev = byKey.get(x.key);
    if (!prev || x.quote.length > prev.quote.length) byKey.set(x.key, x);
  }
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
};

export const CYPHER = {
  allergyConflict: `
MATCH (a:Fact {kind:'allergy'})-[:ABOUT]->(p:Patient)<-[:ABOUT]-(g:Fact)
WHERE g.kind IN ['drug_given','drug_ordered']
MATCH (a)-[:INVOLVES]->(ad:Drug)-[:IN_CLASS]->(c:DrugClass)<-[:IN_CLASS]-(gd:Drug)<-[:INVOLVES]-(g)
MATCH (a)-[:CITES]->(al:Line), (g)-[:CITES]->(gl:Line)
OPTIONAL MATCH (p)<-[:ABOUT]-(s:Fact)-[:CITES]->(sl:Line)
  WHERE s.kind IN ['symptom','obs_abnormal'] AND s.t > g.t
OPTIONAL MATCH (p)<-[:ABOUT]-(e:Fact {kind:'escalation'}) WHERE e.t > g.t
OPTIONAL MATCH (p)<-[:ABOUT]-(bd:Fact)-[:CITES]->(bl:Line)
  WHERE toLower(bd.quote) CONTAINS 'band' AND bd.t > a.t AND bd.t < g.t AND NOT (bd)<-[:RESOLVES]-(:Fact)
OPTIONAL MATCH (p)<-[:ABOUT]-(so:Fact {kind:'stock_out'})-[:CITES]->(sol:Line) WHERE so.t < g.t
RETURN p.key AS patient, p.label AS label, p.bed AS bed, c.name AS cls, ad.name AS allergen, gd.name AS drug,
       {id:a.id, kind:a.kind, drug:a.drug, quote:a.quote, key:al.key, text:al.text, shift:a.shift} AS allergy,
       collect(DISTINCT {id:g.id, kind:g.kind, drug:g.drug, quote:g.quote, key:gl.key, text:gl.text, shift:g.shift}) AS given,
       collect(DISTINCT {id:s.id, kind:s.kind, drug:s.drug, quote:s.quote, key:sl.key, text:sl.text, shift:s.shift}) AS after,
       collect(DISTINCT {id:bd.id, kind:bd.kind, drug:bd.drug, quote:bd.quote, key:bl.key, text:bl.text, shift:bd.shift}) AS band,
       collect(DISTINCT {id:so.id, kind:so.kind, drug:so.drug, quote:so.quote, key:sol.key, text:sol.text, shift:so.shift}) AS stock,
       count(DISTINCT e) AS escalations`,

  blockedBySupply: `
MATCH (x:Fact {kind:'stock_out'})-[:OUT_OF]->(s:Supply)<-[:NEEDS]-(o:Fact)
WHERE NOT (x)<-[:RESOLVES]-(:Fact) AND NOT (o)<-[:RESOLVES]-(:Fact)
MATCH (x)-[:CITES]->(xl:Line), (o)-[:CITES]->(ol:Line), (o)-[:ABOUT]->(p:Patient)
OPTIONAL MATCH (p)<-[:ABOUT]-(r:Fact)-[:CITES]->(rl:Line)
  WHERE r.kind IN ['obs_abnormal','symptom'] AND r.topic = o.topic AND r.t <= o.t
RETURN s.name AS supply, p.key AS patient, p.label AS label, p.bed AS bed,
       {id:x.id, kind:x.kind, drug:x.drug, quote:x.quote, key:xl.key, text:xl.text, shift:x.shift} AS stockout,
       collect(DISTINCT {id:o.id, kind:o.kind, drug:o.drug, quote:o.quote, key:ol.key, text:ol.text, shift:o.shift}) AS blocked,
       collect(DISTINCT {id:r.id, kind:r.kind, drug:r.drug, quote:r.quote, key:rl.key, text:rl.text, shift:r.shift}) AS cause`,

  recurringConcern: `
MATCH (p:Patient)<-[:ABOUT]-(f1:Fact)-[:CITES]->(l1:Line)-[:IN_SHIFT]->(s1:Shift),
      (p)<-[:ABOUT]-(f2:Fact)-[:CITES]->(l2:Line)-[:IN_SHIFT]->(s2:Shift)
WHERE f1.kind IN ['symptom','obs_abnormal'] AND f2.kind IN ['symptom','obs_abnormal']
  AND f1.topic IS NOT NULL AND f1.topic = f2.topic AND s1.seq < s2.seq AND s1.author <> s2.author
  AND NOT (f1)<-[:RESOLVES]-(:Fact) AND NOT (f2)<-[:RESOLVES]-(:Fact)
  AND NOT (l1)<-[:CITES]-(:Fact {kind:'drug_given'}) AND NOT (l2)<-[:CITES]-(:Fact {kind:'drug_given'})
OPTIONAL MATCH (p)<-[:ABOUT]-(e:Fact {kind:'escalation'}) WHERE e.topic = f1.topic AND e.t > f1.t
WITH p, f1, l1, s1, f2, l2, s2, count(e) AS esc
WHERE esc = 0
RETURN p.key AS patient, p.label AS label, p.bed AS bed, f1.topic AS topic,
       collect(DISTINCT s1.author) + collect(DISTINCT s2.author) AS authors,
       collect(DISTINCT {id:f1.id, kind:f1.kind, drug:f1.drug, quote:f1.quote, key:l1.key, text:l1.text, shift:s1.id}) +
       collect(DISTINCT {id:f2.id, kind:f2.kind, drug:f2.drug, quote:f2.quote, key:l2.key, text:l2.text, shift:s2.id}) AS seen`,

  instructions: `
MATCH (f:Fact {kind:'instruction_to_ai'})-[:CITES]->(l:Line)
RETURN {id:f.id, kind:f.kind, drug:f.drug, quote:f.quote, key:l.key, text:l.text, shift:f.shift} AS e ORDER BY f.t`,

  ambiguous: `
MATCH (f:Fact {kind:'ambiguous_term'})-[:CITES]->(l:Line)
RETURN {id:f.id, kind:f.kind, drug:f.drug, quote:f.quote, key:l.key, text:l.text, shift:f.shift} AS e, f.bed AS bed ORDER BY f.t`,

  lastSummary: `
MATCH (f:Fact {kind:'summary_claim'})-[:CITES]->(l:Line)-[:IN_SHIFT]->(s:Shift {id:$shift})
OPTIONAL MATCH (f)-[:MENTIONS]->(b:Bed)
WITH f, l, collect(b.id) AS beds ORDER BY f.t DESC LIMIT 1
RETURN {id:f.id, kind:f.kind, drug:f.drug, quote:f.quote, key:l.key, text:l.text, shift:f.shift} AS e, beds`,

  resolved: `
MATCH (r:Fact)-[:RESOLVES]->(f:Fact), (r)-[:CITES]->(rl:Line), (f)-[:CITES]->(fl:Line)
WHERE f.shift = $shift OR r.shift = $shift
RETURN f.bed AS bed, {id:f.id, kind:f.kind, drug:f.drug, quote:f.quote, key:fl.key, text:fl.text, shift:f.shift} AS opened,
       {id:r.id, kind:r.kind, drug:r.drug, quote:r.quote, key:rl.key, text:rl.text, shift:r.shift} AS closed ORDER BY f.t`,

  coverage: `
MATCH (l:Line)-[:IN_SHIFT]->(s:Shift {id:$shift})
OPTIONAL MATCH (f:Fact)-[:CITES]->(l)
OPTIONAL MATCH (f)-[:ABOUT]->(p:Patient)
RETURN count(DISTINCT l) AS lines, collect(DISTINCT p.bed) AS beds`,
};

export type ScanResult = {
  shift: string;
  findings: Finding[];
  ignoredInstructions: Evidence[];
  unclear: (Evidence & { bed: string | null })[];
  resolved: { bed: string | null; opened: Evidence; closed: Evidence }[];
  summary: Evidence | null;
  checked: { lines: number; beds: string[] };
};

const SEV_ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2 };

/** Run every rule for the handover at the end of `shift`. Pure graph reads. */
export async function scan(g: Graph, shift: string): Promise<ScanResult> {
  const findings: Finding[] = [];

  for (const r of await runRO<any>(g, CYPHER.allergyConflict)) {
    const given = (r.given as Ev[]).map(ev);
    const after = (r.after as Ev[]).map(ev).filter(Boolean) as Evidence[];
    const allergy = ev(r.allergy);
    const crossShift = allergy && given.some((x) => x && x.shift !== allergy.shift);
    const notes: string[] = [];
    if (crossShift) notes.push(`The allergy was recorded on an earlier shift (${allergy!.shift}); the shift that gave the drug never mentions it.`);
    const band = (r.band as Ev[]).map(ev).filter(Boolean) as Evidence[];
    const stock = (r.stock as Ev[]).map(ev).filter(Boolean) as Evidence[];
    for (const b of band) notes.push(`Allergy band: "${b.quote}" (${b.key}). No later entry says it was put back.`);
    if (stock.length)
      notes.push(`The usual drug ran out before the substitution: ${stock.map((s) => `"${s.quote}" (${s.key})`).join(", then ")}.`);
    if (after.length && Number(r.escalations) === 0) notes.push("Possible reaction signs after the dose; no escalation is logged after it.");
    findings.push({
      rule: "allergy_conflict",
      severity: "critical",
      bed: r.bed,
      patient: r.label ?? r.patient,
      title: `${r.bed}: ${r.drug} given to a patient with a ${r.allergen} allergy`,
      claim: `${r.drug} is in the ${r.cls} class, and this patient's recorded allergy is to ${r.allergen}.`,
      evidence: uniq([allergy, ...band, ...stock, ...given, ...after]),
      path: [
        { from: `Fact: allergy (${r.allergen})`, rel: "ABOUT", to: `Patient ${r.bed}` },
        { from: `Fact: allergy (${r.allergen})`, rel: "INVOLVES", to: `Drug ${r.allergen}` },
        { from: `Drug ${r.allergen}`, rel: "IN_CLASS", to: `Class ${r.cls}` },
        { from: `Drug ${r.drug}`, rel: "IN_CLASS", to: `Class ${r.cls}` },
        { from: `Fact: given (${r.drug})`, rel: "INVOLVES", to: `Drug ${r.drug}` },
        { from: `Fact: given (${r.drug})`, rel: "ABOUT", to: `Patient ${r.bed}` },
      ],
      cypher: CYPHER.allergyConflict.trim(),
      shared: { label: `${r.cls} family`, tone: "red", keys: [allergy?.key, ...given.map((x) => x?.key)].filter(Boolean) as string[] },
      notes,
    });
  }

  for (const r of await runRO<any>(g, CYPHER.blockedBySupply)) {
    findings.push({
      rule: "blocked_by_supply",
      severity: "high",
      bed: r.bed,
      patient: r.label ?? r.patient,
      title: `${r.bed ?? "Ward"}: follow-up blocked because ${r.supply} ran out`,
      claim: `A required follow-up for ${r.bed ?? "a patient"} could not be done because the ward has no ${r.supply}, and nothing in the graph shows it was restocked.`,
      evidence: uniq([...(r.cause as Ev[]).map(ev), ...(r.blocked as Ev[]).map(ev), ev(r.stockout)]),
      path: [
        { from: "Fact: abnormal result", rel: "ABOUT", to: `Patient ${r.bed}` },
        { from: "Fact: follow-up", rel: "ABOUT", to: `Patient ${r.bed}` },
        { from: "Fact: follow-up", rel: "NEEDS", to: `Supply ${r.supply}` },
        { from: "Fact: stock-out", rel: "OUT_OF", to: `Supply ${r.supply}` },
      ],
      cypher: CYPHER.blockedBySupply.trim(),
      shared: { label: r.supply, tone: "amber", keys: [ev(r.stockout)?.key, ...(r.blocked as Ev[]).map((x) => ev(x)?.key)].filter(Boolean) as string[] },
      notes: [],
    });
  }

  for (const r of await runRO<any>(g, CYPHER.recurringConcern)) {
    const seen = uniq((r.seen as Ev[]).map(ev));
    const authors = [...new Set(r.authors as string[])];
    findings.push({
      rule: "recurring_unescalated",
      severity: "high",
      bed: r.bed,
      patient: r.label ?? r.patient,
      title: `${r.bed}: ${r.topic} flagged on ${new Set(seen.map((s) => s.shift)).size} shifts, never escalated`,
      claim: `${authors.length} different nurses each noted ${r.topic} for this patient on separate shifts, and no escalation about it is logged.`,
      evidence: seen,
      path: [
        { from: `Fact: ${r.topic} (earlier shift)`, rel: "ABOUT", to: `Patient ${r.bed}` },
        { from: `Fact: ${r.topic} (later shift)`, rel: "ABOUT", to: `Patient ${r.bed}` },
        { from: "Line (earlier)", rel: "IN_SHIFT", to: "Shift written by one nurse" },
        { from: "Line (later)", rel: "IN_SHIFT", to: "Shift written by another nurse" },
      ],
      cypher: CYPHER.recurringConcern.trim(),
      notes: [`Noted by: ${authors.join(", ")}`],
    });
  }

  // Merge duplicates (same rule + patient) produced by multi-row matches.
  const merged = new Map<string, Finding>();
  for (const f of findings) {
    const k = `${f.rule}|${f.patient}|${f.title}`;
    const prev = merged.get(k);
    if (prev) {
      prev.evidence = uniq([...prev.evidence, ...f.evidence]);
      if (prev.shared && f.shared) prev.shared.keys = [...new Set([...prev.shared.keys, ...f.shared.keys])];
    }
    else merged.set(k, f);
  }
  const list = [...merged.values()].sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);

  const summaryRow = (await runRO<any>(g, CYPHER.lastSummary, { shift }))[0];
  const summary = summaryRow ? ev(summaryRow.e) : null;
  if (summary) {
    const mentioned = new Set<string>(summaryRow.beds);
    for (const f of list) {
      if (f.bed && !mentioned.has(f.bed)) {
        f.notes.push(`Left out of the handover summary (${summary.key}).`);
        if (!f.evidence.some((e) => e.key === summary.key)) f.evidence.push(summary);
      }
    }
  }

  const cov = (await runRO<any>(g, CYPHER.coverage, { shift }))[0] ?? { lines: 0, beds: [] };
  return {
    shift,
    findings: list,
    ignoredInstructions: (await runRO<any>(g, CYPHER.instructions)).map((r) => ev(r.e)).filter(Boolean) as Evidence[],
    unclear: (await runRO<any>(g, CYPHER.ambiguous))
      .map((r) => {
        const e = ev(r.e);
        return e ? { ...e, bed: r.bed as string | null } : null;
      })
      .filter(Boolean) as (Evidence & { bed: string | null })[],
    resolved: (await runRO<any>(g, CYPHER.resolved, { shift }))
      .map((r) => ({ bed: r.bed, opened: ev(r.opened)!, closed: ev(r.closed)! }))
      .filter((r) => r.opened && r.closed),
    summary,
    checked: {
      lines: Number(cov.lines),
      beds: (cov.beds as (string | null)[]).filter(Boolean).sort((a, b) => a!.localeCompare(b!, undefined, { numeric: true })) as string[],
    },
  };
}
