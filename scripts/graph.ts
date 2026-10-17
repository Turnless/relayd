/**
 * Build the demo graphs from data/.
 *   npm run graph            -> use cached extractions where present, extract the rest
 *   npm run graph -- --fresh -> re-extract every log with the LLM
 *
 * Ward logs (data/ward) go into one graph in shift order, so each extraction
 * sees the open items the graph already holds. Each eval log (data/eval) gets
 * its own graph. Reports are written to data/reports/<graph>.json.
 */
import fs from "node:fs";
import path from "node:path";
import { db, graph, wardGraph } from "../lib/falkor";
import { DATA_DIR, readLogFile, type HandoverLog } from "../lib/log";
import { extractFacts } from "../lib/extract";
import { validateExtraction } from "../lib/validate";
import { ingestShift, priorOpenItems, shiftMeta } from "../lib/ingest";
import { scan } from "../lib/rules";
import type { ValidatedExtraction } from "../lib/schema";

const fresh = process.argv.includes("--fresh");
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);
const CACHE = path.join(DATA_DIR, "extracted");
const REPORTS = path.join(DATA_DIR, "reports");
fs.mkdirSync(CACHE, { recursive: true });
fs.mkdirSync(REPORTS, { recursive: true });

async function extracted(log: HandoverLog, seq: number, prior: Awaited<ReturnType<typeof priorOpenItems>>) {
  const file = path.join(CACHE, `${log.logId}.json`);
  if (!fresh && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as ValidatedExtraction;
  const t0 = Date.now();
  const { parsed, model, usage } = await extractFacts(log, prior);
  const v = validateExtraction(log, seq, parsed, model, new Set(prior.map((p) => p.id)));
  fs.writeFileSync(file, JSON.stringify({ ...v, usage, ms: Date.now() - t0 }, null, 2));
  console.log(
    `  extracted ${log.logId}: ${v.facts.length} facts kept, ${v.rejected.length} rejected, ${v.warnings.length} warnings, ${((Date.now() - t0) / 1000).toFixed(1)}s, in/out tokens ${usage.input_tokens}/${usage.output_tokens}`,
  );
  return v;
}

async function buildGraph(name: string, logs: HandoverLog[]) {
  const g = await graph(name);
  try {
    await g.delete();
  } catch {
    // graph did not exist yet
  }
  for (const [i, log] of logs.entries()) {
    const meta = shiftMeta(log, i + 1);
    const prior = await priorOpenItems(g).catch(() => []);
    const ex = await extracted(log, meta.seq, prior);
    await ingestShift(g, log, meta, ex);
    console.log(`  loaded ${log.logId} (seq ${meta.seq}) into ${name}`);
  }
  const last = logs[logs.length - 1].logId;
  const report = await scan(g, last);
  fs.writeFileSync(path.join(REPORTS, `${name}.json`), JSON.stringify(report, null, 2));
  console.log(`  ${name}: ${report.findings.length} findings for handover after ${last}`);
  for (const f of report.findings) console.log(`    [${f.severity}] ${f.title}  (${f.evidence.map((e) => e.key).join(", ")})`);
  if (report.ignoredInstructions.length) console.log(`    ignored: ${report.ignoredInstructions.map((e) => e.key).join(", ")}`);
  if (report.unclear.length) console.log(`    unclear: ${report.unclear.map((e) => e.key).join(", ")}`);
  console.log(`    checked ${report.checked.lines} lines, beds ${report.checked.beds.join(" ")}`);
}

const files = (dir: string) =>
  fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".log.txt")).map((f) => path.join(dir, f)) : [];

async function main() {
  const ward = files(path.join(DATA_DIR, "ward"))
    .map(readLogFile)
    .sort((a, b) => Number(a.header.seq) - Number(b.header.seq));
  if (ward.length && (!only || only === "ward")) {
    console.log(`ward ${ward[0].header.ward}: ${ward.map((l) => l.logId).join(" -> ")}`);
    await buildGraph(wardGraph(ward[0].header.ward || "FMW"), ward);
  }
  for (const file of files(path.join(DATA_DIR, "eval"))) {
    const log = readLogFile(file);
    if (only && only !== log.logId && only !== "eval") continue;
    console.log(`eval ${log.logId}`);
    await buildGraph(`relayd_eval_${log.logId.replace(/[^A-Za-z0-9]/g, "")}`, [log]);
  }
  await (await db()).close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
