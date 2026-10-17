import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, readLogFile, type HandoverLog } from "./log";
import { wardGraph } from "./falkor";

export type GraphEntry = {
  id: string; // short id used in URLs: "ward" or an eval log id
  graph: string; // FalkorDB graph name
  label: string;
  lastShift: string;
  logs: HandoverLog[];
};

function logsIn(dir: string) {
  const d = path.join(DATA_DIR, dir);
  return fs.existsSync(d)
    ? fs
        .readdirSync(d)
        .filter((f) => f.endsWith(".log.txt"))
        .map((f) => readLogFile(path.join(d, f)))
    : [];
}

export function catalog(): GraphEntry[] {
  const ward = logsIn("ward").sort((a, b) => Number(a.header.seq) - Number(b.header.seq));
  const out: GraphEntry[] = [];
  if (ward.length) {
    out.push({
      id: "ward",
      graph: wardGraph(ward[0].header.ward || "FMW"),
      label: `Ward ${ward[0].header.ward || "FMW"}: ${ward.length} linked shifts`,
      lastShift: ward[ward.length - 1].logId,
      logs: ward,
    });
  }
  for (const log of logsIn("eval")) {
    out.push({
      id: log.logId,
      graph: `relayd_eval_${log.logId.replace(/[^A-Za-z0-9]/g, "")}`,
      label: `Eval log ${log.logId} (single shift)`,
      lastShift: log.logId,
      logs: [log],
    });
  }
  return out;
}

export function entry(id: string | null | undefined): GraphEntry {
  const all = catalog();
  return all.find((e) => e.id === id) ?? all[0];
}

/** Cached report written by `npm run graph`; used when the database is unreachable. */
export function cachedReport(graphName: string) {
  const f = path.join(DATA_DIR, "reports", `${graphName}.json`);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null;
}
