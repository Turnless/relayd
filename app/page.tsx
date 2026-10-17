"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import GraphView from "@/components/GraphView";

type Evidence = { key: string; quote: string; text: string; shift: string };
type Finding = {
  rule: string;
  severity: "critical" | "high" | "medium";
  bed: string | null;
  patient: string | null;
  title: string;
  claim: string;
  evidence: Evidence[];
  path: { from: string; rel: string; to: string }[];
  cypher: string;
  notes: string[];
};
type Report = {
  shift: string;
  findings: Finding[];
  ignoredInstructions: Evidence[];
  unclear: (Evidence & { bed: string | null })[];
  resolved: { bed: string | null; opened: Evidence; closed: Evidence }[];
  summary: Evidence | null;
  checked: { lines: number; beds: string[] };
};
type ScanResponse = {
  source: "live" | "cached";
  ms: number;
  stats: { nodes: { label: string; n: number }[]; relationships: number } | null;
  report: Report;
  error?: string;
};
type Line = { key: string; tag: string; n: number; text: string };
type LogEntry = { logId: string; header: Record<string, string>; lines: Line[] };
type Catalog = { id: string; label: string; graph: string; lastShift: string; logs: LogEntry[] }[];
type AskResponse = {
  answer: string;
  citations: { key: string; quote: string; valid: boolean; reason?: string }[];
  trace: { tool: string; input: unknown; cypher: string; rows: number; ms: number }[];
  model: string;
  ms: number;
  usage: { input: number; output: number };
  error?: string;
};

const SUGGESTED = [
  "What is unsafe at this handover, and why?",
  "Why is bed 6 flagged? Show me the lines.",
  "Which problems have carried over from earlier shifts?",
  "Who has noted bed 9's urine output, and was anyone told?",
];

function Highlight({ text, quote }: { text: string; quote: string }) {
  const i = text.indexOf(quote);
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark>{quote}</mark>
      {text.slice(i + quote.length)}
    </>
  );
}

