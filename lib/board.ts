import type { HandoverLog } from "./log";
import type { Evidence, Finding, ScanResult } from "./rules";

/**
 * Lays out the ward board: one row per patient with a warning, one column per
 * shift, each evidence line placed in the shift it was written in. Everything
 * comes from the safety rules' results (FalkorDB); nothing is hand-placed.
 */

export type Level = "act" | "check";

export type ShiftInfo = { id: string; label: string; author: string; info: string; night: boolean; lines: { key: string; tag: string; n: number; text: string }[] };

export type BoardNode =
  | { id: string; type: "band"; x: number; y: number; w: number; h: number; data: { label: string; author: string; night: boolean; delay: number } }
  | { id: string; type: "patient"; x: number; y: number; w: number; h: number; data: { bed: string; name: string; level: Level; delay: number } }
  | { id: string; type: "fact"; x: number; y: number; w: number; h: number; data: { bed: string; title: string; time: string; key: string; target: "med" | "note"; delay: number } }
  | { id: string; type: "shared"; x: number; y: number; w: number; h: number; data: { bed: string; title: string; tone: "red" | "amber"; target: "med" | "note"; key: string; delay: number } };

export type BoardEdge = { id: string; source: string; target: string; kind: "thread" | "red" | "amber"; delay: number };

export type BoardPatient = { bed: string; name: string; label: string; level: Level; headline: string; notes: string[] };

export type Board = { shifts: ShiftInfo[]; nodes: BoardNode[]; edges: BoardEdge[]; patients: BoardPatient[]; width: number; height: number };

const PATIENT_W = 184;
const X0 = 224;
const COL_W = 296;
const FACT_W = 256;
const FACT_H = 56;
const STEP = 68;

const DRUG_KINDS = new Set(["drug_given", "drug_ordered", "stock_out"]);

export function shiftInfo(log: HandoverLog): ShiftInfo {
  const h = log.header;
  const m = (h.shift || "").match(/^(\w{3})\b.*?\b(night|day)\b/i);
  const fromSetting = (h.setting || "").match(/\b(night|day) shift/i);
  const kind = (m?.[2] || fromSetting?.[1] || "night").toLowerCase();
  const label = m ? `${m[1]} ${kind}` : `${kind[0].toUpperCase()}${kind.slice(1)} shift`;
  return {
    id: log.logId,
    label,
    author: (h.author || "").replace(/\s*\(.*\)\s*$/, "").trim(),
    info: h.shift || h.setting || log.logId,
    night: kind === "night",
    lines: log.lines.map(({ key, tag, n, text }) => ({ key, tag, n, text })),
  };
}

export const clock = (text: string) => {
  const m = text.match(/^(\d{2})(\d{2})\b/);
  return m ? `${m[1]}:${m[2]}` : "";
};

