"use client";

import React, { createContext, memo, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Controls, Handle, Position, ReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Board, BoardNode } from "@/lib/board";
import { ICON, Icon } from "./icons";

type Handlers = {
  onPick: (n: BoardNode) => void;
  onHover: (id: string | null) => void;
};

/**
 * Hover, dimming and clicks travel through context, so the node list handed to
 * React Flow stays the same object between renders. Rebuilding it on hover makes
 * React Flow re-measure the nodes mid-click and the release lands on the pane.
 */
type Live = Handlers & { lit: Set<string> | null; hover: string | null; intro: boolean };
const LiveContext = createContext<Live>({ lit: null, hover: null, intro: false, onPick: () => {}, onHover: () => {} });

const levelText = (l: string) => (l === "act" ? "Act now" : "Check this shift");

function useNode(node: BoardNode) {
  const live = useContext(LiveContext);
  const dim = !!live.lit && !live.lit.has(node.id);
  const hot = live.hover === node.id;
  const cls = (base: string) => [base, "rf-node", dim ? "dim" : "", hot ? "hot" : "", live.intro ? "intro" : ""].filter(Boolean).join(" ");
  const events = {
    // Pointer release opens the node; onClick with detail 0 is keyboard activation (Enter / Space).
    onPointerUp: (e: React.PointerEvent) => {
      if (e.button === 0) live.onPick(node);
    },
    onClick: (e: React.MouseEvent) => {
      if (e.detail === 0) live.onPick(node);
    },
    onMouseEnter: () => live.onHover(node.id),
    onMouseLeave: () => live.onHover(null),
    onFocus: () => live.onHover(node.id),
    onBlur: () => live.onHover(null),
    style: { animationDelay: `${node.data.delay}ms` },
  };
  return { hot, cls, events };
}

const BandNode = memo(function BandNode({ data }: any) {
  const n = data.node as Extract<BoardNode, { type: "band" }>;
  return (
    <div className={`rf-band ${n.data.night ? "night" : "day"}`} style={{ animationDelay: `${n.data.delay}ms` }}>
      <div className="t">
        <Icon d={n.data.night ? ICON.moon : ICON.sun} size={16} width={1.8} />
        {n.data.label}
      </div>
      {n.data.author && <div className="a">Written by {n.data.author}</div>}
    </div>
  );
});

const PatientNode = memo(function PatientNode({ data }: any) {
  const n = data.node as Extract<BoardNode, { type: "patient" }>;
  const { hot, cls, events } = useNode(n);
  const level = n.data.level;
  return (
    <>
      <button
        type="button"
        className={`${cls("rf-patient")} ${level}${level === "act" && !hot ? " breathe" : ""}`}
        aria-label={`Bed ${n.data.bed}, ${n.data.name}, ${levelText(level)}. Opens everything written about bed ${n.data.bed}.`}
        {...events}
      >
        {level === "act" && <span className="band" />}
        <span className="row">
          <span className="bed">{n.data.bed}</span>
          <span className="name">{n.data.name}</span>
        </span>
        <span className={`wd-pill ${level}`}>{levelText(level)}</span>
      </button>
      <Handle type="source" position={Position.Right} id="r" isConnectable={false} />
    </>
  );
});

const FactNode = memo(function FactNode({ data }: any) {
  const n = data.node as Extract<BoardNode, { type: "fact" }>;
  const { cls, events } = useNode(n);
  const dest = n.data.target === "med" ? "Opens Medicines" : "Opens the shift notes";
  return (
    <>
      <Handle type="target" position={Position.Left} id="l" isConnectable={false} />
      <Handle type="target" position={Position.Top} id="t" isConnectable={false} />
      <button type="button" className={cls("rf-fact")} aria-label={`${n.data.title}${n.data.time ? ", " + n.data.time : ""}. ${dest}.`} {...events}>
        <span className="top">
          <span className="title">{n.data.title}</span>
          <Icon d={n.data.target === "med" ? ICON.pill : ICON.note} size={15} width={1.9} />
        </span>
        {n.data.time && <span className="time">{n.data.time}</span>}
      </button>
      <Handle type="source" position={Position.Right} id="r" isConnectable={false} />
      <Handle type="source" position={Position.Bottom} id="b" isConnectable={false} />
    </>
  );
});

