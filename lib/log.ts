import fs from "node:fs";
import path from "node:path";

export type LogLine = {
  /** Globally unique citation key, e.g. "FMW-N1:L04". */
  key: string;
  logId: string;
  /** Line tag as written in the log, e.g. "L04". */
  tag: string;
  /** 1-based position of the entry, used for ordering. */
  n: number;
  text: string;
};

export type HandoverLog = {
  logId: string;
  header: Record<string, string>;
  lines: LogLine[];
  raw: string;
};

const ENTRY = /^(L\d{2,3}) \| (.*)$/;

/** Parse the plain-text handover format described in docs/log-format.md. */
export function parseLog(raw: string, fallbackId = "LOG"): HandoverLog {
  const header: Record<string, string> = {};
  const lines: LogLine[] = [];
  for (const row of raw.split(/\r?\n/)) {
    if (row.startsWith("#")) {
      const m = row.match(/^#\s*([a-z_]+):\s*(.*)$/i);
      if (m) header[m[1].toLowerCase()] = m[2].trim();
      continue;
    }
    const m = row.match(ENTRY);
    if (!m) continue;
    lines.push({ key: "", logId: "", tag: m[1], n: lines.length + 1, text: m[2] });
  }
  const logId = header.log_id || fallbackId;
  for (const l of lines) {
    l.logId = logId;
    l.key = `${logId}:${l.tag}`;
  }
  return { logId, header, lines, raw };
}

export function readLogFile(file: string): HandoverLog {
  return parseLog(fs.readFileSync(file, "utf8"), path.basename(file).split(".")[0]);
}

export const DATA_DIR = path.join(process.cwd(), "data");