function renderAnswer(answer: string, onKey: (k: string) => void) {
  const parts = answer.split(/(\[[A-Za-z0-9-]+:L\d{2,3}\s+"[^"]+"\]|\[citation removed:[^\]]+\])/g);
  return parts.map((p, i) => {
    const m = p.match(/^\[([A-Za-z0-9-]+:L\d{2,3})\s+"([^"]+)"\]$/);
    if (m)
      return (
        <span key={i}>
          {" "}
          <button className="key" onClick={() => onKey(m[1])} title={m[2]}>
            {m[1]}
          </button>
        </span>
      );
    if (p.startsWith("[citation removed")) return <span key={i} className="cite-bad">{p}</span>;
    return <span key={i}>{p}</span>;
  });
}

export default function Page() {
  const [catalog, setCatalog] = useState<Catalog>([]);
  const [gid, setGid] = useState("ward");
  const [scan, setScan] = useState<ScanResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [openPath, setOpenPath] = useState<number | null>(0);
  const [q, setQ] = useState(SUGGESTED[0]);
  const [asking, setAsking] = useState(false);
  const [ans, setAns] = useState<AskResponse | null>(null);

  useEffect(() => {
    fetch("/api/logs")
      .then((r) => r.json())
      .then((c: Catalog) => setCatalog(c));
  }, []);

  const current = catalog.find((c) => c.id === gid);

  const runScan = useCallback(() => {
    setLoading(true);
    setScan(null);
    fetch(`/api/scan?g=${encodeURIComponent(gid)}`)
      .then((r) => r.json())
      .then((d) => setScan(d))
      .finally(() => setLoading(false));
  }, [gid]);

  useEffect(() => {
    if (current) {
      setTab(current.lastShift);
      setAns(null);
      setOpenPath(0);
      runScan();
    }
  }, [current, runScan]);

  const cited = useMemo(() => {
    const s = new Set<string>();
    scan?.report?.findings.forEach((f) => f.evidence.forEach((e) => s.add(e.key)));
    ans?.citations.forEach((c) => c.valid && s.add(c.key));
    return s;
  }, [scan, ans]);

  const jump = (key: string) => {
    const shift = key.split(":")[0];
    setTab(shift);
    setFocus(key);
    setTimeout(() => document.getElementById(`line-${key}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 50);
  };

  const askNow = async () => {
    setAsking(true);
    setAns(null);
    try {
      const r = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ g: gid, question: q }),
      });
      setAns(await r.json());
    } finally {
      setAsking(false);
    }
  };

  const r = scan?.report;
  const log = current?.logs.find((l) => l.logId === tab) ?? current?.logs[current.logs.length - 1];
  const summaryText = r?.summary?.quote;

  return (
    <main className="wrap">
      <div className="top">
        <div className="brand">
          Relay<span>d</span>
        </div>
        <div className="tag">Shift handover check. Every warning is a graph path back to the exact line in the notes.</div>
      </div>
      <div className="chips">
        <span className="chip">FalkorDB</span>
        <span className="chip">Graph Hacks 2026 · Track 01 + 02</span>
        <span className="chip warn">SYNTHETIC DATA: not real patients</span>
        <span className="chip">Not a medical device</span>
      </div>

      <p className="hero">
        The night notes end with <q>{summaryText ?? "quiet night ... nil else"}</q>. Relayd reads every shift into one ward graph and
        follows the connections between them before the morning team takes over.
      </p>

      <div className="bar">
        <select value={gid} onChange={(e) => setGid(e.target.value)} aria-label="Choose graph">
          {catalog.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <button className="btn ghost" onClick={runScan} disabled={loading}>
          {loading ? "Checking..." : "Re-run handover check"}
        </button>
        {scan && !scan.error && (
          <span className="meta">
            {scan.source === "live" ? "Live from FalkorDB" : "Cached result (database unreachable)"} · {scan.ms} ms
            {scan.stats && ` · ${scan.stats.nodes.reduce((a, b) => a + Number(b.n), 0)} nodes, ${scan.stats.relationships} relationships`}
          </span>
        )}
      </div>

      <div className="grid">
        <section className="stack">
          <div className="panel">
            <h2>
              Handover check after {r?.shift ?? "..."}
              {r && <span className="meta"> · {r.findings.length} warning{r.findings.length === 1 ? "" : "s"}</span>}
            </h2>
            {scan?.error && <p className="cite-bad">{scan.error}</p>}
            {loading && <p className="empty">Running the safety rules over the graph...</p>}
            {r && r.findings.length === 0 && (
              <p className="ok">
                Nothing unsafe found. Checked {r.checked.lines} entry lines, {r.checked.beds.length} beds ({r.checked.beds.join(", ")}).
              </p>
            )}
            <div className="stack">
              {r?.findings.map((f, i) => (
                <article key={i} className={`finding ${f.severity}`}>
                  <div>
                    <span className={`sev ${f.severity}`}>{f.severity}</span>
                    <span className="ftitle">{f.title}</span>
                  </div>
                  <p className="claim">{f.claim}</p>
                  {f.notes.length > 0 && (
                    <ul className="notes">
                      {f.notes.map((n, j) => (
                        <li key={j}>{n}</li>
                      ))}
                    </ul>
                  )}
                  <ul className="ev">
                    {f.evidence.map((e) => (
                      <li key={e.key + e.quote}>
                        <button className="key" onClick={() => jump(e.key)}>
                          {e.key}
                        </button>
                        <span>
                          <Highlight text={e.text} quote={e.quote} />
                        </span>
                      </li>
                    ))}
                  </ul>
                  <details open={openPath === i} onToggle={(ev) => (ev.currentTarget as HTMLDetailsElement).open && setOpenPath(i)}>
                    <summary>Graph path and Cypher behind this warning</summary>
                    <div className="path">
                      {f.path.map((p, j) => (
                        <span key={j}>
                          <span className="node">{p.from}</span> <span className="rel">-[{p.rel}]-&gt;</span> <span className="node">{p.to}</span>
                        </span>
                      ))}
                    </div>
                    <pre>{f.cypher}</pre>
                    {openPath === i && f.bed && <GraphView g={gid} bed={f.bed} />}
                  </details>
                </article>
              ))}
            </div>

            {r && (
              <>
                <h3>Ignored instructions</h3>
                {r.ignoredInstructions.length === 0 ? (
                  <p className="empty">None found in the notes.</p>
                ) : (
                  <ul className="ev">
                    {r.ignoredInstructions.map((e) => (
                      <li key={e.key}>
                        <button className="key" onClick={() => jump(e.key)}>
                          {e.key}
                        </button>
                        <span>
                          <Highlight text={e.text} quote={e.quote} /> <span className="muted">· treated as log text, not followed</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <h3>Unclear, check the chart</h3>
                {r.unclear.length === 0 ? (
                  <p className="empty">Nothing ambiguous recorded.</p>
                ) : (
                  <ul className="ev">
                    {r.unclear.map((e) => (
                      <li key={e.key + e.quote}>
                        <button className="key" onClick={() => jump(e.key)}>
                          {e.key}
                        </button>
                        <span>
                          <Highlight text={e.text} quote={e.quote} />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <h3>Resolved during the shift</h3>
                {r.resolved.length === 0 ? (
                  <p className="empty">No resolved items linked.</p>
                ) : (
                  <ul className="ev">
                    {r.resolved.map((x) => (
                      <li key={x.opened.key + x.closed.key}>
                        <button className="key" onClick={() => jump(x.opened.key)}>
                          {x.opened.key}
                        </button>
                        <span>
                          {x.opened.quote} <span className="muted">resolved at</span>{" "}
                          <button className="key" onClick={() => jump(x.closed.key)}>
                            {x.closed.key}
                          </button>{" "}
                          {x.closed.quote}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="meta">
                  Checked {r.checked.lines} entry lines in {r.shift}; beds with recorded facts: {r.checked.beds.join(", ") || "none"}.
                </p>
              </>
            )}
          </div>

          <div className="panel">
            <h2>Ask the ward graph</h2>
            <p className="small muted">
              Claude picks read-only graph tools; every citation in the answer is checked against the line it names, and any quote that
              is not verbatim is removed.
            </p>
            <div className="chips" style={{ marginBottom: 8 }}>
              {SUGGESTED.map((s) => (
                <button key={s} className="chip" onClick={() => setQ(s)}>
                  {s}
                </button>
              ))}
            </div>
            <div className="bar">
              <input type="text" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 220 }} aria-label="Question" />
              <button className="btn" onClick={askNow} disabled={asking || !q.trim()}>
                {asking ? "Thinking..." : "Ask"}
              </button>
            </div>
            {ans?.error && <p className="cite-bad">{ans.error}</p>}
            {ans && !ans.error && (
              <>
                <div className="answer">{renderAnswer(ans.answer, jump)}</div>
                <p className="meta">
                  {ans.citations.filter((c) => c.valid).length} citations verified
                  {ans.citations.some((c) => !c.valid) && `, ${ans.citations.filter((c) => !c.valid).length} removed`} · {ans.model} ·{" "}
                  {(ans.ms / 1000).toFixed(1)} s · {ans.usage.input + ans.usage.output} tokens
                </p>
                <details>
                  <summary>Graph tools the agent called ({ans.trace.length})</summary>
                  <ul className="trace">
                    {ans.trace.map((t, i) => (
                      <li key={i}>
                        <code>{t.tool}</code>({JSON.stringify(t.input)}) · {t.rows} rows · {t.ms} ms
                        <pre>{t.cypher}</pre>
                      </li>
                    ))}
                  </ul>
                </details>
              </>
            )}
          </div>
        </section>

        <aside className="panel">
          <h2>Shift notes in the graph</h2>
          <div className="tabs">
            {current?.logs.map((l) => (
              <button key={l.logId} className={l.logId === log?.logId ? "on" : ""} onClick={() => setTab(l.logId)}>
                {l.logId}
              </button>
            ))}
          </div>
          {log && (
            <>
              <div className="loghead">
                {log.header.shift ?? log.header.setting} · written by {log.header.author ?? "unknown"}
              </div>
              <div className="log">
                {log.lines.map((l) => (
                  <div
                    key={l.key}
                    id={`line-${l.key}`}
                    className={`${cited.has(l.key) ? "cited" : ""} ${focus === l.key ? "focus" : ""}`}
                  >
                    <span className="tagc">{l.tag}</span>
                    <span>{l.text}</span>
                  </div>
                ))}
              </div>
              <p className="meta">Highlighted lines are cited by a warning or an answer.</p>
            </>
          )}
        </aside>
      </div>

      <footer>
        All patients, staff and notes are invented. Relayd points to risks and the lines behind them; nurses and doctors decide. Source:{" "}
        <a href="https://github.com/Turnless/relayd">github.com/Turnless/relayd</a>
      </footer>
    </main>
  );
}