const SharedNode = memo(function SharedNode({ data }: any) {
  const n = data.node as Extract<BoardNode, { type: "shared" }>;
  const { cls, events } = useNode(n);
  return (
    <>
      <Handle type="target" position={Position.Top} id="t" isConnectable={false} />
      <button type="button" className={`${cls("rf-shared")} ${n.data.tone}`} aria-label={`${n.data.title}, shared by notes on different shifts.`} {...events}>
        {n.data.title}
        <Icon d={n.data.target === "med" ? ICON.pill : ICON.note} size={15} width={1.9} />
      </button>
    </>
  );
});

const nodeTypes = { band: BandNode, patient: PatientNode, fact: FactNode, shared: SharedNode };

const EDGE_COLOR = { thread: "#B7ADB5", red: "#C8323C", amber: "#B87400" };

export default function BoardGraph({ board, hover, intro, onPick, onHover }: { board: Board; hover: string | null; intro: boolean } & Handlers) {
  const lit = useMemo(() => {
    if (!hover) return null;
    const set = new Set<string>([hover]);
    const h = board.nodes.find((n) => n.id === hover);
    if (h && h.type === "patient") for (const n of board.nodes) if (n.type !== "band" && n.data.bed === h.data.bed) set.add(n.id);
    for (const e of board.edges) {
      if (e.source === hover) set.add(e.target);
      if (e.target === hover) set.add(e.source);
    }
    return set;
  }, [hover, board]);

  const nodes: Node[] = useMemo(
    () =>
      board.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: { x: n.x, y: n.y },
        // Non-draggable, non-selectable nodes are click-through by default; the buttons inside must receive pointer events.
        style: { width: n.w, height: n.h, pointerEvents: n.type === "band" ? "none" : "all" },
        className: n.type === "band" ? undefined : "nopan",
        draggable: false,
        selectable: false,
        focusable: false,
        zIndex: n.type === "band" ? -1 : 1,
        data: { node: n },
      })),
    [board],
  );

  const pos = useMemo(() => new Map(board.nodes.map((n) => [n.id, n])), [board]);
  const edges: Edge[] = useMemo(
    () =>
      board.edges.map((e) => {
        const a = pos.get(e.source)!, b = pos.get(e.target)!;
        const stacked = e.kind === "thread" && Math.abs(a.x - b.x) < 4;
        const on = !lit || (lit.has(e.source) && lit.has(e.target));
        const thread = e.kind === "thread";
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.kind !== "thread" || stacked ? "b" : "r",
          targetHandle: e.kind !== "thread" || stacked ? "t" : "l",
          type: thread ? "default" : "smoothstep",
          style: {
            stroke: EDGE_COLOR[e.kind],
            strokeWidth: lit && on ? 3 : 2,
            opacity: on ? 1 : 0.25,
            transition: "opacity 180ms ease",
            ...(thread
              ? intro
                ? { strokeDasharray: 1400, animation: `rl-draw 700ms cubic-bezier(.16,1,.3,1) ${e.delay}ms both` }
                : {}
              : { strokeDasharray: "6 5", ...(intro ? { animation: `rl-fade 500ms ease ${e.delay}ms both` } : {}) }),
          },
        };
      }),
    [pos, board, lit, intro],
  );

  const live = useMemo<Live>(() => ({ lit, hover, intro, onPick, onHover }), [lit, hover, intro, onPick, onHover]);

  // Height follows the available width, so a narrow screen gets a short graph instead of a tall empty box.
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(board.width + 120);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = Math.min(1, width / (board.width + 120));
  const height = Math.max(320, Math.round((board.height + 190) * scale));

  return (
    <LiveContext.Provider value={live}>
      <div ref={box} style={{ height, width: "100%" }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.05, maxZoom: 1 }}
          minZoom={0.3}
          maxZoom={1.6}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          zoomOnScroll={false}
          zoomOnDoubleClick={false}
          panOnScroll={false}
          preventScrolling={false}
        >
          <Controls showInteractive={false} position="bottom-right" />
        </ReactFlow>
      </div>
    </LiveContext.Provider>
  );
}
