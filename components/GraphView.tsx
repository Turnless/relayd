"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

type Node = { id: string; label: string; kind: string; title: string };
type Link = { source: string; target: string; rel: string };

const COLORS: Record<string, string> = {
  Patient: "#0f6e6a",
  Fact: "#6b7280",
  Shift: "#7c3aed",
  Drug: "#b42318",
  DrugClass: "#b54708",
  Supply: "#2563eb",
};

export default function GraphView({ g, bed, highlight }: { g: string; bed: string; highlight?: string[] }) {
  const [data, setData] = useState<{ nodes: Node[]; links: Link[]; cypher: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);

  useEffect(() => {
    setData(null);
    fetch(`/api/subgraph?g=${encodeURIComponent(g)}&bed=${encodeURIComponent(bed)}`)
      .then((r) => r.json())
      .then((d) => (d.error ? setErr(d.error) : setData(d)))
      .catch((e) => setErr(String(e)));
  }, [g, bed]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const hl = useMemo(() => new Set(highlight ?? []), [highlight]);
  const graphData = useMemo(
    () => (data ? { nodes: data.nodes.map((n) => ({ ...n })), links: data.links.map((l) => ({ ...l })) } : { nodes: [], links: [] }),
    [data],
  );

  return (
    <div>
      <div className="gv" ref={box}>
        {err && <p className="empty" style={{ padding: 10 }}>Graph view unavailable: {err}</p>}
        {!err && !data && <p className="empty" style={{ padding: 10 }}>Loading the graph around {bed}...</p>}
        {data && (
          <ForceGraph2D
            graphData={graphData}
            width={width}
            height={340}
            cooldownTicks={80}
            linkDirectionalArrowLength={4}
            linkDirectionalArrowRelPos={1}
            linkLabel={(l: any) => l.rel}
            nodeLabel={(n: any) => n.title}
            linkColor={() => "rgba(120,130,145,0.6)"}
            nodeCanvasObject={(n: any, ctx, scale) => {
              const r = n.kind === "Patient" ? 7 : n.kind === "Fact" ? 4 : 5.5;
              const lit = hl.size === 0 || hl.has(n.id) || n.kind !== "Fact" || [...hl].some((h) => n.title?.startsWith(h));
              ctx.globalAlpha = lit ? 1 : 0.35;
              ctx.beginPath();
              ctx.arc(n.x, n.y, r, 0, 2 * Math.PI);
              ctx.fillStyle = COLORS[n.kind] ?? "#888";
              ctx.fill();
              const fs = Math.max(10 / scale, 2.5);
              ctx.font = `${fs}px sans-serif`;
              ctx.fillStyle = getComputedStyle(document.body).color;
              ctx.textAlign = "center";
              ctx.fillText(n.label, n.x, n.y + r + fs);
              ctx.globalAlpha = 1;
            }}
          />
        )}
      </div>
      <div className="chips">
        {Object.entries(COLORS).map(([k, c]) => (
          <span key={k} className="chip" style={{ color: c, borderColor: c }}>
            {k}
          </span>
        ))}
      </div>
      {data && (
        <details>
          <summary>Cypher for this view</summary>
          <pre>{data.cypher}</pre>
        </details>
      )}
    </div>
  );
}
