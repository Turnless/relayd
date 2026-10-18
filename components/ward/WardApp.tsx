"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Board, BoardNode } from "@/lib/board";
import type { MedRow } from "@/lib/medicines";
import type { ScanResult } from "@/lib/rules";
import Logo from "@/components/Logo";
import BoardGraph from "./BoardGraph";
import { ICON, Icon } from "./icons";

type BoardResponse = {
  source: "live" | "cached";
  id: string;
  graphs: { id: string; label: string }[];
  ms: number;
  stats: { nodes: { label: string; n: number }[]; relationships: number } | null;
  report: ScanResult;
  board: Board;
  meds: MedRow[];
  error?: string;
};
type AskResponse = { answer: string; citations: { key: string; quote: string; valid: boolean }[]; model: string; ms: number; error?: string };
type Section = "attention" | "medicines" | "leftout" | "sorted" | "notes" | "ask" | "how";

const STARS = [[18, 6], [62, 11], [140, 4], [210, 14], [40, 22], [175, 27], [96, 33], [236, 38], [24, 47], [150, 52], [70, 61], [214, 66], [118, 74], [44, 86]];
const domId = (key: string) => `line-${key.replace(":", "-")}`;

export default function WardApp() {
  const [gid, setGid] = useState("ward");
  const [data, setData] = useState<BoardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("attention");
  const [pinned, setPinned] = useState(false);
  const [peek, setPeek] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [tab, setTab] = useState<string>("");
  const [bed, setBed] = useState<string | null>(null);
  const [fromGraph, setFromGraph] = useState(false);
  const [intro, setIntro] = useState(true);
  const [question, setQuestion] = useState("What carried over from earlier shifts?");
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<AskResponse | null>(null);

  // Keep the open section in the URL (?s=medicines), so a refresh or a shared link lands in the same place.
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("s");
    if (s && ["attention", "medicines", "leftout", "sorted", "notes", "ask", "how"].includes(s)) setSection(s as Section);
  }, []);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (section === "attention") url.searchParams.delete("s");
    else url.searchParams.set("s", section);
    window.history.replaceState(null, "", url);
  }, [section]);

  useEffect(() => {
    let live = true;
    setData(null);
    setError(null);
    fetch(`/api/board?g=${encodeURIComponent(gid)}`)
      .then((r) => r.json())
      .then((d: BoardResponse) => {
        if (!live) return;
        if (d.error) setError(d.error);
        else {
          setData(d);
          setTab(d.board.shifts[d.board.shifts.length - 1]?.id ?? "");
          setIntro(true);
          setTimeout(() => live && setIntro(false), 1500);
        }
      })
      .catch((e) => live && setError(String(e)));
    return () => {
      live = false;
    };
  }, [gid]);

  useEffect(() => {
    if (!focus) return;
    const t = setTimeout(() => document.getElementById(focus.includes("|") ? `med-${focus}` : domId(focus))?.scrollIntoView({ block: "center", behavior: "smooth" }), 120);
    return () => clearTimeout(t);
  }, [focus, section, tab]);

  const go = useCallback((s: Section, opts: { focus?: string | null; tab?: string; bed?: string | null; fromGraph?: boolean } = {}) => {
    setSection(s);
    setFocus(opts.focus ?? null);
    setBed(opts.bed ?? null);
    if (opts.tab) setTab(opts.tab);
    setFromGraph(!!opts.fromGraph);
    setHover(null);
  }, []);
  const openNote = useCallback((key: string, fromG = false) => go("notes", { tab: key.split(":")[0], focus: key, fromGraph: fromG }), [go]);

  const meds = data?.meds ?? [];
  const onPick = useCallback(
    (n: BoardNode) => {
      if (n.type === "patient") return go("notes", { tab: "bed", bed: n.data.bed, fromGraph: true });
      if (n.type === "band") return;
      if (n.data.target === "med") {
        const row = meds.find((m) => m.key === n.data.key) ?? meds.find((m) => m.bed === n.data.bed && m.tone === "red");
        if (row) return go("medicines", { focus: row.id, fromGraph: true });
      }
      openNote(n.data.key, true);
    },
    [go, openNote, meds],
  );

  const report = data?.report;
  const board = data?.board;
  const open = pinned || peek;
  const cited = useMemo(() => new Set(report?.findings.flatMap((f) => f.evidence.map((e) => e.key)) ?? []), [report]);
  const leftOut = useMemo(() => (board?.patients ?? []).filter((p) => p.notes.some((n) => n.startsWith("Left out of the handover summary"))), [board]);
  const flaggedMeds = meds.filter((m) => m.tone !== "ok").length;
  const last = board?.shifts[board.shifts.length - 1];

  const menu: [Section, string, string, number | null][] = [
    ["attention", "Needs attention", ICON.graph, board?.patients.length ?? null],
    ["medicines", "Medicines", ICON.pill, flaggedMeds || null],
    ["leftout", "Left out of handover", ICON.leftout, leftOut.length || null],
    ["sorted", "Sorted overnight", ICON.sorted, report?.resolved.length || null],
    ["notes", "Shift notes", ICON.note, board?.shifts.length ?? null],
    ["ask", "Ask", ICON.ask, null],
    ["how", "How it works", ICON.how, null],
  ];

  const ask = async () => {
    setAsking(true);
    setAnswer(null);
    try {
      const r = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ g: gid, question }) });
      setAnswer(await r.json());
    } catch (e) {
      setAnswer({ answer: "", citations: [], model: "", ms: 0, error: String(e) });
    } finally {
      setAsking(false);
    }
  };

  const lines = useMemo(() => {
    if (!board) return [];
    if (tab === "bed" && bed) {
      const token = new RegExp(`(^|[^A-Za-z0-9])B${bed}([^0-9]|$)`);
      let n = 0;
      return board.shifts.flatMap((s) => {
        const hits = s.lines.filter((l) => token.test(l.text));
        if (!hits.length) return [];
        return [
          { kind: "hdr" as const, key: `h-${s.id}`, text: `${s.label}${s.author ? `, written by ${s.author}` : ""}` },
          ...hits.map((l) => ({ kind: "ln" as const, key: l.key, num: l.tag, text: l.text, hit: cited.has(l.key), delay: cited.has(l.key) ? Math.min(n++ * 70, 560) + 200 : 0 })),
        ];
      });
    }
    const s = board.shifts.find((x) => x.id === tab) ?? board.shifts[board.shifts.length - 1];
    return s.lines.map((l) => ({ kind: "ln" as const, key: l.key, num: l.tag, text: l.text, hit: focus === l.key, cited: cited.has(l.key), delay: 220 }));
  }, [board, tab, bed, cited, focus]);

  const shiftTitle = (id: string) => board?.shifts.find((s) => s.id === id)?.label ?? id;

  return (
    <div className="wd">
      <div className="wd-dawn" aria-hidden="true">
        <i className="a" />
        <i className="b" />
        <i className="c" />
      </div>

      <div className="wd-rail" style={{ width: open ? 264 : 76 }}>
        <nav
          aria-label="Sections"
          className="wd-nav"
          style={{ width: open ? 264 : 76 }}
          onMouseEnter={() => setPeek(true)}
          onMouseLeave={() => setPeek(false)}
          // Keyboard focus opens the menu; it closes only when focus leaves the menu entirely,
          // so moving between menu items (or clicking a second one) never collapses it mid-click.
          onFocus={(e) => {
            if ((e.target as HTMLElement).matches(":focus-visible")) setPeek(true);
          }}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null) && !e.currentTarget.matches(":hover")) setPeek(false);
          }}
        >
          {STARS.map(([x, y], i) => (
            <span key={i} className="wd-star" style={{ left: x, top: `${y}%`, width: i % 4 === 0 ? 3 : 2, height: i % 4 === 0 ? 3 : 2, animationDuration: `${(4.5 + (i % 5) * 1.3).toFixed(1)}s`, animationDelay: `${((i * 0.7) % 5).toFixed(1)}s`, display: open || x < 70 ? "block" : "none" }} />
          ))}
          <Link href="/" className="wd-brand" aria-label="Relayd home page">
            <Logo size={32} />
            {open && (
              <span style={{ lineHeight: 1.2, whiteSpace: "nowrap" }}>
                <b>Relayd</b>
                <small>Female Medical Ward</small>
              </span>
            )}
          </Link>
          <button type="button" className="wd-item wd-pin" aria-pressed={pinned} aria-label={pinned ? "Let menu hide" : "Keep menu open"} onClick={() => setPinned((p) => !p)}>
            <span style={{ display: "flex", transform: pinned ? "none" : "scaleX(-1)", transition: "transform 220ms var(--ease)" }}>
              <Icon d={ICON.panel} />
            </span>
            {open && <span>{pinned ? "Let menu hide" : "Keep menu open"}</span>}
          </button>
          {menu.map(([id, label, icon, count]) => (
            <button key={id} type="button" className="wd-item" aria-current={section === id ? "page" : undefined} aria-label={count ? `${label}, ${count}` : label} title={label} onClick={() => go(id)}>
              <Icon d={icon} />
              {open && <span>{label}</span>}
              {open && count != null && <span className="count">{count}</span>}
            </button>
          ))}
          {open && <p className="wd-navnote">Demo ward. Patients and notes are made up. Nurses and doctors decide.</p>}
        </nav>
      </div>

      <main className="wd-main">
        <div className="wd-greet">
          <p className="hi">Good morning</p>
          <p className="when">{last ? `${last.info}${last.author ? `, written by ${last.author}` : ""}` : "Loading the handover"}</p>
        </div>

        {error && (
          <div className="wd-panel" role="alert" style={{ padding: 20 }}>
            The ward graph could not be loaded: {error}. Reload to try again.
          </div>
        )}

        {fromGraph && section !== "attention" && (
          <button type="button" className="wd-back" onClick={() => go("attention")}>
            <Icon d={ICON.back} size={16} width={2} />
            Back to the graph
          </button>
        )}

        {section === "attention" && (
          <section className="wd-section" aria-label="Needs attention">
            {!board && !error && <div className="wd-skeleton" role="status" aria-label="Loading the ward graph" />}
            {board && board.patients.length === 0 && (
              <div className="wd-panel" style={{ padding: 24 }}>
                <h1 className="wd-h1" style={{ color: "var(--ok)" }}>Nothing unsafe found</h1>
                <p className="wd-lede">
                  Checked {report?.checked.lines} entry lines across {report?.checked.beds.length} beds ({report?.checked.beds.join(", ")}). Open Shift notes to read them.
                </p>
              </div>
            )}
            {board && board.patients.length > 0 && (
              <>
                <ul className="wd-mobile-list" aria-label="Patients who need attention">
                  {board.patients.map((p) => (
                    <li key={p.bed}>
                      <button type="button" className={`wd-chip ${p.level === "act" ? "act" : ""}`} onClick={() => go("notes", { tab: "bed", bed: p.bed, fromGraph: true })}>
                        <span className="mono" style={{ fontSize: 20, fontWeight: 600, marginRight: 10 }}>{p.bed}</span>
                        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4, textAlign: "left" }}>
                          <span style={{ fontWeight: 600 }}>{p.name}: {p.headline}</span>
                          <span className={`wd-pill ${p.level}`}>{p.level === "act" ? "Act now" : "Check this shift"}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="wd-glass">
                  <BoardGraph board={board} hover={hover} intro={intro} onPick={onPick} onHover={setHover} />
                </div>
                <div className="wd-legend">
                  <span><i className="sw" style={{ background: "var(--act)" }} />Act now</span>
                  <span><i className="sw" style={{ background: "#E9A93A" }} />Check this shift</span>
                  <span><Icon d={ICON.note} size={15} width={1.9} />Opens the shift notes</span>
                  <span><Icon d={ICON.pill} size={15} width={1.9} />Opens Medicines</span>
                  <span className="hint">Select a patient to see everything written about them.</span>
                </div>
              </>
            )}
          </section>
        )}

        {section === "medicines" && (
          <section className="wd-section">
            <h1 className="wd-h1">Medicines in the last {board?.shifts.length ?? ""} shifts</h1>
            <p className="wd-lede">Every drug given, ordered or out of stock in the notes, checked against each patient&apos;s recorded allergies.</p>
            <div className="wd-panel" style={{ overflowX: "auto" }}>
              <table className="wd-table">
                <thead>
                  <tr>
                    <th scope="col">Drug</th>
                    <th scope="col">Bed</th>
                    <th scope="col">When</th>
                    <th scope="col">Relayd&apos;s check</th>
                    <th scope="col"><span className="sr-only">Note</span></th>
                  </tr>
                </thead>
                <tbody>
                  {meds.map((m) => (
                    <tr key={m.id} id={`med-${m.id}`} className={`${m.tone === "red" ? "red" : ""} ${focus === m.id ? "focus" : ""}`}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{m.drug}</div>
                        <div className="mono" style={{ fontSize: 13.5, color: "var(--ink-2)" }}>{m.quote}</div>
                      </td>
                      <td className="mono">{m.bed ?? "-"}</td>
                      <td className="mono" style={{ fontSize: 14, whiteSpace: "nowrap" }}>{m.when}</td>
                      <td><span className={`wd-check ${m.tone}`}>{m.check}</span></td>
                      <td style={{ textAlign: "right" }}>
                        <button type="button" className="wd-link" onClick={() => openNote(m.key)}>Open the note</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {section === "notes" && board && (
          <section className="wd-section">
            <h1 className="wd-h1">{tab === "bed" && bed ? `Everything written about bed ${bed}` : `${shiftTitle(tab)} notes`}</h1>
            <div className="wd-tabs" role="tablist" aria-label="Which notes">
              {bed && (
                <button type="button" role="tab" className="wd-tab" aria-selected={tab === "bed"} onClick={() => setTab("bed")}>
                  Bed {bed}, all shifts
                </button>
              )}
              {board.shifts.map((s) => (
                <button key={s.id} type="button" role="tab" className="wd-tab" aria-selected={tab === s.id} onClick={() => { setTab(s.id); setFocus(null); }}>
                  {s.label}
                </button>
              ))}
            </div>
            <p className="wd-lede" style={{ fontSize: 15, color: "var(--muted)" }}>
              {tab === "bed" && bed
                ? `Every line that mentions bed ${bed} across the last ${board.shifts.length} shifts, oldest first. Highlighted lines are behind a warning.`
                : (() => {
                    const s = board.shifts.find((x) => x.id === tab);
                    return s ? `${s.info}${s.author ? `, written by ${s.author}` : ""}.` : "";
                  })()}
            </p>
            <ol className="wd-panel wd-lines">
              {lines.map((l) =>
                l.kind === "hdr" ? (
                  <li key={l.key} className="hdr">{l.text}</li>
                ) : (
                  <li key={l.key} id={domId(l.key)} className="ln">
                    <span className="num">{l.num}</span>
                    <span className={l.hit ? "hit" : "cited" in l && l.cited ? "cited" : ""} style={l.hit ? { animationDelay: `${l.delay}ms` } : undefined}>{l.text}</span>
                  </li>
                ),
              )}
            </ol>
          </section>
        )}

        {section === "leftout" && report && (
          <section className="wd-section" style={{ maxWidth: 780 }}>
            <h1 className="wd-h1">Left out of the handover</h1>
            {report.summary ? (
              <>
                <blockquote className="wd-panel wd-quote">&ldquo;{report.summary.quote}&rdquo;</blockquote>
                <p className="wd-lede">
                  {leftOut.length
                    ? `This summary does not mention ${leftOut.length === 1 ? "the patient" : `the ${leftOut.length} patients`} who need attention:`
                    : "Every patient with a warning is mentioned in this summary."}
                </p>
                <div className="wd-chips">
                  {leftOut.map((p) => (
                    <button key={p.bed} type="button" className={`wd-chip ${p.level === "act" ? "act" : ""}`} onClick={() => go("notes", { tab: "bed", bed: p.bed })}>
                      Bed {p.bed}, {p.name}
                    </button>
                  ))}
                </div>
                <button type="button" className="wd-link" style={{ alignSelf: "flex-start" }} onClick={() => openNote(report.summary!.key)}>Open the summary line</button>
              </>
            ) : (
              <p className="wd-lede">No handover summary line was found in these notes.</p>
            )}
          </section>
        )}

        {section === "sorted" && report && (
          <section className="wd-section" style={{ maxWidth: 780 }}>
            <h1 className="wd-h1">Sorted overnight</h1>
            {report.resolved.length === 0 && <p className="wd-lede">No problem in these notes was marked as sorted.</p>}
            {report.resolved.map((r) => (
              <div key={r.opened.key + r.closed.key} className="wd-panel" style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "var(--ok)" }}>{r.bed ? `Bed ${r.bed.replace(/^B/, "")}` : "Ward"}: sorted</h2>
                <p style={{ margin: 0, color: "var(--ink-2)" }}>
                  &ldquo;{r.opened.quote}&rdquo;, then &ldquo;{r.closed.quote}&rdquo;
                </p>
                <div className="lp-row">
                  <button type="button" className="wd-link" onClick={() => openNote(r.opened.key)}>Open the first note</button>
                  <button type="button" className="wd-link" onClick={() => openNote(r.closed.key)}>Open the note that sorted it</button>
                </div>
              </div>
            ))}
          </section>
        )}

        {section === "ask" && (
          <section className="wd-section" style={{ maxWidth: 780 }}>
            <h1 className="wd-h1">Ask about this handover</h1>
            <form className="lp-row" onSubmit={(e) => { e.preventDefault(); if (question.trim() && !asking) ask(); }}>
              <label htmlFor="ask" className="sr-only">Your question</label>
              <input id="ask" name="question" autoComplete="off" className="wd-input" value={question} onChange={(e) => setQuestion(e.target.value)} />
              <button type="submit" className="wd-primary" disabled={asking || !question.trim()}>{asking ? "Reading the graph…" : "Ask"}</button>
            </form>
            <div className="wd-chips">
              {["What carried over from earlier shifts?", "Why is bed 6 flagged?", "Who noted bed 9's urine output, and was anyone told?"].map((q) => (
                <button key={q} type="button" className="wd-tab" onClick={() => setQuestion(q)}>{q}</button>
              ))}
            </div>
            {answer?.error && <div className="wd-panel" role="alert" style={{ padding: 18 }}>{answer.error}</div>}
            {answer && !answer.error && (
              <div aria-live="polite" className="wd-panel" style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ whiteSpace: "pre-wrap" }}>
                  {answer.answer.split(/(\[[A-Za-z0-9-]+:L\d{2,3}\s+"[^"]+"\]|\[citation removed:[^\]]+\])/g).map((part, i) => {
                    const m = part.match(/^\[([A-Za-z0-9-]+):(L\d{2,3})\s+"([^"]+)"\]$/);
                    if (m)
                      return (
                        <button key={i} type="button" className="wd-cite" title={m[3]} onClick={() => openNote(`${m[1]}:${m[2]}`)}>
                          {shiftTitle(m[1])}, {m[2]}
                        </button>
                      );
                    if (part.startsWith("[citation removed")) return <span key={i} className="wd-cite bad">quote removed: not word for word</span>;
                    return <span key={i}>{part}</span>;
                  })}
                </div>
                <p style={{ margin: 0, fontSize: 14, color: "var(--muted)" }}>
                  {answer.citations.filter((c) => c.valid).length} quotes checked word for word against the notes
                  {answer.citations.some((c) => !c.valid) ? `, ${answer.citations.filter((c) => !c.valid).length} removed` : ""}. {(answer.ms / 1000).toFixed(1)} s.
                </p>
              </div>
            )}
          </section>
        )}

        {section === "how" && (
          <section className="wd-section" style={{ maxWidth: 860 }}>
            <h1 className="wd-h1">How Relayd works</h1>
            <p className="wd-lede">
              Relayd reads each shift&apos;s notes into one ward graph in FalkorDB: patients, beds, notes, drugs, drug families, supplies and the nurses who wrote
              them. Safety checks are database queries over that graph, so every warning points back to the lines behind it.
            </p>
            {data && (
              <p className="wd-lede" style={{ fontSize: 15, color: "var(--muted)" }}>
                {data.source === "live" ? "Live from FalkorDB" : "Saved results (database unreachable)"}, {data.ms} ms
                {data.stats ? `, ${data.stats.nodes.reduce((a, b) => a + Number(b.n), 0)} nodes and ${data.stats.relationships} relationships in this graph` : ""}.
              </p>
            )}
            {report?.findings[0] && (
              <details className="wd-panel" style={{ padding: "16px 20px" }}>
                <summary style={{ cursor: "pointer", fontWeight: 500, color: "var(--accent)" }}>Show the database query behind the top warning</summary>
                <pre className="wd-pre">{report.findings[0].cypher}</pre>
              </details>
            )}
            {data && data.graphs.length > 1 && (
              <label style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                <span>Try another set of notes</span>
                <select className="wd-select" value={gid} onChange={(e) => { setGid(e.target.value); go("attention"); }}>
                  {data.graphs.map((g) => (
                    <option key={g.id} value={g.id}>{g.label}</option>
                  ))}
                </select>
              </label>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