export function shortQuote(q: string, max = 44) {
  const t = q.trim().replace(/\.$/, "");
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 20))}…`;
}

const patientName = (label: string | null, bed: string) => {
  const m = (label || "").match(/^(Mrs|Mr|Miss|Ms|Master)\.?\s+[A-Z]\.\s?[A-Z]\.?/);
  return m ? m[0].replace(/\s+/g, " ") : label?.split(" ").slice(0, 2).join(" ") || `Bed ${bed.replace(/^B/, "")}`;
};

const headline = (f: Finding) => {
  const t = f.title.replace(/^B\d+:\s*/, "");
  return t[0].toUpperCase() + t.slice(1);
};

export function buildBoard(report: ScanResult, logs: HandoverLog[]): Board {
  const shifts = logs.map(shiftInfo);
  const col = new Map(shifts.map((s, i) => [s.id, i]));
  const byBed = new Map<string, Finding[]>();
  for (const f of report.findings) {
    if (!f.bed) continue;
    byBed.set(f.bed, [...(byBed.get(f.bed) ?? []), f]);
  }

  const nodes: BoardNode[] = [];
  const edges: BoardEdge[] = [];
  const patients: BoardPatient[] = [];
  let y = 0;

  for (const [bed, findings] of byBed) {
    const level: Level = findings.some((f) => f.severity === "critical") ? "act" : "check";
    const bedNo = bed.replace(/^B/, "");
    const name = patientName(findings[0].patient, bed);
    patients.push({ bed: bedNo, name, label: findings[0].patient ?? name, level, headline: headline(findings[0]), notes: findings.flatMap((f) => f.notes) });

    const seen = new Map<string, Evidence>();
    for (const f of findings) for (const e of f.evidence) if (e.kind !== "summary_claim" && !seen.has(e.key)) seen.set(e.key, e);
    const lineNo = (k: string) => Number(k.split(":L")[1] ?? 0);
    const evidence = [...seen.values()]
      .filter((e) => col.has(e.shift || e.key.split(":")[0]))
      .sort((a, b) => (col.get(a.key.split(":")[0])! - col.get(b.key.split(":")[0])!) || lineNo(a.key) - lineNo(b.key));

    const cells = new Map<number, Evidence[]>();
    for (const e of evidence) {
      const c = col.get(e.key.split(":")[0])!;
      cells.set(c, [...(cells.get(c) ?? []), e]);
    }
    const maxCell = Math.max(1, ...[...cells.values()].map((v) => v.length));
    const shared = findings.map((f) => f.shared).filter(Boolean) as NonNullable<Finding["shared"]>[];
    const contentH = maxCell * STEP;
    const rowH = contentH + (shared.length ? 64 : 0) + 36;

    const pid = `p:${bed}`;
    nodes.push({ id: pid, type: "patient", x: 0, y: y + contentH / 2 - 46, w: PATIENT_W, h: 92, data: { bed: bedNo, name, level, delay: 0 } });

    const factId = (key: string) => `f:${bed}:${key}`;
    const pos = new Map<string, { x: number; y: number }>();
    for (const [c, list] of cells) {
      list.forEach((e, k) => {
        const x = X0 + c * COL_W + (COL_W - 40 - FACT_W) / 2;
        const top = y + k * STEP + (contentH - list.length * STEP) / 2 + 6;
        pos.set(e.key, { x, y: top });
        const drugish = !!e.drug || (DRUG_KINDS.has(e.kind || "") && e.kind !== "stock_out");
        nodes.push({ id: factId(e.key), type: "fact", x, y: top, w: FACT_W, h: FACT_H,
          data: { bed: bedNo, title: shortQuote(e.quote), time: clock(e.text), key: e.key, target: drugish ? "med" : "note", delay: 140 + c * 120 + k * 40 } });
      });
    }

    let prev = pid;
    evidence.forEach((e, i) => {
      const id = factId(e.key);
      edges.push({ id: `t:${prev}>${id}`, source: prev, target: id, kind: "thread", delay: 200 + (col.get(e.key.split(":")[0]) ?? 0) * 120 + i * 20 });
      prev = id;
    });

    shared.forEach((s, i) => {
      const linked = s.keys.filter((k) => pos.has(k));
      if (!linked.length) return;
      const cx = linked.reduce((a, k) => a + pos.get(k)!.x + FACT_W / 2, 0) / linked.length;
      const sid = `s:${bed}:${s.label}`;
      const w = 210;
      nodes.push({ id: sid, type: "shared", x: cx - w / 2 + i * 24, y: y + contentH + 18, w, h: 42,
        data: { bed: bedNo, title: s.label[0].toUpperCase() + s.label.slice(1), tone: s.tone, target: s.tone === "red" ? "med" : "note", key: linked[0], delay: 520 } });
      for (const k of linked) edges.push({ id: `s:${factId(k)}>${sid}`, source: factId(k), target: sid, kind: s.tone, delay: 560 });
    });

    y += rowH;
  }

  const height = Math.max(y, 200);
  shifts.forEach((s, i) => {
    nodes.unshift({ id: `band:${s.id}`, type: "band", x: X0 + i * COL_W - 12, y: -78, w: COL_W - 16, h: height + 96, data: { label: s.label, author: s.author, night: s.night, delay: i * 90 } });
  });

  return { shifts, nodes, edges, patients, width: X0 + shifts.length * COL_W, height };
}
