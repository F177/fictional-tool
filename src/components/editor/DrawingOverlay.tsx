"use client";

import { useRef, useState, useCallback } from "react";
import { X } from "lucide-react";
import type { DrawnShape, DrawTool } from "@/lib/api";
import { nanoid } from "@/lib/nanoid";

interface Props {
  shapes         : DrawnShape[];
  scale          : number;
  drawTool       : DrawTool | null;
  drawColor      : string;
  drawWidth      : number;
  drawFill       : string | null;
  drawOpacity    : number;
  onAdd          : (shape: DrawnShape) => void;
  selectedShapeId: string | null;
  onSelectShape  : (id: string | null) => void;
  onEditShape    : (shape: DrawnShape) => void;
  onDelete?      : (id: string) => void;
}

function starPoints(cx: number, cy: number, outerR: number, innerR: number, points = 5): string {
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const angle = (Math.PI / points) * i - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    pts.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
  }
  return pts.join(" ");
}

function ShapeEl({ s, scale }: { s: DrawnShape; scale: number }) {
  const sw   = s.lineWidth * scale;
  const fill = s.fill ?? "none";
  const op   = s.opacity;

  if (s.tool === "pen" && s.points?.length) {
    const pts = s.points.map(([x, y]) => `${x * scale},${y * scale}`).join(" ");
    return <polyline points={pts} stroke={s.color} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={op} />;
  }
  if (s.tool === "line") {
    const x1 = (s.x1 ?? 0) * scale, y1 = (s.y1 ?? 0) * scale;
    const x2 = (s.x2 ?? 0) * scale, y2 = (s.y2 ?? 0) * scale;
    return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={s.color} strokeWidth={sw} strokeLinecap="round" opacity={op} />;
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
  if (s.tool === "triangle") {
    const x = (s.x ?? 0) * scale, y = (s.y ?? 0) * scale;
    const w = (s.w ?? 0) * scale, h = (s.h ?? 0) * scale;
    const pts = `${x + w / 2},${y} ${x},${y + h} ${x + w},${y + h}`;
    return <polygon points={pts} stroke={s.color} strokeWidth={sw} fill={fill} opacity={op} />;
  }
  if (s.tool === "diamond") {
    const x = (s.x ?? 0) * scale, y = (s.y ?? 0) * scale;
    const w = (s.w ?? 0) * scale, h = (s.h ?? 0) * scale;
    const pts = `${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}`;
    return <polygon points={pts} stroke={s.color} strokeWidth={sw} fill={fill} opacity={op} />;
  }
  if (s.tool === "star") {
    const x = (s.x ?? 0) * scale, y = (s.y ?? 0) * scale;
    const w = (s.w ?? 0) * scale, h = (s.h ?? 0) * scale;
    const cx = x + w / 2, cy = y + h / 2;
    const outerR = Math.min(Math.abs(w), Math.abs(h)) / 2;
    const pts = starPoints(cx, cy, outerR, outerR * 0.4);
    return <polygon points={pts} stroke={s.color} strokeWidth={sw} fill={fill} opacity={op} />;
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

const BOX_TOOLS  = new Set<DrawTool>(["rect", "circle", "triangle", "diamond", "star"]);
const LINE_TOOLS = new Set<DrawTool>(["arrow", "line"]);

function shapeBBox(s: DrawnShape): { x: number; y: number; w: number; h: number } {
  if (s.tool === "line" || s.tool === "arrow") {
    const x1 = s.x1 ?? 0, y1 = s.y1 ?? 0, x2 = s.x2 ?? 0, y2 = s.y2 ?? 0;
    return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
  }
  if (s.tool === "pen" && s.points?.length) {
    const xs = s.points.map(p => p[0]);
    const ys = s.points.map(p => p[1]);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
  }
  return { x: s.x ?? 0, y: s.y ?? 0, w: s.w ?? 10, h: s.h ?? 10 };
}

function computeResize(s: DrawnShape, handle: string, ddxPt: number, ddyPt: number): DrawnShape {
  if (s.tool === "line" || s.tool === "arrow") {
    if (handle === "p1") return { ...s, x1: (s.x1 ?? 0) + ddxPt, y1: (s.y1 ?? 0) + ddyPt };
    return { ...s, x2: (s.x2 ?? 0) + ddxPt, y2: (s.y2 ?? 0) + ddyPt };
  }
  let x = s.x ?? 0, y = s.y ?? 0, w = s.w ?? 10, h = s.h ?? 10;
  if (handle.includes("e")) w = Math.max(10, w + ddxPt);
  if (handle.includes("s")) h = Math.max(10, h + ddyPt);
  if (handle.includes("w")) { x += ddxPt; w = Math.max(10, w - ddxPt); }
  if (handle.includes("n")) { y += ddyPt; h = Math.max(10, h - ddyPt); }
  return { ...s, x, y, w, h };
}

function translateShape(s: DrawnShape, ddxPt: number, ddyPt: number): DrawnShape {
  if (s.tool === "line" || s.tool === "arrow") {
    return { ...s, x1: (s.x1 ?? 0) + ddxPt, y1: (s.y1 ?? 0) + ddyPt, x2: (s.x2 ?? 0) + ddxPt, y2: (s.y2 ?? 0) + ddyPt };
  }
  if (s.tool === "pen" && s.points) {
    return { ...s, points: s.points.map(([px, py]) => [px + ddxPt, py + ddyPt]) };
  }
  return { ...s, x: (s.x ?? 0) + ddxPt, y: (s.y ?? 0) + ddyPt };
}

export default function DrawingOverlay({
  shapes, scale, drawTool, drawColor, drawWidth, drawFill, drawOpacity, onAdd,
  selectedShapeId, onSelectShape, onEditShape, onDelete,
}: Props) {
  const [draft, setDraft] = useState<DrawnShape | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const latestDraft  = useRef<DrawnShape | null>(null);

  const selectionMode = drawTool === null;

  const startDraw = useCallback((e: React.MouseEvent) => {
    if (!drawTool || !containerRef.current) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = containerRef.current.getBoundingClientRect();
    const sx   = (e.clientX - rect.left) / scale;
    const sy   = (e.clientY - rect.top)  / scale;

    const base = { id: nanoid(), color: drawColor, lineWidth: drawWidth, opacity: drawOpacity, fill: drawFill };
    let d: DrawnShape;
    if (drawTool === "pen") {
      d = { ...base, tool: "pen", points: [[sx, sy]] };
    } else if (BOX_TOOLS.has(drawTool)) {
      d = { ...base, tool: drawTool as "rect" | "circle" | "triangle" | "diamond" | "star", x: sx, y: sy, w: 0, h: 0 };
    } else {
      d = { ...base, tool: drawTool as "arrow" | "line", x1: sx, y1: sy, x2: sx, y2: sy };
    }
    latestDraft.current = d;
    setDraft(d);

    const onMove = (ev: MouseEvent) => {
      const cx = (ev.clientX - rect.left) / scale;
      const cy = (ev.clientY - rect.top)  / scale;
      setDraft(prev => {
        if (!prev) return prev;
        let next: DrawnShape;
        if (prev.tool === "pen")
          next = { ...prev, points: [...(prev.points ?? []), [cx, cy]] };
        else if (BOX_TOOLS.has(prev.tool))
          next = { ...prev, w: cx - (prev.x ?? 0), h: cy - (prev.y ?? 0) };
        else
          next = { ...prev, x2: cx, y2: cy };
        latestDraft.current = next;
        return next;
      });
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
      const finished = latestDraft.current;
      latestDraft.current = null;
      setDraft(null);
      if (finished) onAdd(finished);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
  }, [drawTool, drawColor, drawWidth, drawFill, drawOpacity, scale, onAdd]);

  // ── Selection mode: handle resize drag ──────────────────────────────────────
  const startResizeDrag = useCallback((e: React.MouseEvent, shape: DrawnShape, handle: string) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX, startY = e.clientY;

    const onMove = (ev: MouseEvent) => {
      const ddxPt = (ev.clientX - startX) / scale;
      const ddyPt = (ev.clientY - startY) / scale;
      onEditShape(computeResize(shape, handle, ddxPt, ddyPt));
    };
    const onUp = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      const ddxPt = (ev.clientX - startX) / scale;
      const ddyPt = (ev.clientY - startY) / scale;
      onEditShape(computeResize(shape, handle, ddxPt, ddyPt));
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [scale, onEditShape]);

  // ── Selection mode: handle move drag (drag the selection border) ────────────
  const startMoveDrag = useCallback((e: React.MouseEvent, shape: DrawnShape) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX, startY = e.clientY;
    let moved = false;

    const onMove = (ev: MouseEvent) => {
      if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) > 3) moved = true;
      if (moved) {
        const ddxPt = (ev.clientX - startX) / scale;
        const ddyPt = (ev.clientY - startY) / scale;
        onEditShape(translateShape(shape, ddxPt, ddyPt));
      }
    };
    const onUp = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (moved) {
        const ddxPt = (ev.clientX - startX) / scale;
        const ddyPt = (ev.clientY - startY) / scale;
        onEditShape(translateShape(shape, ddxPt, ddyPt));
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [scale, onEditShape]);

  const selectedShape = selectedShapeId ? shapes.find(s => s.id === selectedShapeId) ?? null : null;

  return (
    <div ref={containerRef} style={{ position: "absolute", inset: 0, zIndex: 8, pointerEvents: "none" }}>
      <svg
        style={{
          position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible",
          pointerEvents: (selectionMode || !!selectedShapeId) ? "auto" : "none",
        }}
      >
        {/* Background rect to catch clicks on empty space in selection mode */}
        {selectionMode && (
          <rect
            x={0} y={0} width="100%" height="100%"
            fill="transparent"
            onClick={() => onSelectShape(null)}
            style={{ cursor: "default", pointerEvents: "all" }}
          />
        )}

        {/* All shapes */}
        {shapes.map(s => <ShapeEl key={s.id} s={s} scale={scale} />)}
        {draft && <ShapeEl s={draft} scale={scale} />}

        {/* Hit areas for selection mode */}
        {selectionMode && shapes.map(s => {
          const bb = shapeBBox(s);
          const pad = Math.max(6, s.lineWidth * scale / 2 + 4);
          if (s.tool === "pen") {
            // Use a polyline as hit area for pen strokes
            if (s.points?.length) {
              const pts = s.points.map(([x, y]) => `${x * scale},${y * scale}`).join(" ");
              return (
                <polyline
                  key={`hit-${s.id}`}
                  points={pts}
                  stroke="transparent"
                  strokeWidth={Math.max(12, s.lineWidth * scale + 8)}
                  fill="none"
                  style={{ cursor: "pointer", pointerEvents: "stroke" }}
                  onClick={(e) => { e.stopPropagation(); onSelectShape(s.id); }}
                />
              );
            }
            return null;
          }
          return (
            <rect
              key={`hit-${s.id}`}
              x={(bb.x * scale) - pad}
              y={(bb.y * scale) - pad}
              width={(bb.w * scale) + pad * 2}
              height={(bb.h * scale) + pad * 2}
              fill="transparent"
              style={{ cursor: "pointer", pointerEvents: "all" }}
              onClick={(e) => { e.stopPropagation(); onSelectShape(s.id); }}
            />
          );
        })}

        {/* Selection UI for selected shape */}
        {selectedShape && (() => {
          const bb = shapeBBox(selectedShape);
          const bx = bb.x * scale;
          const by = bb.y * scale;
          const bw = bb.w * scale;
          const bh = bb.h * scale;
          const pad = 6;
          const rx = bx - pad, ry = by - pad, rw = bw + pad * 2, rh = bh + pad * 2;

          const isLineTool = LINE_TOOLS.has(selectedShape.tool);

          // Handle positions for box shapes: nw,n,ne,e,se,s,sw,w
          const boxHandles: Array<{ id: string; cx: number; cy: number; cursor: string }> = isLineTool
            ? [
                { id: "p1", cx: (selectedShape.x1 ?? 0) * scale, cy: (selectedShape.y1 ?? 0) * scale, cursor: "move" },
                { id: "p2", cx: (selectedShape.x2 ?? 0) * scale, cy: (selectedShape.y2 ?? 0) * scale, cursor: "move" },
              ]
            : [
                { id: "nw", cx: rx,          cy: ry,          cursor: "nw-resize" },
                { id: "n",  cx: rx + rw / 2, cy: ry,          cursor: "n-resize"  },
                { id: "ne", cx: rx + rw,     cy: ry,          cursor: "ne-resize" },
                { id: "e",  cx: rx + rw,     cy: ry + rh / 2, cursor: "e-resize"  },
                { id: "se", cx: rx + rw,     cy: ry + rh,     cursor: "se-resize" },
                { id: "s",  cx: rx + rw / 2, cy: ry + rh,     cursor: "s-resize"  },
                { id: "sw", cx: rx,          cy: ry + rh,     cursor: "sw-resize" },
                { id: "w",  cx: rx,          cy: ry + rh / 2, cursor: "w-resize"  },
              ];

          return (
            <g>
              {/* Selection border — also draggable to move shape */}
              {!isLineTool && (
                <rect
                  x={rx} y={ry} width={rw} height={rh}
                  fill="transparent"
                  stroke="#f97316"
                  strokeWidth={1.5}
                  strokeDasharray="5,3"
                  style={{ cursor: "move", pointerEvents: "all" }}
                  onMouseDown={(e) => startMoveDrag(e, selectedShape)}
                />
              )}
              {isLineTool && (
                <line
                  x1={(selectedShape.x1 ?? 0) * scale}
                  y1={(selectedShape.y1 ?? 0) * scale}
                  x2={(selectedShape.x2 ?? 0) * scale}
                  y2={(selectedShape.y2 ?? 0) * scale}
                  stroke="#f97316"
                  strokeWidth={1.5}
                  strokeDasharray="5,3"
                  style={{ cursor: "move", pointerEvents: "stroke" }}
                  onMouseDown={(e) => startMoveDrag(e, selectedShape)}
                />
              )}

              {/* Resize handles */}
              {boxHandles.map(h => (
                <rect
                  key={h.id}
                  x={h.cx - 4} y={h.cy - 4}
                  width={8} height={8}
                  fill="white"
                  stroke="#f97316"
                  strokeWidth={1.5}
                  rx={1}
                  style={{ cursor: h.cursor, pointerEvents: "all" }}
                  onMouseDown={(e) => startResizeDrag(e, selectedShape, h.id)}
                />
              ))}
            </g>
          );
        })()}
      </svg>

      {/* Shape anchor div for ShapeFormatBar positioning */}
      {selectedShape && (() => {
        const bb = shapeBBox(selectedShape);
        const bx = bb.x * scale;
        const by = bb.y * scale;
        const bw = bb.w * scale;
        const pad = 6;
        return (
          <div
            data-shape-anchor
            style={{
              position: "absolute",
              left: bx - pad + (bw + pad * 2) / 2,
              top: by - pad,
              width: 0, height: 0,
              pointerEvents: "none",
            }}
          />
        );
      })()}

      {/* Delete button for selected shape */}
      {selectedShape && onDelete && (() => {
        const bb = shapeBBox(selectedShape);
        const bx = bb.x * scale;
        const by = bb.y * scale;
        const pad = 6;
        return (
          <div
            onClick={(e) => { e.stopPropagation(); onDelete(selectedShape.id); }}
            style={{
              position: "absolute",
              left: bx - pad - 9,
              top: by - pad - 9,
              width: 18, height: 18,
              background: "#ef4444",
              borderRadius: "50%",
              border: "1.5px solid white",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
              zIndex: 100,
              pointerEvents: "auto",
              boxShadow: "0 1px 4px rgba(0,0,0,0.35)",
            }}
            title="Delete shape (Del)"
          >
            <X style={{ width: 10, height: 10, color: "white" }} />
          </div>
        );
      })()}

      {/* Draw mode capture overlay */}
      {drawTool && (
        <div
          style={{ position: "absolute", inset: 0, cursor: "crosshair", pointerEvents: "auto", zIndex: 90 }}
          onMouseDown={startDraw}
        />
      )}
    </div>
  );
}
