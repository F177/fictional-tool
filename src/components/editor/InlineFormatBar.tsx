"use client";

import { AlignLeft, AlignCenter, AlignRight, Trash2, List, ListOrdered } from "lucide-react";
import type { ActiveFormat } from "./Toolbar";
import type { FormatPatch } from "@/lib/api";

function numToHex(num: number): string {
  const r = (num >> 16) & 0xff;
  const g = (num >> 8)  & 0xff;
  const b = num & 0xff;
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function hexToNum(hex: string): number {
  const h = hex.replace("#", "");
  return (parseInt(h.substring(0, 2), 16) << 16) | (parseInt(h.substring(2, 4), 16) << 8) | parseInt(h.substring(4, 6), 16);
}

interface Props {
  x             : number;
  y             : number;
  activeFormat  : ActiveFormat;
  onFormatChange: (patch: FormatPatch) => void;
  onDelete      : () => void;
}

const btn: React.CSSProperties = {
  background: "transparent", border: "none", color: "#e2e2e2",
  cursor: "pointer", borderRadius: 4, padding: "3px 6px",
  fontSize: 12, display: "flex", alignItems: "center", lineHeight: 1,
};

const divider: React.CSSProperties = {
  width: 1, height: 16, background: "#404040", margin: "0 2px", flexShrink: 0,
};

const LINE_HEIGHTS = [0.8, 1.0, 1.15, 1.3, 1.5, 1.75, 2.0, 2.5, 3.0];

export default function InlineFormatBar({ x, y, activeFormat, onFormatChange, onDelete }: Props) {
  const colorHex = numToHex(activeFormat.color);
  const lh = activeFormat.lineHeight ?? 1.3;

  return (
    <div
      style={{
        position: "fixed", left: x, top: y,
        transform: "translateX(-50%) translateY(calc(-100% - 6px))",
        zIndex: 9999,
        background: "#1a1a1a", border: "1px solid #3a3a3a",
        borderRadius: 8, boxShadow: "0 6px 24px rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", gap: 0,
        padding: "3px 4px", userSelect: "none", pointerEvents: "auto",
        whiteSpace: "nowrap",
      }}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      {/* B I U S */}
      <button
        onMouseDown={e => { e.preventDefault(); onFormatChange({ bold: !activeFormat.bold }); }}
        style={{ ...btn, fontWeight: "bold", background: activeFormat.bold ? "#3d3d3d" : "transparent" }}
        title="Bold"
      >B</button>
      <button
        onMouseDown={e => { e.preventDefault(); onFormatChange({ italic: !activeFormat.italic }); }}
        style={{ ...btn, fontStyle: "italic", background: activeFormat.italic ? "#3d3d3d" : "transparent" }}
        title="Italic"
      >I</button>
      <button
        onMouseDown={e => { e.preventDefault(); onFormatChange({ underline: !activeFormat.underline }); }}
        style={{ ...btn, textDecoration: "underline", background: activeFormat.underline ? "#3d3d3d" : "transparent" }}
        title="Underline"
      >U</button>
      <button
        onMouseDown={e => { e.preventDefault(); onFormatChange({ strikethrough: !activeFormat.strikethrough }); }}
        style={{ ...btn, textDecoration: "line-through", background: activeFormat.strikethrough ? "#3d3d3d" : "transparent" }}
        title="Strikethrough"
      >S</button>

      <div style={divider} />

      {/* Font size */}
      <button
        onMouseDown={e => { e.preventDefault(); onFormatChange({ fontSize: Math.max(4, activeFormat.fontSize - 1) }); }}
        style={btn} title="Smaller"
      >−</button>
      <span style={{ color: "#ccc", fontSize: 11, minWidth: 22, textAlign: "center" }}>
        {Math.round(activeFormat.fontSize)}
      </span>
      <button
        onMouseDown={e => { e.preventDefault(); onFormatChange({ fontSize: Math.min(200, activeFormat.fontSize + 1) }); }}
        style={btn} title="Larger"
      >+</button>

      {activeFormat.isAddedWord && (
        <>
          <div style={divider} />
          {/* Alignment */}
          <button
            onMouseDown={e => { e.preventDefault(); onFormatChange({ textAlign: "left" }); }}
            style={{ ...btn, background: activeFormat.textAlign === "left" ? "#3d3d3d" : "transparent" }}
            title="Align left"
          ><AlignLeft size={12} /></button>
          <button
            onMouseDown={e => { e.preventDefault(); onFormatChange({ textAlign: "center" }); }}
            style={{ ...btn, background: activeFormat.textAlign === "center" ? "#3d3d3d" : "transparent" }}
            title="Align center"
          ><AlignCenter size={12} /></button>
          <button
            onMouseDown={e => { e.preventDefault(); onFormatChange({ textAlign: "right" }); }}
            style={{ ...btn, background: activeFormat.textAlign === "right" ? "#3d3d3d" : "transparent" }}
            title="Align right"
          ><AlignRight size={12} /></button>

          <div style={divider} />

          {/* Line height − / value / + */}
          <button
            onMouseDown={e => {
              e.preventDefault();
              const idx = LINE_HEIGHTS.indexOf(lh);
              const prev = LINE_HEIGHTS[Math.max(0, idx < 0 ? LINE_HEIGHTS.length - 1 : idx - 1)];
              onFormatChange({ lineHeight: prev });
            }}
            style={btn} title="Decrease line spacing"
          >↕−</button>
          <span style={{ color: "#ccc", fontSize: 10, minWidth: 24, textAlign: "center" }}>{lh}×</span>
          <button
            onMouseDown={e => {
              e.preventDefault();
              const idx = LINE_HEIGHTS.indexOf(lh);
              const next = LINE_HEIGHTS[Math.min(LINE_HEIGHTS.length - 1, idx < 0 ? 0 : idx + 1)];
              onFormatChange({ lineHeight: next });
            }}
            style={btn} title="Increase line spacing"
          >↕+</button>

          <div style={divider} />

          {/* List type */}
          <button
            onMouseDown={e => { e.preventDefault(); onFormatChange({ listType: activeFormat.listType === "bullet" ? "none" : "bullet" }); }}
            style={{ ...btn, background: activeFormat.listType === "bullet" ? "#3d3d3d" : "transparent" }}
            title="Bullet list"
          ><List size={12} /></button>
          <button
            onMouseDown={e => { e.preventDefault(); onFormatChange({ listType: activeFormat.listType === "numbered" ? "none" : "numbered" }); }}
            style={{ ...btn, background: activeFormat.listType === "numbered" ? "#3d3d3d" : "transparent" }}
            title="Numbered list"
          ><ListOrdered size={12} /></button>
        </>
      )}

      <div style={divider} />

      {/* Color */}
      <label style={{ ...btn, padding: "3px 5px", cursor: "pointer", position: "relative" }} title="Text color">
        <div style={{ width: 14, height: 14, borderRadius: 3, background: colorHex, border: "1.5px solid #555" }} />
        <input
          type="color" value={colorHex}
          onChange={e => onFormatChange({ color: hexToNum(e.target.value) })}
          style={{ position: "absolute", opacity: 0, width: 0, height: 0, pointerEvents: "none" }}
          tabIndex={-1}
        />
      </label>

      <div style={divider} />

      {/* Delete */}
      <button
        onMouseDown={e => { e.preventDefault(); onDelete(); }}
        style={{ ...btn, color: "#f87171" }} title="Delete (Del)"
      ><Trash2 size={12} /></button>
    </div>
  );
}
