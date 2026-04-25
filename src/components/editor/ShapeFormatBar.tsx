"use client";

import React from "react";
import { Trash2 } from "lucide-react";
import type { DrawnShape } from "@/lib/api";

interface Props {
  x      : number;  // screen X (center)
  y      : number;  // screen Y (top)
  shape  : DrawnShape;
  onEdit : (shape: DrawnShape) => void;
  onDelete: () => void;
}

const btn: React.CSSProperties = {
  background: "transparent", border: "none", color: "#e2e2e2",
  cursor: "pointer", borderRadius: 4, padding: "3px 6px",
  fontSize: 12, display: "flex", alignItems: "center", lineHeight: 1,
};

const divider: React.CSSProperties = {
  width: 1, height: 16, background: "#404040", margin: "0 2px", flexShrink: 0,
};

export default function ShapeFormatBar({ x, y, shape, onEdit, onDelete }: Props) {
  const hasFill = shape.fill != null && shape.fill !== "none";
  const fillColor = hasFill ? (shape.fill as string) : "#ffffff";
  const opacityPct = Math.round((shape.opacity ?? 1) * 100);

  return (
    <div
      style={{
        position: "fixed",
        left: x,
        top: y,
        transform: "translateX(-50%) translateY(calc(-100% - 6px))",
        zIndex: 9999,
        background: "#1a1a1a",
        border: "1px solid #3a3a3a",
        borderRadius: 8,
        boxShadow: "0 6px 24px rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", gap: 0,
        padding: "3px 4px",
        userSelect: "none",
        pointerEvents: "auto",
        whiteSpace: "nowrap",
      }}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      {/* Stroke color */}
      <label
        style={{ ...btn, padding: "3px 5px", cursor: "pointer", position: "relative", gap: 4, display: "flex", alignItems: "center" }}
        title="Stroke color"
      >
        <span style={{ color: "#999", fontSize: 10 }}>Stroke</span>
        <div style={{ width: 14, height: 14, borderRadius: 3, background: shape.color, border: "1.5px solid #555" }} />
        <input
          type="color"
          value={shape.color}
          onChange={e => onEdit({ ...shape, color: e.target.value })}
          style={{ position: "absolute", opacity: 0, width: 0, height: 0, pointerEvents: "none" }}
          tabIndex={-1}
        />
      </label>

      <div style={divider} />

      {/* Fill toggle + color */}
      <button
        onMouseDown={e => {
          e.preventDefault();
          onEdit({ ...shape, fill: hasFill ? null : "#ffffff" });
        }}
        style={{
          ...btn,
          background: hasFill ? "#3d3d3d" : "transparent",
          color: hasFill ? "#f97316" : "#999",
        }}
        title={hasFill ? "Remove fill" : "Add fill"}
      >
        Fill
      </button>
      {hasFill && (
        <label
          style={{ ...btn, padding: "3px 5px", cursor: "pointer", position: "relative" }}
          title="Fill color"
        >
          <div style={{ width: 14, height: 14, borderRadius: 3, background: fillColor, border: "1.5px solid #555" }} />
          <input
            type="color"
            value={fillColor}
            onChange={e => onEdit({ ...shape, fill: e.target.value })}
            style={{ position: "absolute", opacity: 0, width: 0, height: 0, pointerEvents: "none" }}
            tabIndex={-1}
          />
        </label>
      )}

      <div style={divider} />

      {/* Line width */}
      <button
        onMouseDown={e => { e.preventDefault(); onEdit({ ...shape, lineWidth: Math.max(0.5, shape.lineWidth - 0.5) }); }}
        style={btn} title="Thinner"
      >−</button>
      <span style={{ color: "#ccc", fontSize: 11, minWidth: 22, textAlign: "center" }}>
        {shape.lineWidth % 1 === 0 ? shape.lineWidth : shape.lineWidth.toFixed(1)}
      </span>
      <button
        onMouseDown={e => { e.preventDefault(); onEdit({ ...shape, lineWidth: Math.min(20, shape.lineWidth + 0.5) }); }}
        style={btn} title="Thicker"
      >+</button>

      <div style={divider} />

      {/* Opacity */}
      <span style={{ color: "#999", fontSize: 10, padding: "0 4px" }}>Opacity</span>
      <input
        type="number"
        min={0} max={100} step={5}
        value={opacityPct}
        onChange={e => {
          const v = Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0));
          onEdit({ ...shape, opacity: v / 100 });
        }}
        style={{
          width: 36, fontSize: 11, textAlign: "center",
          background: "#2a2a2a", border: "1px solid #444",
          borderRadius: 3, color: "#ccc", padding: "1px 2px",
        }}
      />
      <span style={{ color: "#999", fontSize: 10, paddingRight: 4 }}>%</span>

      <div style={divider} />

      {/* Delete */}
      <button
        onMouseDown={e => { e.preventDefault(); onDelete(); }}
        style={{ ...btn, color: "#f87171" }}
        title="Delete shape (Del)"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}
