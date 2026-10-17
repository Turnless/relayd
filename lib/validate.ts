import type { HandoverLog } from "./log";
import type { Extraction, Fact, Rejection, ValidatedExtraction } from "./schema";

const BED = /^B\d{1,3}$/;

function hasToken(text: string, token: string) {
  return new RegExp(`(^|[^A-Za-z0-9])${token}([^A-Za-z0-9]|$)`).test(text);
}

/**
 * Deterministic gate between the LLM and the graph. The LLM proposes facts;
 * this code decides which ones are allowed in:
 *  - the cited line must exist,
 *  - the quote must be a verbatim substring of that line (no rewording),
 *  - a bed must appear on the cited line,
 *  - `resolves` must point at a known fact.
 * Anything that fails is dropped and recorded, never repaired.
 */
export function validateExtraction(
  log: HandoverLog,
  seq: number,
  proposed: Extraction,
  model: string,
  priorOpenIds: Set<string> = new Set(),
): ValidatedExtraction {
  const byTag = new Map(log.lines.map((l) => [l.tag, l]));
  const facts: Fact[] = [];
  const rejected: Rejection[] = [];
  const warnings: string[] = [];
  const localIds = new Set<string>();

  for (const p of proposed.facts) {
    const line = byTag.get(p.line);
    if (!line) {
      rejected.push({ factId: p.id, line: p.line, reason: "cited line does not exist", quote: p.quote });
      continue;
    }
    const quote = p.quote.trim();
    if (!quote || !line.text.includes(quote)) {
      rejected.push({ factId: p.id, line: p.line, reason: "quote is not a verbatim substring of the line", quote: p.quote });
      continue;
    }
    let bed = p.bed?.trim().toUpperCase() || null;
    if (bed && (!BED.test(bed) || !hasToken(line.text, bed))) {
      warnings.push(`${log.logId}:${p.id} bed ${bed} not on ${p.line}; bed dropped`);
      bed = null;
    }
    const id = `${log.logId}:${p.id}`;
    let resolves: string | null = null;
    if (p.resolves) {
      const local = `${log.logId}:${p.resolves}`;
      if (localIds.has(local)) resolves = local;
      else if (priorOpenIds.has(p.resolves)) resolves = p.resolves;
      else warnings.push(`${id} resolves unknown fact ${p.resolves}; link dropped`);
    }
    const bedsMentioned =
      p.kind === "summary_claim"
        ? p.beds_mentioned.map((b) => b.trim().toUpperCase()).filter((b) => BED.test(b) && hasToken(line.text, b))
        : [];
    facts.push({
      ...p,
      id,
      quote,
      bed,
      drug: p.drug?.trim().toLowerCase() || null,
      supply: p.supply?.trim().toLowerCase() || null,
      topic: p.topic?.trim().toLowerCase() || null,
      beds_mentioned: bedsMentioned,
      lineKey: line.key,
      lineTag: line.tag,
      resolves,
      t: seq * 1000 + line.n,
    });
    localIds.add(id);
  }
  return { logId: log.logId, model, extractedAt: new Date().toISOString(), facts, rejected, warnings };
}
