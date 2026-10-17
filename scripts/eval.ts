/**
 * Score the reports written by `npm run graph` against the hand-written labels.
 *   npm run eval
 * Metrics (from docs/eval-design in the planning notes):
 *   quote validity   every evidence quote is a verbatim substring of the source file line (must be 100%)
 *   recall           labelled unsafe items found (same bed, all required lines cited)
 *   precision        findings that match a labelled unsafe item
 *   clean            logs with no unsafe items produce no findings
 *   injection        adversarial lines are listed as ignored and the bed is still flagged
 *   resolved         items resolved in the log are not reported as unsafe
 *   ambiguous        ambiguous abbreviations are listed as unclear
 * Writes data/reports/eval.json and prints a table.
 */
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, readLogFile } from "../lib/log";
import { catalog } from "../lib/catalog";
import type { ScanResult } from "../lib/rules";

type Label = {
  log_id: string;
  unsafe_items: { item_id: string; bed: string; severity: string; required_lines: string[] }[];
  resolved_items: { bed: string }[];
  ambiguous_items: { bed: string; lines: string[] }[];
  adversarial_lines: { line: string }[];
};

const qualify = (logId: string, line: string) => (line.includes(":") ? line : `${logId}:${line}`);

function labelFor(id: string): Label | null {
  const f = id === "ward" ? path.join(DATA_DIR, "ward", "FMW.labels.json") : path.join(DATA_DIR, "eval", `${id}.labels.json`);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null;
}

const rows: Record<string, unknown>[] = [];
let quotes = 0;
let badQuotes = 0;
let tp = 0;
let labelled = 0;
let findingsTotal = 0;
let matchedFindings = 0;

for (const e of catalog()) {
  const label = labelFor(e.id);
  const reportFile = path.join(DATA_DIR, "reports", `${e.graph}.json`);
  if (!label || !fs.existsSync(reportFile)) continue;
  const report = JSON.parse(fs.readFileSync(reportFile, "utf8")) as ScanResult;

  // Ground truth for quotes is the file on disk, not the graph.
  const source = new Map<string, string>();
  for (const log of e.logs) for (const l of readLogFile(path.join(DATA_DIR, e.id === "ward" ? "ward" : "eval", `${log.logId}.log.txt`)).lines) source.set(l.key, l.text);
  const allEvidence = [
    ...report.findings.flatMap((f) => f.evidence),
    ...report.ignoredInstructions,
    ...report.unclear,
    ...report.resolved.flatMap((r) => [r.opened, r.closed]),
  ];
  const invalid = allEvidence.filter((ev) => !(source.get(ev.key) ?? "").includes(ev.quote));
  quotes += allEvidence.length;
  badQuotes += invalid.length;

  const found: string[] = [];
  const missed: string[] = [];
  for (const item of label.unsafe_items) {
    labelled++;
    const req = item.required_lines.map((l) => qualify(label.log_id, l));
    const hit = report.findings.some((f) => f.bed === item.bed && req.every((k) => f.evidence.some((ev) => ev.key === k)));
    if (hit) {
      tp++;
      found.push(item.item_id);
    } else missed.push(item.item_id);
  }
  const unsafeBeds = new Set(label.unsafe_items.map((u) => u.bed));
  const extra = report.findings.filter((f) => !f.bed || !unsafeBeds.has(f.bed));
  findingsTotal += report.findings.length;
  matchedFindings += report.findings.length - extra.length;

  const ignored = new Set(report.ignoredInstructions.map((x) => x.key));
  const injectionOk = label.adversarial_lines.every((a) => ignored.has(qualify(label.log_id, a.line)));
  const resolvedWrong = label.resolved_items.filter((r) => report.findings.some((f) => f.bed === r.bed && !unsafeBeds.has(r.bed)));
  const unclearKeys = new Set(report.unclear.map((u) => u.key));
  const ambiguousOk = label.ambiguous_items.every((a) => a.lines.some((l) => unclearKeys.has(qualify(label.log_id, l))));

  rows.push({
    graph: e.id,
    labelled: label.unsafe_items.length,
    found: found.join(" ") || "-",
    missed: missed.join(" ") || "-",
    extra: extra.map((f) => `${f.rule}@${f.bed}`).join(" ") || "-",
    clean: label.unsafe_items.length === 0 ? report.findings.length === 0 : "n/a",
    injection: label.adversarial_lines.length ? injectionOk : "n/a",
    resolved_ok: resolvedWrong.length === 0,
    ambiguous: label.ambiguous_items.length ? ambiguousOk : "n/a",
    bad_quotes: invalid.length,
  });
}

const summary = {
  quote_validity: quotes ? `${quotes - badQuotes}/${quotes}` : "0/0",
  recall: labelled ? `${tp}/${labelled}` : "0/0",
  precision: findingsTotal ? `${matchedFindings}/${findingsTotal}` : "0/0",
};
console.table(rows);
console.log(summary);
fs.writeFileSync(path.join(DATA_DIR, "reports", "eval.json"), JSON.stringify({ at: new Date().toISOString(), summary, rows }, null, 2));
if (badQuotes > 0) process.exit(1);
