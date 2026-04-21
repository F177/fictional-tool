"use client";

import { useRef, useState, useCallback } from "react";
import type { DrawnShape, DrawTool } from "@/lib/api";
import { nanoid } from "@/lib/nanoid";

interface Props {
  shapes   : DrawnShape[];
  scale    : number;
  drawTool : DrawTool | null;
  drawColor: string;
  drawWidth: number;
  onAdd    : (shape: DrawnShape) => void;
}

function ShapeEl({ s, scale }: { s: DrawnShape; scale: number }) {
  const sw   = s.lineWidth * scale;
  const fill = s.fill ?? "none";
  const op   = s.opacity;

  if (s.tool === "pen" && s.points?.length) {
    const pts = s.points.map(([x, y]) => `${x * scale},${y * scale}`).join(" ");
    return <polyline points={pts} stroke={s.color} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={op} />;
  }
  if (s.tool === "rect") {
    return <rect x={(s.x ?? 0) * scale} y={(s.y ?? 0) * scale} width={(s.w ?? 0) * scale} height={(s.h ?? 0) * scale} stroke={s.color} strokeWidth={sw} fill={fill} opacity={op} />;
  }
  if (s.tool === "circle") {
    const rx = (s.w ?? 0) / 2 * scale;
    const ry = (s.h ?? 0) / 2 * scale;
    const cx = ((s.x ?? 0) + (s.w ?? 0) / 2) * scale;
    const cy = ((s.y ?? 0) + (s.h ?? 0) / 2) * scale;
    return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} stroke={s.color} strokeWidth={sw} fill={fill} opacity={op} />;
  }
  if (s.tool === "arrow") {
    const x1 = (s.x1 ?? 0) * scale, y1 = (s.y1 ?? 0) * scale;
    const x2 = (s.x2 ?? 0) * scale, y2 = (s.y2 ?? 0) * scale;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const al = Math.max(sw * 3.5, 8), aw = 0.45;
    const pts = `${x2},${y2} ${x2 - al * Math.cos(angle - aw)},${y2 - al * Math.sin(angle - aw)} ${x2 - al * Math.cos(angle + aw)},${y2 - al * Math.sin(angle + aw)}`;
    return (
      <g opacity={op}>
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={s.color} strokeWidth={sw} strokeLinecap="round" />
        <polygon points={pts} fill={s.color} />
      </g>
    );
  }
  return null;
}

export default function DrawingOverlay({ shapes, scale, drawTool, drawColor, drawWidth, onAdd }: Props) {
  const [draft, setDraft] = useState<DrawnShape | null>(null);
  const containerRef      = useRef<HTMLDivElement>(null);

  const startDraw = useCallback((e: React.MouseEvent) => {
    if (!drawTool || !containerRef.current) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = containerRef.current.getBoundingClientRect();
    const sx   = (e.clientX - rect.left) / scale;
    const sy   = (e.clientY - rect.top)  / scale;

    const base = { id: nanoid(), color: drawColor, lineWidth: drawWidth, opacity: 1 };
    let d: DrawnShape;
    if (drawTool === "pen") {
      d = { ...base, tool: "pen", points: [[sx, sy]] };
    } else if (drawTool === "rect" || drawTool === "circle") {
      d = { ...base, tool: drawTool, x: sx, y: sy, w: 0, h: 0 };
    } else {
      d = { ...base, tool: "arrow", x1: sx, y1: sy, x2: sx, y2: sy };
    }
    setDraft(d);

    const onMove = (ev: MouseEvent) => {
      const cx = (ev.clientX - rect.left) / scale;
      const cy = (ev.clientY - rect.top)  / scale;
      setDraft(prev => {
        if (!prev) return prev;
        if (prev.tool === "pen")
          return { ...prev, points: [...(prev.points ?? []), [cx, cy]] };
        if (prev.tool === "rect" || prev.tool === "circle")
          return { ...prev, w: cx - (prev.x ?? 0), h: cy - (prev.y ?? 0) };
        return { ...prev, x2: cx, y2: cy };
      });
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
      setDraft(prev => {
        if (prev) onAdd(prev);
        return null;
      });
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
  }, [drawTool, drawColor, drawWidth, scale, onAdd]);

  return (
    <div ref={containerRef} style={{ position: "absolute", inset: 0, zIndex: 8, pointerEvents: "none" }}>
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}>
        {shapes.map(s => <ShapeEl key={s.id} s={s} scale={scale} />)}
        {draft && <ShapeEl s={draft} scale={scale} />}
      </svg>
      {drawTool && (
        <div
          style={{ position: "absolute", inset: 0, cursor: "crosshair", pointerEvents: "auto", zIndex: 90 }}
          onMouseDown={startDraw}
        />
      )}
    </div>
  );
}
