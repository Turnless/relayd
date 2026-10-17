import type { Graph } from "falkordb";
import { runRO } from "./falkor";

export type VizNode = { id: string; label: string; kind: string; title: string };
export type VizLink = { source: string; target: string; rel: string };

export const SUBGRAPH_CYPHER = `
MATCH (p:Patient {bed: $bed})<-[:ABOUT]-(f:Fact)-[:CITES]->(l:Line)-[:IN_SHIFT]->(s:Shift)
OPTIONAL MATCH (f)-[:INVOLVES]->(d:Drug)
OPTIONAL MATCH (d)-[:IN_CLASS]->(c:DrugClass)
OPTIONAL MATCH (f)-[:NEEDS|OUT_OF]->(u:Supply)
OPTIONAL MATCH (u)<-[:OUT_OF]-(x:Fact)-[:CITES]->(xl:Line)
OPTIONAL MATCH (r:Fact)-[:RESOLVES]->(f)
RETURN p.key AS patient, p.label AS plabel, f.id AS fid, f.kind AS kind, f.quote AS quote, l.key AS line, s.id AS shift,
       d.name AS drug, c.name AS cls, u.name AS supply, x.id AS xid, xl.key AS xline, r.id AS rid`;

/** The neighbourhood of one bed's patient(s): facts, the lines behind them, drugs, classes, supplies, shifts. */
export async function bedSubgraph(g: Graph, bed: string) {
  const rows = await runRO<any>(g, SUBGRAPH_CYPHER, { bed });
  const nodes = new Map<string, VizNode>();
  const links: VizLink[] = [];
  const seen = new Set<string>();
  const node = (id: string, label: string, kind: string, title = label) => {
    if (!nodes.has(id)) nodes.set(id, { id, label, kind, title });
  };
  const link = (source: string, target: string, rel: string) => {
    const k = `${source}|${rel}|${target}`;
    if (!seen.has(k)) {
      seen.add(k);
      links.push({ source, target, rel });
    }
  };
  for (const r of rows) {
    node(r.patient, r.plabel ? `${bed} ${r.plabel}` : bed, "Patient");
    node(r.fid, r.kind.replace(/_/g, " "), "Fact", `${r.line}: "${r.quote}"`);
    node(r.shift, r.shift, "Shift");
    link(r.fid, r.patient, "ABOUT");
    link(r.fid, r.shift, "IN_SHIFT");
    if (r.drug) {
      node(`drug:${r.drug}`, r.drug, "Drug");
      link(r.fid, `drug:${r.drug}`, "INVOLVES");
    }
    if (r.drug && r.cls) {
      node(`class:${r.cls}`, `${r.cls} class`, "DrugClass");
      link(`drug:${r.drug}`, `class:${r.cls}`, "IN_CLASS");
    }
    if (r.supply) {
      node(`supply:${r.supply}`, r.supply, "Supply");
      link(r.fid, `supply:${r.supply}`, r.kind === "stock_out" ? "OUT_OF" : "NEEDS");
    }
    if (r.supply && r.xid) {
      node(r.xid, "stock out", "Fact", `${r.xline}`);
      link(r.xid, `supply:${r.supply}`, "OUT_OF");
    }
    if (r.rid) link(r.rid, r.fid, "RESOLVES");
  }
  return { nodes: [...nodes.values()], links, cypher: SUBGRAPH_CYPHER.trim() };
}

export async function graphStats(g: Graph) {
  const rows = await runRO<{ label: string; n: number }>(
    g,
    "MATCH (n) RETURN labels(n)[0] AS label, count(n) AS n ORDER BY n DESC",
  );
  const rels = await runRO<{ n: number }>(g, "MATCH ()-[r]->() RETURN count(r) AS n");
  return { nodes: rows, relationships: Number(rels[0]?.n ?? 0) };
}
