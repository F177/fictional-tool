"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import React from "react";
import { Move, X } from "lucide-react";
import { API_BASE, type ApiPage, type ApiWord, type WordEdit, type AddedWordItem, type AddedImageItem, type DrawnShape, type DrawTool, type StickyNote, type FormField, type GroupDef, type CellRef, type LinkAnnotation, type RedactionZone, type CropBox, type PageNumberConfig } from "@/lib/api";
import { nanoid } from "@/lib/nanoid";
import type { WatermarkConfig } from "./WatermarkDialog";
import DrawingOverlay from "./DrawingOverlay";
import StickyNoteOverlay from "./StickyNoteOverlay";
import FormFieldOverlay from "./FormFieldOverlay";

// ── List rendering helper ─────────────────────────────────────────────────────

function applyListType(text: string, listType?: "none" | "bullet" | "numbered"): string {
  if (!listType || listType === "none") return text;
  const lines = text.split("\n");
  if (listType === "bullet")
    return lines.map(l => (l.trim() ? `• ${l}` : l)).join("\n");
  return lines.map((l, i) => (l.trim() ? `${i + 1}. ${l}` : l)).join("\n");
}

// ── Font metric helpers ───────────────────────────────────────────────────────

const _ascentCache = new Map<string, number>();

function fontAscent(family: string, weight: string, style: string, size: number): number {
  const key = `${style}|${weight}|${Math.round(size * 10)}|${family}`;
  if (_ascentCache.has(key)) return _ascentCache.get(key)!;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  ctx.font = `${style} ${weight} ${size}px ${family}`;
  const ascent =
    (ctx.measureText("M") as TextMetrics & { fontBoundingBoxAscent?: number })
      .fontBoundingBoxAscent ?? size * 0.78;
  _ascentCache.set(key, ascent);
  return ascent;
}

const _measureCanvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
const _measureCtx    = _measureCanvas?.getContext("2d") ?? null;

function measureTextWidth(text: string, family: string, weight: string, style: string, size: number): number {
  if (!_measureCtx) return size * text.length * 0.6;
  _measureCtx.font = `${style} ${weight} ${size}px ${family}`;
  return _measureCtx.measureText(text).width;
}

function numToColor(n: number) {
  return n === 0 ? "#000" : `rgb(${(n >> 16) & 0xff},${(n >> 8) & 0xff},${n & 0xff})`;
}

// ── Snap computation ──────────────────────────────────────────────────────────

const SNAP_PX = 8;

interface SnapResult {
  snapXPx: number;
  snapYPx: number;
  guides : Array<{ type: "h" | "v"; posPt: number }>;
}

function computeSnap(
  wordIdx     : number,
  x0Px        : number,
  y0Px        : number,
  scale       : number,
  words       : ApiWord[],
  pageEdits   : Record<number, WordEdit>,
  pageWidthPt : number,
  pageHeightPt: number,
): SnapResult {
  const THRESH = SNAP_PX / scale;
  const word = words[wordIdx];
  const x0   = x0Px / scale;
  const y0   = y0Px / scale;
  const boxW = word.box[2] - word.box[0];
  const boxH = word.box[3] - word.box[1];
  const x1   = x0 + boxW;
  const y1   = y0 + boxH;
  const cx   = (x0 + x1) / 2;
  const cy   = (y0 + y1) / 2;
  const blOff = (word.baseline_y ?? word.box[3]) - word.box[1];
  const bl    = y0 + blOff;

  const xCands: number[] = [pageWidthPt / 2];
  const yCands: number[] = [pageHeightPt / 2];

  for (let i = 0; i < words.length; i++) {
    if (i === wordIdx) continue;
    const w  = words[i];
    const dx = pageEdits[i]?.dx ?? 0;
    const dy = pageEdits[i]?.dy ?? 0;
    const wx0 = w.box[0] + dx;
    const wx1 = w.box[2] + dx;
    const wy0 = w.box[1] + dy;
    const wy1 = w.box[3] + dy;
    const wbl = (w.baseline_y ?? w.box[3]) + dy;
    xCands.push(wx0, wx1, (wx0 + wx1) / 2);
    yCands.push(wy0, wy1, (wy0 + wy1) / 2, wbl);
  }

  const xEdges = [x0, x1, cx];
  const yEdges = [y0, y1, cy, bl];

  let bestSnapX = 0, bestDX = THRESH + 1, bestXGuide = 0;
  let bestSnapY = 0, bestDY = THRESH + 1, bestYGuide = 0;

  for (const xC of xCands) {
    for (const xE of xEdges) {
      const d = Math.abs(xE - xC);
      if (d < bestDX) { bestDX = d; bestSnapX = xC - xE; bestXGuide = xC; }
    }
  }
  for (const yC of yCands) {
    for (const yE of yEdges) {
      const d = Math.abs(yE - yC);
      if (d < bestDY) { bestDY = d; bestSnapY = yC - yE; bestYGuide = yC; }
    }
  }

  const guides: SnapResult["guides"] = [];
  if (bestDX <= THRESH) guides.push({ type: "v", posPt: bestXGuide });
  if (bestDY <= THRESH) guides.push({ type: "h", posPt: bestYGuide });

  return {
    snapXPx: bestDX <= THRESH ? bestSnapX * scale : 0,
    snapYPx: bestDY <= THRESH ? bestSnapY * scale : 0,
    guides,
  };
}

// ── WordOverlay ───────────────────────────────────────────────────────────────

interface WordProps {
  word              : ApiWord;
  scale             : number;
  wordEdit          : WordEdit | undefined;
  onEdit            : (edit: WordEdit) => void;
  onSelect          : (shiftKey: boolean) => void;
  isSelected        : boolean;
  isHighlighted     : boolean;
  isCurrentHighlight: boolean;
  showEditIndicator : boolean;
  redactMode?       : boolean;
  getSnap?          : (x0Px: number, y0Px: number) => { snapXPx: number; snapYPx: number };
  onDragEnd?        : () => void;
  groupId?          : string;
  onGroupDragEnd?   : (groupId: string, dx: number, dy: number) => void;
}

function WordOverlay({
  word, scale, wordEdit, onEdit, onSelect,
  isSelected, isHighlighted, isCurrentHighlight,
  showEditIndicator, redactMode,
  getSnap, onDragEnd,
  groupId, onGroupDragEnd,
}: WordProps) {
  const w = (word.box[2] - word.box[0]) * scale;
  const h = (word.box[3] - word.box[1]) * scale;

  const baseLeft = word.box[0] * scale;
  const baseTop  = word.box[1] * scale;
  const offsetX  = (wordEdit?.dx ?? 0) * scale;
  const offsetY  = (wordEdit?.dy ?? 0) * scale;

  const fontFamily = wordEdit?.fontFamily ?? word.font_family ?? "Arial, sans-serif";
  const fontWeight = (wordEdit?.bold   ?? word.bold)   ? "bold"   : "normal";
  const fontStyle  = (wordEdit?.italic ?? word.italic) ? "italic" : "normal";
  const baseFontPt = wordEdit?.fontSize ?? word.font_size;
  const baseFontPx = Math.max(4, baseFontPt * scale);
  const color      = numToColor(wordEdit?.color ?? word.color ?? 0);

  const baselineFromTop =
    word.baseline_y !== undefined ? (word.baseline_y - word.box[1]) * scale : h;

  const [isEditing, setIsEditing] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const outerRef   = useRef<HTMLDivElement>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onEnter = () => {
    if (leaveTimer.current) { clearTimeout(leaveTimer.current); leaveTimer.current = null; }
    setIsHovered(true);
  };
  const onLeave = () => {
    leaveTimer.current = setTimeout(() => setIsHovered(false), 120);
  };

  const spanRef   = useRef<HTMLSpanElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);
  const isDragging = useRef(false);

  const displayText = wordEdit?.text ?? word.text;

  useLayoutEffect(() => {
    const span = spanRef.current;
    if (!span || isEditing || !wordEdit) return;
    // Only shrink font when showing the original unchanged text that must fit its PDF bounding box.
    // When the user has changed the text, keep the font at natural size and expand the container.
    const userChangedText = wordEdit.text !== undefined && wordEdit.text !== word.text;
    const naturalW = measureTextWidth(displayText, fontFamily, fontWeight, fontStyle, baseFontPx);
    const usedSize = (!userChangedText && naturalW > w && naturalW > 0)
      ? baseFontPx * (w / naturalW)
      : baseFontPx;
    span.style.fontSize = `${usedSize}px`;
    const ascent = fontAscent(fontFamily, fontWeight, fontStyle, usedSize);
    span.style.top = `${baselineFromTop - ascent}px`;

    // Resize the parent container to match the new text width so the selection outline fits.
    if (userChangedText) {
      const newW = measureTextWidth(displayText, fontFamily, fontWeight, fontStyle, usedSize);
      const container = span.parentElement;
      if (container) container.style.width = `${Math.max(newW + 8, w)}px`;
    }
  }, [displayText, wordEdit, isEditing, w, baseFontPx, fontFamily, fontWeight, fontStyle, baselineFromTop, word.text]);

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect(e.shiftKey);

    const startX  = e.clientX;
    const startY  = e.clientY;
    const curLeft = baseLeft + offsetX;
    const curTop  = baseTop  + offsetY;
    let moved     = false;
    let lastSnap  = { snapXPx: 0, snapYPx: 0 };

    const onMove = (ev: MouseEvent) => {
      const ddx = ev.clientX - startX;
      const ddy = ev.clientY - startY;
      if (!moved && Math.hypot(ddx, ddy) > 4) { moved = true; isDragging.current = true; }
      if (moved && outerRef.current) {
        const rawLeft = curLeft + ddx;
        const rawTop  = curTop  + ddy;
        lastSnap = getSnap?.(rawLeft, rawTop) ?? { snapXPx: 0, snapYPx: 0 };
        outerRef.current.style.left = `${rawLeft + lastSnap.snapXPx}px`;
        outerRef.current.style.top  = `${rawTop  + lastSnap.snapYPx}px`;
      }
    };

    const onUp = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",  onUp);
      isDragging.current = false;
      onDragEnd?.();
      if (moved) {
        const ddx = ev.clientX - startX + lastSnap.snapXPx;
        const ddy = ev.clientY - startY + lastSnap.snapYPx;
        if (groupId && onGroupDragEnd) {
          onGroupDragEnd(groupId, ddx / scale, ddy / scale);
        } else {
          onEdit({
            text      : wordEdit?.text       ?? word.text,
            color     : wordEdit?.color,
            fontFamily: wordEdit?.fontFamily,
            fontSize  : wordEdit?.fontSize,
            bold      : wordEdit?.bold,
            italic    : wordEdit?.italic,
            deleted   : wordEdit?.deleted,
            dx        : (wordEdit?.dx ?? 0) + ddx / scale,
            dy        : (wordEdit?.dy ?? 0) + ddy / scale,
          });
        }
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",  onUp);
  };

  const startEdit = () => {
    onSelect(false);
    setIsEditing(true);
    setTimeout(() => {
      const ta = inputRef.current;
      if (!ta) return;
      ta.focus();
      ta.select();
      // Auto-size to content on open
      ta.style.height = "auto";
      ta.style.height = `${ta.scrollHeight + 2}px`;
    }, 0);
  };

  const commit = (text: string) => {
    setIsEditing(false);
    onEdit({
      text      : text.trim(),
      color     : wordEdit?.color,
      fontFamily: wordEdit?.fontFamily,
      fontSize  : wordEdit?.fontSize,
      bold      : wordEdit?.bold,
      italic    : wordEdit?.italic,
      deleted   : text.trim() ? wordEdit?.deleted : true,
      dx        : wordEdit?.dx,
      dy        : wordEdit?.dy,
    });
  };

  const showHandle = (isHovered || isDragging.current) && !isEditing;

  const outlineStyle = isEditing
    ? "1.5px solid #f97316"
    : isCurrentHighlight ? "2px solid #f59e0b"
    : isHighlighted ? "2px solid #fbbf24"
    : isSelected    ? "1.5px solid #f97316"
    : isHovered     ? "1px dashed rgba(249,115,22,0.55)"
    : (showEditIndicator && wordEdit && !wordEdit.deleted) ? "1px dashed rgba(249,115,22,0.30)"
    : "none";

  const bgStyle = isEditing
    ? "white"
    : isCurrentHighlight ? "rgba(251,191,36,0.35)"
    : isHighlighted ? "rgba(253,224,71,0.25)"
    : isHovered ? "rgba(249,115,22,0.13)"
    : "transparent";

  return (
    <div
      ref={outerRef}
      onClick={(e) => { e.stopPropagation(); }}
      style={{
        position: "absolute",
        left    : baseLeft + offsetX,
        top     : baseTop  + offsetY,
        zIndex  : isEditing ? 20 : 10,
      }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      {showHandle && (
        <div
          onMouseDown={handleDragStart}
          onClick={(e) => e.stopPropagation()}
          style={{
            position    : "absolute",
            top         : -22,
            left        : "50%",
            transform   : "translateX(-50%)",
            background  : "#f97316",
            borderRadius: 4,
            padding     : "2px 5px",
            cursor      : "grab",
            zIndex      : 30,
            display     : "flex",
            alignItems  : "center",
            gap         : 3,
            userSelect  : "none",
            whiteSpace  : "nowrap",
            boxShadow   : "0 1px 4px rgba(0,0,0,0.25)",
          }}
          title="Drag to reposition"
        >
          <Move style={{ width: 10, height: 10, color: "white" }} />
        </div>
      )}

      <div
        style={{ width: w, height: h, overflow: "visible", cursor: redactMode ? "crosshair" : "text", position: "relative" }}
        onClick={!isEditing ? (e) => {
          if (redactMode) { onSelect(false); return; }
          if (e.shiftKey) { onSelect(true); return; }
          startEdit();
        } : undefined}
      >
        <div
          style={{
            position     : "absolute",
            inset        : 0,
            background   : bgStyle,
            outline      : outlineStyle,
            pointerEvents: "none",
          }}
        />

        {isEditing ? (
          <textarea
            ref={inputRef}
            defaultValue={displayText}
            style={{
              position    : "absolute",
              top         : 0,
              left        : 0,
              width       : Math.max(w, 40),
              height      : Math.max(h, 18),
              fontSize    : baseFontPx,
              fontFamily,
              fontWeight,
              fontStyle,
              lineHeight  : 1.4,
              padding     : "1px 3px",
              color,
              background  : "transparent",
              border      : "none",
              outline     : "1.5px solid #f97316",
              borderRadius: 2,
              resize      : "both",
              zIndex      : 30,
              boxSizing   : "border-box",
              overflowY   : "auto",
            }}
            onInput={(e) => {
              const ta = e.currentTarget;
              ta.style.height = "auto";
              ta.style.height = `${ta.scrollHeight + 2}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") { e.preventDefault(); commit((e.target as HTMLTextAreaElement).value); }
            }}
            onBlur={(e) => commit(e.target.value)}
          />
        ) : wordEdit && !wordEdit.deleted ? (
          <span
            ref={spanRef}
            style={{
              position      : "absolute",
              top           : 0,
              left          : 0,
              fontSize      : baseFontPx,
              fontFamily,
              fontWeight,
              fontStyle,
              lineHeight    : "1",
              whiteSpace    : "nowrap",
              color,
              opacity       : wordEdit.opacity ?? 1,
              display       : "inline-block",
              pointerEvents : "none",
              userSelect    : "none",
              textDecoration: [
                wordEdit.underline     && "underline",
                wordEdit.strikethrough && "line-through",
              ].filter(Boolean).join(" ") || "none",
            }}
          >
            {displayText}
          </span>
        ) : null}
      </div>
    </div>
  );
}

// ── AddedWordOverlay ──────────────────────────────────────────────────────────

interface AddedProps {
  item           : AddedWordItem;
  scale          : number;
  isSelected     : boolean;
  onEdit         : (word: AddedWordItem) => void;
  onSelect       : (shiftKey: boolean) => void;
  onRemove       : () => void;
  groupId?       : string;
  onGroupDragEnd?: (groupId: string, dx: number, dy: number) => void;
}

function AddedWordOverlay({ item, scale, isSelected, onEdit, onSelect, onRemove, groupId, onGroupDragEnd }: AddedProps) {
  const [isEditing, setIsEditing] = useState(item.text === "");
  const [isHovered, setIsHovered] = useState(false);
  const outerRef   = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLTextAreaElement>(null);
  const isDragging = useRef(false);

  const dx = item.dx ?? 0;
  const dy = item.dy ?? 0;
  const fontFamily = item.fontFamily;
  const fontWeight = item.bold   ? "bold"   : "normal";
  const fontStyle  = item.italic ? "italic" : "normal";
  const fontSizePx = Math.max(4, item.fontSize * scale);
  const color      = numToColor(item.color);

  const ascent     = fontAscent(fontFamily, fontWeight, fontStyle, fontSizePx);
  const textW      = measureTextWidth(item.text || "W", fontFamily, fontWeight, fontStyle, fontSizePx);
  const boxW       = item.w ? item.w * scale : Math.max(textW, 80);
  const boxH       = item.h ? item.h * scale : undefined;
  const rawLeftPx  = (item.x + dx) * scale;
  const leftPx     = item.textAlign === "center"
    ? rawLeftPx - textW / 2
    : item.textAlign === "right"
    ? rawLeftPx - textW
    : rawLeftPx;
  const topPx      = (item.y + dy) * scale - ascent;
  const textDecoration = [
    item.underline     && "underline",
    item.strikethrough && "line-through",
  ].filter(Boolean).join(" ") || "none";

  useEffect(() => {
    if (isEditing) setTimeout(() => {
      const ta = inputRef.current;
      if (!ta) return;
      ta.focus();
      ta.style.height = "auto";
      ta.style.height = `${ta.scrollHeight}px`;
    }, 30);
  }, [isEditing]);

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect(e.shiftKey);

    const startX  = e.clientX;
    const startY  = e.clientY;
    const curLeft = leftPx;
    const curTop  = topPx;
    let moved     = false;

    const onMove = (ev: MouseEvent) => {
      const ddx = ev.clientX - startX;
      const ddy = ev.clientY - startY;
      if (!moved && Math.hypot(ddx, ddy) > 4) { moved = true; isDragging.current = true; }
      if (moved && outerRef.current) {
        outerRef.current.style.left = `${curLeft + ddx}px`;
        outerRef.current.style.top  = `${curTop  + ddy}px`;
      }
    };

    const onUp = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",  onUp);
      isDragging.current = false;
      if (moved) {
        const ddx = ev.clientX - startX;
        const ddy = ev.clientY - startY;
        if (groupId && onGroupDragEnd) {
          onGroupDragEnd(groupId, ddx / scale, ddy / scale);
        } else {
          onEdit({ ...item, dx: (item.dx ?? 0) + ddx / scale, dy: (item.dy ?? 0) + ddy / scale });
        }
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",  onUp);
  };

  const commit = (text: string) => {
    setIsEditing(false);
    if (!text.trim()) { onRemove(); return; }
    onEdit({ ...item, text: text.trim() });
  };

  const showControls = (isHovered || isSelected || isDragging.current) && !isEditing;

  return (
    <div
      ref={outerRef}
      onClick={(e) => { e.stopPropagation(); onSelect(e.shiftKey); }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      data-inline-selected={isSelected ? "" : undefined}
      style={{ position: "absolute", left: leftPx, top: topPx, zIndex: isEditing ? 20 : 11, transform: `rotate(${item.rotation ?? 0}deg)`, transformOrigin: "left top" }}
    >
      {/* Delete button */}
      {showControls && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          style={{
            position: "absolute", top: -20, right: -6,
            width: 16, height: 16, borderRadius: "50%",
            background: "#ef4444", color: "white",
            border: "none", cursor: "pointer", fontSize: 9,
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 40, padding: 0,
          }}
          title="Delete"
        >
          <X style={{ width: 9, height: 9 }} />
        </button>
      )}

      {/* Drag handle — hidden when in a group (GroupBox provides centralized handle) */}
      {showControls && !groupId && (
        <div
          onMouseDown={handleDragStart}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute", top: -22, left: "50%", transform: "translateX(-50%)",
            background: "#f97316", borderRadius: 4, padding: "2px 5px",
            cursor: "grab", zIndex: 30, display: "flex", alignItems: "center",
            gap: 3, userSelect: "none", boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
          }}
        >
          <Move style={{ width: 10, height: 10, color: "white" }} />
        </div>
      )}

      {isEditing ? (
        <textarea
          ref={inputRef}
          defaultValue={item.text}
          style={{
            fontSize: fontSizePx, fontFamily, fontWeight, fontStyle,
            textDecoration, textAlign: item.textAlign ?? "left",
            color,
            background  : "transparent",
            border      : "none",
            outline     : "1.5px solid #f97316",
            borderRadius: 2,
            resize      : "horizontal",
            padding: "1px 3px", lineHeight: item.lineHeight ?? 1.3,
            minWidth: item.w ? undefined : 80,
            width: item.w ? `${item.w * scale}px` : undefined,
            height: item.h ? `${item.h * scale}px` : "auto",
            minHeight: undefined,
            zIndex: 30,
            boxSizing: "border-box", overflowY: "hidden",
          }}
          onInput={(e) => {
            if (item.h) return;
            const ta = e.currentTarget;
            ta.style.height = "auto";
            ta.style.height = `${ta.scrollHeight}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") { if (!item.text) onRemove(); else setIsEditing(false); }
          }}
          onBlur={(e) => commit(e.target.value)}
        />
      ) : (
        <span
          onDoubleClick={() => { onSelect(false); setIsEditing(true); }}
          style={{
            display: item.w ? "block" : "inline-block",
            width: item.w ? `${boxW}px` : undefined,
            height: item.h ? `${boxH}px` : undefined,
            overflow: item.h ? "hidden" : undefined,
            fontSize: fontSizePx, fontFamily, fontWeight, fontStyle,
            textDecoration, textAlign: item.textAlign ?? "left",
            color, opacity: item.opacity ?? 1,
            whiteSpace: "pre-wrap", wordBreak: "break-word",
            lineHeight: item.lineHeight ?? 1.3, cursor: "text", minWidth: item.w ? undefined : 40,
            padding: "1px 2px",
            outline: isSelected
              ? "1.5px solid #f97316"
              : isHovered ? "1px dashed rgba(249,115,22,0.55)" : "1px dashed rgba(249,115,22,0.35)",
          }}
        >
          {applyListType(item.text, item.listType)}
        </span>
      )}

      {/* Text box resize handles — shown when selected */}
      {isSelected && (
        <>
          {/* SE corner handle */}
          <div
            onMouseDown={(e) => {
              e.preventDefault(); e.stopPropagation();
              const startX = e.clientX, startY = e.clientY;
              const curW = item.w ?? (textW / scale + 6);
              const curH = item.h ?? (fontSizePx * 1.3 / scale + 4);
              const onMove = (ev: MouseEvent) => {
                const nw = Math.max(40 / scale, curW + (ev.clientX - startX) / scale);
                const nh = Math.max(12 / scale, curH + (ev.clientY - startY) / scale);
                onEdit({ ...item, w: nw, h: nh });
              };
              const onUp = (ev: MouseEvent) => {
                window.removeEventListener("mousemove", onMove);
                window.removeEventListener("mouseup", onUp);
                const nw = Math.max(40 / scale, curW + (ev.clientX - startX) / scale);
                const nh = Math.max(12 / scale, curH + (ev.clientY - startY) / scale);
                onEdit({ ...item, w: nw, h: nh });
              };
              window.addEventListener("mousemove", onMove);
              window.addEventListener("mouseup", onUp);
            }}
            style={{
              position: "absolute", right: -4, bottom: -4,
              width: 8, height: 8, background: "white",
              border: "1.5px solid #f97316", borderRadius: 1,
              cursor: "se-resize", zIndex: 35,
            }}
          />
          {/* E edge handle */}
          <div
            onMouseDown={(e) => {
              e.preventDefault(); e.stopPropagation();
              const startX = e.clientX;
              const curW = item.w ?? (textW / scale + 6);
              const onMove = (ev: MouseEvent) => {
                const nw = Math.max(40 / scale, curW + (ev.clientX - startX) / scale);
                onEdit({ ...item, w: nw });
              };
              const onUp = (ev: MouseEvent) => {
                window.removeEventListener("mousemove", onMove);
                window.removeEventListener("mouseup", onUp);
                const nw = Math.max(40 / scale, curW + (ev.clientX - startX) / scale);
                onEdit({ ...item, w: nw });
              };
              window.addEventListener("mousemove", onMove);
              window.addEventListener("mouseup", onUp);
            }}
            style={{
              position: "absolute", right: -4, top: "50%", transform: "translateY(-50%)",
              width: 8, height: 8, background: "white",
              border: "1.5px solid #f97316", borderRadius: 1,
              cursor: "e-resize", zIndex: 35,
            }}
          />
          {/* S edge handle */}
          <div
            onMouseDown={(e) => {
              e.preventDefault(); e.stopPropagation();
              const startY = e.clientY;
              const curH = item.h ?? (fontSizePx * 1.3 / scale + 4);
              const onMove = (ev: MouseEvent) => {
                const nh = Math.max(12 / scale, curH + (ev.clientY - startY) / scale);
                onEdit({ ...item, h: nh });
              };
              const onUp = (ev: MouseEvent) => {
                window.removeEventListener("mousemove", onMove);
                window.removeEventListener("mouseup", onUp);
                const nh = Math.max(12 / scale, curH + (ev.clientY - startY) / scale);
                onEdit({ ...item, h: nh });
              };
              window.addEventListener("mousemove", onMove);
              window.addEventListener("mouseup", onUp);
            }}
            style={{
              position: "absolute", bottom: -4, left: "50%", transform: "translateX(-50%)",
              width: 8, height: 8, background: "white",
              border: "1.5px solid #f97316", borderRadius: 1,
              cursor: "s-resize", zIndex: 35,
            }}
          />
        </>
      )}
    </div>
  );
}

// ── AddedImageOverlay ─────────────────────────────────────────────────────────

interface ImageProps {
  item           : AddedImageItem;
  scale          : number;
  isSelected     : boolean;
  onEdit         : (img: AddedImageItem) => void;
  onSelect       : (shiftKey: boolean) => void;
  onRemove       : () => void;
  groupId?       : string;
  onGroupDragEnd?: (groupId: string, dx: number, dy: number) => void;
}

function AddedImageOverlay({ item, scale, isSelected, onEdit, onSelect, onRemove, groupId, onGroupDragEnd }: ImageProps) {
  const outerRef   = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  const x = (item.x + (item.dx ?? 0)) * scale;
  const y = (item.y + (item.dy ?? 0)) * scale;
  const w = item.width  * scale;
  const h = item.height * scale;

  // ── Drag to reposition ──────────────────────────────────────────────────

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    onSelect(e.shiftKey);
    const sx = e.clientX, sy = e.clientY;
    const cx = x, cy = y;
    let moved = false;

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (!moved && Math.hypot(dx, dy) > 4) moved = true;
      if (moved && outerRef.current) {
        outerRef.current.style.left = `${cx + dx}px`;
        outerRef.current.style.top  = `${cy + dy}px`;
      }
    };
    const onUp = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
      if (moved) {
        const ddx = (ev.clientX - sx) / scale;
        const ddy = (ev.clientY - sy) / scale;
        if (groupId && onGroupDragEnd) {
          onGroupDragEnd(groupId, ddx, ddy);
        } else {
          onEdit({ ...item, dx: (item.dx ?? 0) + ddx, dy: (item.dy ?? 0) + ddy });
        }
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
  };

  // ── Corner resize ────────────────────────────────────────────────────────

  const handleResize = (corner: string, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const sx = e.clientX, sy = e.clientY;
    const ox = item.x + (item.dx ?? 0), oy = item.y + (item.dy ?? 0);
    const ow = item.width, oh = item.height;

    const compute = (ev: MouseEvent) => {
      const ddx = (ev.clientX - sx) / scale;
      const ddy = (ev.clientY - sy) / scale;
      let nx = ox, ny = oy, nw = ow, nh = oh;
      if (corner.includes("e")) nw = Math.max(20, ow + ddx);
      if (corner.includes("s")) nh = Math.max(10, oh + ddy);
      if (corner.includes("w")) { nx = ox + ddx; nw = Math.max(20, ow - ddx); }
      if (corner.includes("n")) { ny = oy + ddy; nh = Math.max(10, oh - ddy); }
      return { nx, ny, nw, nh };
    };

    const onMove = (ev: MouseEvent) => {
      const { nx, ny, nw, nh } = compute(ev);
      if (outerRef.current) {
        outerRef.current.style.left   = `${nx * scale}px`;
        outerRef.current.style.top    = `${ny * scale}px`;
        outerRef.current.style.width  = `${nw * scale}px`;
        outerRef.current.style.height = `${nh * scale}px`;
      }
    };
    const onUp = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
      const { nx, ny, nw, nh } = compute(ev);
      onEdit({ ...item, x: nx, y: ny, dx: 0, dy: 0, width: nw, height: nh });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
  };

  const showControls = isHovered || isSelected;

  return (
    <div
      ref={outerRef}
      onClick={(e) => { e.stopPropagation(); onSelect(e.shiftKey); }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ position: "absolute", left: x, top: y, width: w, height: h, zIndex: 12 }}
    >
      {/* Drag handle — hidden when in a group (GroupBox provides centralized handle) */}
      {showControls && !groupId && (
        <div
          onMouseDown={handleDragStart}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute", top: -22, left: "50%", transform: "translateX(-50%)",
            background: "#f97316", borderRadius: 4, padding: "2px 5px",
            cursor: "grab", zIndex: 30, display: "flex", alignItems: "center",
            boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
          }}
        >
          <Move style={{ width: 10, height: 10, color: "white" }} />
        </div>
      )}

      {/* Delete button */}
      {showControls && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          style={{
            position: "absolute", top: -20, right: -6,
            width: 16, height: 16, borderRadius: "50%",
            background: "#ef4444", color: "white",
            border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 40, padding: 0,
          }}
        >
          <X style={{ width: 9, height: 9 }} />
        </button>
      )}

      {/* The image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.dataUrl}
        alt="Placed image"
        draggable={false}
        style={{
          width: "100%", height: "100%", display: "block", objectFit: "fill",
          outline: isSelected
            ? "1.5px solid #f97316"
            : isHovered ? "1px dashed rgba(249,115,22,0.55)" : "none",
        }}
      />

      {/* Resize handles (corners) */}
      {showControls && (["nw", "ne", "sw", "se"] as const).map((corner) => (
        <div
          key={corner}
          onMouseDown={(e) => handleResize(corner, e)}
          style={{
            position: "absolute",
            width: 8, height: 8,
            background: "white", border: "1.5px solid #f97316", borderRadius: 1,
            cursor: `${corner}-resize`, zIndex: 35,
            ...(corner.includes("n") ? { top: -4 }    : { bottom: -4 }),
            ...(corner.includes("w") ? { left: -4 }   : { right:  -4 }),
          }}
        />
      ))}
    </div>
  );
}

// ── GroupBox ──────────────────────────────────────────────────────────────────

interface GroupBoxProps {
  groupId: string;
  x: number; y: number; w: number; h: number;
  scale: number;
  onGroupDragEnd: (groupId: string, dx: number, dy: number) => void;
}
function GroupBox({ groupId, x, y, w, h, scale, onGroupDragEnd }: GroupBoxProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX, startY = e.clientY;
    const onMove = (ev: MouseEvent) => {
      if (boxRef.current) {
        boxRef.current.style.transform = `translate(${ev.clientX - startX}px,${ev.clientY - startY}px)`;
      }
    };
    const onUp = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (boxRef.current) boxRef.current.style.transform = "";
      const ddx = (ev.clientX - startX) / scale;
      const ddy = (ev.clientY - startY) / scale;
      if (Math.hypot(ddx, ddy) > 0.5) onGroupDragEnd(groupId, ddx, ddy);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };
  return (
    <div ref={boxRef} style={{ position: "absolute", left: x, top: y, width: w, height: h, zIndex: 8, pointerEvents: "none" }}>
      <div style={{ position: "absolute", inset: 0, border: "1.5px dashed #f97316", borderRadius: 4, pointerEvents: "none", boxShadow: "0 0 0 1px rgba(249,115,22,0.15)" }} />
      <div
        onMouseDown={handleDragStart}
        style={{
          position: "absolute", top: -22, left: "50%", transform: "translateX(-50%)",
          background: "#f97316", borderRadius: 4, padding: "2px 6px",
          cursor: "grab", zIndex: 30, display: "flex", alignItems: "center",
          pointerEvents: "auto", boxShadow: "0 1px 4px rgba(0,0,0,0.25)", userSelect: "none",
        }}
      >
        <Move style={{ width: 10, height: 10, color: "white" }} />
      </div>
    </div>
  );
}

// ── CropOverlay ───────────────────────────────────────────────────────────────

interface CropOverlayProps {
  cropBox  : CropBox;
  scale    : number;
  pageW    : number;
  pageH    : number;
  onChange : (box: CropBox) => void;
}

function CropOverlay({ cropBox, scale, pageW, pageH, onChange }: CropOverlayProps) {
  const lx = cropBox.x * scale;
  const ty = cropBox.y * scale;
  const rx = (cropBox.x + cropBox.w) * scale;
  const by = (cropBox.y + cropBox.h) * scale;
  const MIN_PT = 20;

  const startResize = (edge: string, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const sx = e.clientX, sy = e.clientY;
    const { x: ox, y: oy, w: ow, h: oh } = cropBox;

    const compute = (ev: MouseEvent): CropBox => {
      const ddx = (ev.clientX - sx) / scale;
      const ddy = (ev.clientY - sy) / scale;
      let nx = ox, ny = oy, nw = ow, nh = oh;

      if (edge.includes("e")) { nw = Math.max(MIN_PT, ow + ddx); }
      if (edge.includes("s")) { nh = Math.max(MIN_PT, oh + ddy); }
      if (edge.includes("w")) {
        const proposed = ow - ddx;
        nw = Math.max(MIN_PT, proposed);
        nx = ox + ow - nw;
      }
      if (edge.includes("n")) {
        const proposed = oh - ddy;
        nh = Math.max(MIN_PT, proposed);
        ny = oy + oh - nh;
      }

      nx = Math.max(0, nx); ny = Math.max(0, ny);
      if (nx + nw > pageW / scale) nw = pageW / scale - nx;
      if (ny + nh > pageH / scale) nh = pageH / scale - ny;
      return { x: nx, y: ny, w: nw, h: nh };
    };

    const onMove = (ev: MouseEvent) => onChange(compute(ev));
    const onUp   = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      onChange(compute(ev));
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
  };

  // Handles sit inside the container (clamped) to avoid being clipped by overflow:hidden
  const H = 10;
  const cx = (v: number) => Math.max(1, Math.min(pageW - H - 1, v));
  const cy = (v: number) => Math.max(1, Math.min(pageH - H - 1, v));
  const handles = [
    { edge: "n",  hx: cx((lx + rx) / 2 - H / 2), hy: cy(ty - H / 2), cursor: "n-resize"  },
    { edge: "s",  hx: cx((lx + rx) / 2 - H / 2), hy: cy(by - H / 2), cursor: "s-resize"  },
    { edge: "e",  hx: cx(rx - H / 2), hy: cy((ty + by) / 2 - H / 2), cursor: "e-resize"  },
    { edge: "w",  hx: cx(lx - H / 2), hy: cy((ty + by) / 2 - H / 2), cursor: "w-resize"  },
    { edge: "nw", hx: cx(lx - H / 2), hy: cy(ty - H / 2),             cursor: "nw-resize" },
    { edge: "ne", hx: cx(rx - H / 2), hy: cy(ty - H / 2),             cursor: "ne-resize" },
    { edge: "sw", hx: cx(lx - H / 2), hy: cy(by - H / 2),             cursor: "sw-resize" },
    { edge: "se", hx: cx(rx - H / 2), hy: cy(by - H / 2),             cursor: "se-resize" },
  ];

  const mask = "rgba(0,0,0,0.55)";
  return (
    <>
      {/* Dark mask — 4 rects outside crop box */}
      <div style={{ position: "absolute", left: 0, top: 0,  width: pageW, height: ty,        background: mask, pointerEvents: "none", zIndex: 30 }} />
      <div style={{ position: "absolute", left: 0, top: by, width: pageW, height: pageH - by, background: mask, pointerEvents: "none", zIndex: 30 }} />
      <div style={{ position: "absolute", left: 0, top: ty, width: lx,    height: by - ty,    background: mask, pointerEvents: "none", zIndex: 30 }} />
      <div style={{ position: "absolute", left: rx, top: ty, width: pageW - rx, height: by - ty, background: mask, pointerEvents: "none", zIndex: 30 }} />
      {/* Crop border */}
      <div style={{ position: "absolute", left: lx, top: ty, width: rx - lx, height: by - ty, border: "2px solid white", boxShadow: "0 0 0 1px rgba(0,0,0,0.6)", pointerEvents: "none", zIndex: 31 }} />
      {/* Resize handles */}
      {handles.map(({ edge, hx, hy, cursor }) => (
        <div key={edge} onMouseDown={e => startResize(edge, e)}
          style={{ position: "absolute", left: hx, top: hy, width: H, height: H, background: "white", border: "1.5px solid #333", cursor, zIndex: 32, borderRadius: 2, boxShadow: "0 1px 3px rgba(0,0,0,0.4)" }}
        />
      ))}
    </>
  );
}

function buildPageNumberText(cfg: PageNumberConfig, displayIdx: number, total: number): string | null {
  if (cfg.skipFirst && displayIdx === 0) return null;
  const offset = cfg.skipFirst ? 1 : 0;
  const num = cfg.startFrom + displayIdx - offset;
  const lastNum = cfg.startFrom + total - 1 - offset;
  switch (cfg.format) {
    case "n":               return String(num);
    case "page-n":          return `Page ${num}`;
    case "n-of-total":      return `${num} of ${lastNum}`;
    case "page-n-of-total": return `Page ${num} of ${lastNum}`;
  }
}

// ── PageOverlay ───────────────────────────────────────────────────────────────

interface Props {
  page               : ApiPage;
  displayWidth       : number;
  edits              : Record<number, WordEdit>;
  addedWords         : AddedWordItem[];
  onEdit             : (wordIdx: number, edit: WordEdit) => void;
  onSelect           : (wordIdx: number, shiftKey: boolean) => void;
  onClearSelection   : () => void;
  onAddWord          : (xPt: number, yPt: number) => void;
  onEditAdded        : (id: string, word: AddedWordItem) => void;
  onSelectAdded      : (id: string, shiftKey: boolean) => void;
  onRemoveAdded      : (id: string) => void;
  selectedWordIdxs   : Set<number>;
  selectedAddedIds   : Set<string>;
  addTextMode        : boolean;
  findHighlights     : Set<number>;
  findCurrentHighlight: number | null;
  rotation?          : number;
  addedImages        : AddedImageItem[];
  onEditImage        : (id: string, img: AddedImageItem) => void;
  onSelectImage      : (id: string, shiftKey: boolean) => void;
  onRemoveImage      : (id: string) => void;
  selectedImageIds     : Set<string>;
  onPlaceImage?        : (xPt: number, yPt: number) => void;
  showEditIndicators   : boolean;
  // Drawing
  drawings           : DrawnShape[];
  onAddShape         : (shape: DrawnShape) => void;
  drawTool           : DrawTool | null;
  drawColor          : string;
  drawWidth          : number;
  drawFill           : string | null;
  drawOpacity        : number;
  selectedShapeId    : string | null;
  onSelectShape      : (id: string | null) => void;
  onEditShape        : (shape: DrawnShape) => void;
  // Sticky notes
  stickyNotes        : StickyNote[];
  onAddNote          : (xPt: number, yPt: number) => void;
  onEditNote         : (id: string, note: StickyNote) => void;
  onRemoveNote       : (id: string) => void;
  noteMode           : boolean;
  // Form fields
  formFields         : FormField[];
  formValues         : Record<string, string>;
  onFormValue        : (fieldId: string, value: string) => void;
  // Redaction
  redactMode         : boolean;
  onRedact           : (wordIdx: number) => void;
  // Grouping
  groups             : GroupDef[];
  pageIdx            : number;
  onGroupDragEnd     : (groupId: string, dx: number, dy: number) => void;
  // Box selection
  onBoxSelect        : (refs: CellRef[]) => void;
  // Links
  links              : LinkAnnotation[];
  linkMode           : boolean;
  onLinkCreate       : (x: number, y: number, w: number, h: number) => void;
  onLinkClick        : (id: string) => void;
  onPageJump         : (pageIdx: number) => void;
  // Bookmark anchors
  bookmarkAnchors    : Array<{ id: string; title: string; y: number }>;
  bookmarkPlaceMode  : boolean;
  onPlaceBookmark    : (xPt: number, yPt: number) => void;
  // Page filter
  pageFilter?        : "original" | "color" | "grayscale" | "bw" | "highcontrast" | "sepia" | "warm" | "cool" | "invert";
  // Watermark
  watermark?         : WatermarkConfig | null;
  // Shape delete
  onDeleteShape?     : (id: string) => void;
  // Redaction zones
  redactionZones        : RedactionZone[];
  onAddRedactionZone    : (zone: RedactionZone) => void;
  onRemoveRedactionZone : (id: string) => void;
  // Crop
  cropBox    : CropBox | null;
  cropMode   : boolean;
  onSetCropBox: (box: CropBox | null) => void;
  // Page numbers
  pageNumberConfig  : PageNumberConfig | null;
  displayPageIndex  : number;
  totalPageCount    : number;
}

// Map visual (post-rotation) coordinates back to original page coordinates
function rotateBack(vx: number, vy: number, W: number, H: number, rot: number): [number, number] {
  if (rot === 90)  return [vy, H - vx];
  if (rot === 180) return [W - vx, H - vy];
  if (rot === 270) return [W - vy, vx];
  return [vx, vy];
}

export default function PageOverlay({
  page, displayWidth, edits, addedWords,
  onEdit, onSelect, onClearSelection, onAddWord,
  onEditAdded, onSelectAdded, onRemoveAdded,
  selectedWordIdxs, selectedAddedIds,
  addTextMode, findHighlights, findCurrentHighlight,
  rotation,
  addedImages, onEditImage, onSelectImage, onRemoveImage, selectedImageIds,
  onPlaceImage,
  showEditIndicators,
  drawings, onAddShape, drawTool, drawColor, drawWidth, drawFill, drawOpacity,
  selectedShapeId, onSelectShape, onEditShape,
  stickyNotes, onAddNote, onEditNote, onRemoveNote, noteMode,
  formFields, formValues, onFormValue,
  redactMode, onRedact,
  groups, pageIdx, onGroupDragEnd,
  onBoxSelect,
  links, linkMode, onLinkCreate, onLinkClick, onPageJump,
  bookmarkAnchors, bookmarkPlaceMode, onPlaceBookmark,
  pageFilter,
  watermark,
  onDeleteShape,
  redactionZones, onAddRedactionZone, onRemoveRedactionZone,
  cropBox, cropMode, onSetCropBox,
  pageNumberConfig, displayPageIndex, totalPageCount,
}: Props) {
  const scale         = displayWidth / page.width;
  const displayHeight = page.height * scale;
  const rot           = rotation ?? 0;
  const isSwapped     = rot % 180 !== 0;
  // Dimensions of the outer container (what the layout allocates)
  const wrapW = isSwapped ? displayHeight : displayWidth;
  const wrapH = isSwapped ? displayWidth  : displayHeight;

  const [coverColors,   setCoverColors]   = useState<Record<number, string>>({});
  const [blobSrc,       setBlobSrc]       = useState<string>("");
  const [rubberBand,    setRubberBand]    = useState<{ sx: number; sy: number; ex: number; ey: number } | null>(null);
  const [linkDraft,     setLinkDraft]     = useState<{ sx: number; sy: number; ex: number; ey: number } | null>(null);
  const [hoveredLinkId, setHoveredLinkId] = useState<string | null>(null);
  const pageImgRef       = useRef<HTMLImageElement>(null);
  const blobUrlRef       = useRef<string>("");
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const imageLoadedRef   = useRef(false);

  // Fetch the page image only when the container enters the viewport (lazy load).
  useEffect(() => {
    let cancelled = false;
    const directUrl = `${API_BASE}${page.image_url}`;
    if (!page.image_url) return;

    const load = () => {
      if (imageLoadedRef.current) return;
      imageLoadedRef.current = true;
      const xhr = new XMLHttpRequest();
      xhr.open("GET", directUrl);
      xhr.responseType = "blob";
      xhr.onload = () => {
        if (cancelled) return;
        if (xhr.status >= 200 && xhr.status < 300) {
          const objUrl = URL.createObjectURL(xhr.response as Blob);
          if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
          blobUrlRef.current = objUrl;
          setBlobSrc(objUrl);
        } else {
          setBlobSrc(directUrl);
        }
      };
      xhr.onerror = () => { if (!cancelled) setBlobSrc(directUrl); };
      xhr.send();
    };

    const el = pageContainerRef.current;
    if (!el) { load(); return; }

    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) { observer.disconnect(); load(); } },
      { rootMargin: "200px" }
    );
    observer.observe(el);

    return () => {
      cancelled = true;
      observer.disconnect();
      if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = ""; }
    };
  }, [page.image_url]); // eslint-disable-line react-hooks/exhaustive-deps

  const sampleCoverColors = useCallback(() => {
    const img = pageImgRef.current;
    if (!img || !img.naturalWidth) return;
    try {
      const cvs = document.createElement("canvas");
      cvs.width = img.naturalWidth; cvs.height = img.naturalHeight;
      const ctx = cvs.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const sx = img.naturalWidth / page.width, sy = img.naturalHeight / page.height;
      const colors: Record<number, string> = {};
      for (let i = 0; i < page.words.length; i++) {
        const [wx0, wy0, wx1, wy1] = page.words[i].box;
        const M  = 3;
        const clX = (v: number) => Math.min(img.naturalWidth  - 1, Math.max(0, Math.round(v)));
        const clY = (v: number) => Math.min(img.naturalHeight - 1, Math.max(0, Math.round(v)));
        const px  = (x: number, y: number) => ctx.getImageData(clX(x), clY(y), 1, 1).data;
        const pts = [
          px((wx0-M)*sx, (wy0-M)*sy), px((wx1+M)*sx, (wy0-M)*sy),
          px((wx0-M)*sx, (wy1+M)*sy), px((wx1+M)*sx, (wy1+M)*sy),
        ];
        const r = Math.round(pts.reduce((s, p) => s + p[0], 0) / 4);
        const g = Math.round(pts.reduce((s, p) => s + p[1], 0) / 4);
        const b = Math.round(pts.reduce((s, p) => s + p[2], 0) / 4);
        colors[i] = `rgb(${r},${g},${b})`;
      }
      setCoverColors(colors);
    } catch { /* canvas tainted — white fallback */ }
  }, [page.words, page.width, page.height]);

  const hGuideRef = useRef<HTMLDivElement>(null);
  const vGuideRef = useRef<HTMLDivElement>(null);

  const getSnap = useCallback(
    (wordIdx: number, x0Px: number, y0Px: number): { snapXPx: number; snapYPx: number } => {
      const result = computeSnap(wordIdx, x0Px, y0Px, scale, page.words, edits, page.width, page.height);
      const vGuide = result.guides.find(g => g.type === "v");
      const hGuide = result.guides.find(g => g.type === "h");
      if (vGuideRef.current) {
        vGuideRef.current.style.display = vGuide ? "block" : "none";
        if (vGuide) vGuideRef.current.style.left = `${vGuide.posPt * scale - 0.5}px`;
      }
      if (hGuideRef.current) {
        hGuideRef.current.style.display = hGuide ? "block" : "none";
        if (hGuide) hGuideRef.current.style.top = `${hGuide.posPt * scale - 0.5}px`;
      }
      return { snapXPx: result.snapXPx, snapYPx: result.snapYPx };
    },
    [scale, page.words, page.width, page.height, edits],
  );

  const clearGuides = useCallback(() => {
    if (hGuideRef.current) hGuideRef.current.style.display = "none";
    if (vGuideRef.current) vGuideRef.current.style.display = "none";
  }, []);

  // Look up which group (if any) an item on this page belongs to
  const getGroupId = useCallback((ref: CellRef): string | undefined => {
    return groups.find(g => g.members.some(m => {
      if (m.kind !== ref.kind || m.pageIdx !== ref.pageIdx) return false;
      if (m.kind === "word"  && ref.kind === "word")  return m.wordIdx === ref.wordIdx;
      if (m.kind === "added" && ref.kind === "added") return m.id === ref.id;
      if (m.kind === "image" && ref.kind === "image") return m.id === ref.id;
      return false;
    }))?.id;
  }, [groups]);

  // Compute bounding boxes of each group that has members on this page (in px)
  const groupBoxes = useMemo(() => {
    const boxes: Array<{ groupId: string; x: number; y: number; w: number; h: number }> = [];
    for (const group of groups) {
      const onPage = group.members.filter(m => m.pageIdx === pageIdx);
      if (onPage.length < 2) continue;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const m of onPage) {
        let box: [number, number, number, number] | undefined;
        if (m.kind === "word") {
          const w = page.words[m.wordIdx];
          if (w) {
            const dx = (edits[m.wordIdx]?.dx ?? 0) * scale;
            const dy = (edits[m.wordIdx]?.dy ?? 0) * scale;
            box = [w.box[0] * scale + dx, w.box[1] * scale + dy, w.box[2] * scale + dx, w.box[3] * scale + dy];
          }
        } else if (m.kind === "added") {
          const item = addedWords.find(w => w.id === m.id);
          if (item) {
            const lx = (item.x + (item.dx ?? 0)) * scale;
            const ty = (item.y + (item.dy ?? 0)) * scale - 20;
            box = [lx, ty, lx + 80, ty + 30];
          }
        } else if (m.kind === "image") {
          const img = addedImages.find(i => i.id === m.id);
          if (img) {
            const lx = (img.x + (img.dx ?? 0)) * scale;
            const ty = (img.y + (img.dy ?? 0)) * scale;
            box = [lx, ty, lx + img.width * scale, ty + img.height * scale];
          }
        }
        if (box) {
          minX = Math.min(minX, box[0]); minY = Math.min(minY, box[1]);
          maxX = Math.max(maxX, box[2]); maxY = Math.max(maxY, box[3]);
        }
      }
      if (minX < Infinity) {
        const PAD = 6;
        boxes.push({ groupId: group.id, x: minX - PAD, y: minY - PAD, w: maxX - minX + PAD * 2, h: maxY - minY + PAD * 2 });
      }
    }
    return boxes;
  }, [groups, pageIdx, page.words, edits, addedWords, addedImages, scale]);

  // ── Rubber-band selection ──────────────────────────────────────────────────

  const handlePageMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    const isBackground = target.tagName === "IMG" || target === pageContainerRef.current;
    if (!isBackground) return;
    if (addTextMode || onPlaceImage || noteMode || drawTool || bookmarkPlaceMode) return;

    // In redact mode, drag to create a new redaction zone
    if (redactMode) {
      const containerRect = pageContainerRef.current!.getBoundingClientRect();
      const sx = e.clientX - containerRect.left;
      const sy = e.clientY - containerRect.top;
      let draft: { x: number; y: number; w: number; h: number } | null = null;
      let draftEl: HTMLDivElement | null = null;

      const onMove = (ev: MouseEvent) => {
        const r = pageContainerRef.current?.getBoundingClientRect();
        if (!r) return;
        const ex = ev.clientX - r.left;
        const ey = ev.clientY - r.top;
        const x = Math.min(sx, ex), y = Math.min(sy, ey);
        const w = Math.abs(ex - sx), h = Math.abs(ey - sy);
        draft = { x: x / scale, y: y / scale, w: w / scale, h: h / scale };
        if (!draftEl) {
          draftEl = document.createElement("div");
          draftEl.style.cssText = "position:absolute;background:#000;z-index:18;pointer-events:none;";
          pageContainerRef.current?.appendChild(draftEl);
        }
        Object.assign(draftEl.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        if (draftEl) draftEl.remove();
        if (draft && draft.w > 4 / scale && draft.h > 4 / scale) {
          onAddRedactionZone({ id: nanoid(), ...draft });
        }
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      return;
    }

    const containerRect = pageContainerRef.current!.getBoundingClientRect();
    const sx = e.clientX - containerRect.left;
    const sy = e.clientY - containerRect.top;

    // ── Link creation drag ──────────────────────────────────────────────────
    if (linkMode) {
      setLinkDraft({ sx, sy, ex: sx, ey: sy });

      const onMove = (ev: MouseEvent) => {
        const r = pageContainerRef.current?.getBoundingClientRect();
        if (!r) return;
        setLinkDraft({ sx, sy, ex: ev.clientX - r.left, ey: ev.clientY - r.top });
      };

      const onUp = (ev: MouseEvent) => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        setLinkDraft(null);
        const r = pageContainerRef.current?.getBoundingClientRect();
        if (!r) return;
        const ex = ev.clientX - r.left;
        const ey = ev.clientY - r.top;
        const wPx = Math.abs(ex - sx), hPx = Math.abs(ey - sy);
        if (wPx < 8 || hPx < 8) return;
        const xPt = Math.min(sx, ex) / scale;
        const yPt = Math.min(sy, ey) / scale;
        onLinkCreate(xPt, yPt, wPx / scale, hPx / scale);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      return;
    }

    // ── Rubber-band selection ───────────────────────────────────────────────
    setRubberBand({ sx, sy, ex: sx, ey: sy });

    const onMove = (ev: MouseEvent) => {
      const r = pageContainerRef.current?.getBoundingClientRect();
      if (!r) return;
      setRubberBand({ sx, sy, ex: ev.clientX - r.left, ey: ev.clientY - r.top });
    };

    const onUp = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setRubberBand(null);

      const r = pageContainerRef.current?.getBoundingClientRect();
      if (!r) return;
      const ex = ev.clientX - r.left;
      const ey = ev.clientY - r.top;
      const minXpx = Math.min(sx, ex), maxXpx = Math.max(sx, ex);
      const minYpx = Math.min(sy, ey), maxYpx = Math.max(sy, ey);

      if (maxXpx - minXpx < 5 && maxYpx - minYpx < 5) return;

      const minX = minXpx / scale, minY = minYpx / scale;
      const maxX = maxXpx / scale, maxY = maxYpx / scale;

      const refs: CellRef[] = [];
      for (let i = 0; i < page.words.length; i++) {
        if (edits[i]?.deleted) continue;
        const w = page.words[i];
        const dx = edits[i]?.dx ?? 0, dy = edits[i]?.dy ?? 0;
        const wx0 = w.box[0] + dx, wy0 = w.box[1] + dy;
        const wx1 = w.box[2] + dx, wy1 = w.box[3] + dy;
        if (wx0 < maxX && wx1 > minX && wy0 < maxY && wy1 > minY)
          refs.push({ kind: "word", pageIdx, wordIdx: i });
      }
      for (const item of addedWords) {
        const lx = item.x + (item.dx ?? 0), ty = item.y + (item.dy ?? 0) - 20;
        if (lx < maxX && lx + 100 > minX && ty < maxY && ty + 30 > minY)
          refs.push({ kind: "added", pageIdx, id: item.id });
      }
      for (const img of addedImages) {
        const lx = img.x + (img.dx ?? 0), ty = img.y + (img.dy ?? 0);
        if (lx < maxX && lx + img.width > minX && ty < maxY && ty + img.height > minY)
          refs.push({ kind: "image", pageIdx, id: img.id });
      }

      if (refs.length > 0) onBoxSelect(refs);
      else onClearSelection();
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [addTextMode, onPlaceImage, noteMode, drawTool, linkMode, bookmarkPlaceMode, redactMode, scale, page.words, edits, addedWords, addedImages, pageIdx, onBoxSelect, onClearSelection, onLinkCreate, onAddRedactionZone]);

  return (
    <div style={{ width: wrapW, height: wrapH, position: "relative", userSelect: "none" }}>
      <div
        ref={pageContainerRef}
        className="relative shadow-xl rounded overflow-hidden"
        style={{
          width          : displayWidth,
          height         : displayHeight,
          position       : "absolute",
          left           : (wrapW - displayWidth)  / 2,
          top            : (wrapH - displayHeight) / 2,
          transform      : rot ? `rotate(${rot}deg)` : undefined,
          transformOrigin: "center center",
          cursor         : (addTextMode || onPlaceImage || noteMode || linkMode || bookmarkPlaceMode || redactMode || cropMode) ? "crosshair" : "default",
          clipPath       : (!cropMode && cropBox)
            ? `inset(${cropBox.y * scale}px ${(page.width - cropBox.x - cropBox.w) * scale}px ${(page.height - cropBox.y - cropBox.h) * scale}px ${cropBox.x * scale}px round 4px)`
            : undefined,
        }}
        onMouseDown={handlePageMouseDown}
        onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const vx   = (e.clientX - rect.left) / scale;
            const vy   = (e.clientY - rect.top)  / scale;
            const [ox, oy] = rotateBack(vx, vy, page.width, page.height, rot);
            if (addTextMode)           { onAddWord(ox, oy); }
            else if (bookmarkPlaceMode){ onPlaceBookmark(ox, oy); }
            else if (noteMode)         { onAddNote(ox, oy); }
            else if (onPlaceImage)     { onPlaceImage(ox, oy); }
            else                       { onSelectShape(null); }
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={pageImgRef}
            src={blobSrc || undefined}
            alt={`Page ${page.page_num + 1}`}
            draggable={false}
            onLoad={sampleCoverColors}
            style={{
              width: "100%", height: "100%", display: "block",
              filter: pageFilter === "grayscale"    ? "grayscale(100%)"
                    : pageFilter === "bw"           ? "grayscale(100%) contrast(200%)"
                    : pageFilter === "highcontrast" ? "contrast(200%) brightness(85%)"
                    : pageFilter === "color"        ? "saturate(150%) brightness(1.05)"
                    : pageFilter === "sepia"        ? "sepia(80%)"
                    : pageFilter === "warm"         ? "sepia(30%) saturate(130%) brightness(1.08)"
                    : pageFilter === "cool"         ? "saturate(80%) brightness(1.05) hue-rotate(15deg)"
                    : pageFilter === "invert"       ? "invert(100%)"
                    : "none",
            }}
          />

          {/* Cover rectangles for edited/deleted/redacted words */}
          {page.words.map((word, i) =>
            edits[i] ? (
              <div
                key={`cover-${i}`}
                style={{
                  position     : "absolute",
                  left         : word.box[0] * scale,
                  top          : word.box[1] * scale,
                  width        : (word.box[2] - word.box[0]) * scale,
                  height       : (word.box[3] - word.box[1]) * scale,
                  background   : edits[i]?.redacted ? "#000" : (coverColors[i] ?? "white"),
                  zIndex       : 5,
                  pointerEvents: "none",
                }}
              />
            ) : null
          )}

          {/* Annotation overlays — highlight, underline, strikethrough (drawn regardless of text edit) */}
          {page.words.map((word, i) => {
            const edit = edits[i];
            if (!edit || (!edit.highlight && !edit.underline && !edit.strikethrough)) return null;
            const x0       = word.box[0] * scale;
            const y0       = word.box[1] * scale;
            const w        = (word.box[2] - word.box[0]) * scale;
            const h        = (word.box[3] - word.box[1]) * scale;
            const baseline = word.baseline_y ? (word.baseline_y - word.box[1]) * scale : h;
            const fs       = (edit.fontSize ?? word.font_size ?? 12) * scale;
            const lineH    = Math.max(1, fs * 0.08);
            const dx       = (edit.dx ?? 0) * scale;
            const dy       = (edit.dy ?? 0) * scale;
            const lineColor = numToColor(edit.color ?? word.color ?? 0);
            return (
              <React.Fragment key={`annot-${i}`}>
                {edit.highlight && (
                  <div style={{
                    position: "absolute", left: x0 + dx, top: y0 + dy, width: w, height: h,
                    background: edit.highlight, opacity: 0.45, pointerEvents: "none", zIndex: 6,
                    mixBlendMode: "multiply",
                  }} />
                )}
                {edit.underline && (
                  <div style={{
                    position: "absolute", left: x0 + dx, top: y0 + dy + baseline + 1,
                    width: w, height: lineH, background: lineColor, pointerEvents: "none", zIndex: 7,
                  }} />
                )}
                {edit.strikethrough && (
                  <div style={{
                    position: "absolute", left: x0 + dx, top: y0 + dy + baseline * 0.45,
                    width: w, height: lineH, background: lineColor, pointerEvents: "none", zIndex: 7,
                  }} />
                )}
              </React.Fragment>
            );
          })}

          {/* Snap guides */}
          <div ref={hGuideRef} style={{ display: "none", position: "absolute", left: 0, right: 0, height: 1, background: "#f97316", pointerEvents: "none", zIndex: 50, boxShadow: "0 0 3px rgba(249,115,22,0.8)" }} />
          <div ref={vGuideRef} style={{ display: "none", position: "absolute", top: 0, bottom: 0, width: 1, background: "#f97316", pointerEvents: "none", zIndex: 50, boxShadow: "0 0 3px rgba(249,115,22,0.8)" }} />

          {/* Group bounding boxes */}
          {groupBoxes.map(({ groupId, x, y, w, h }) => (
            <GroupBox key={groupId} groupId={groupId} x={x} y={y} w={w} h={h} scale={scale} onGroupDragEnd={onGroupDragEnd} />
          ))}

          {/* Drawing shapes */}
          <DrawingOverlay
            shapes={drawings}
            scale={scale}
            drawTool={drawTool}
            drawColor={drawColor}
            drawWidth={drawWidth}
            drawFill={drawFill}
            drawOpacity={drawOpacity}
            onAdd={onAddShape}
            selectedShapeId={selectedShapeId}
            onSelectShape={onSelectShape}
            onEditShape={onEditShape}
            onDelete={onDeleteShape}
          />

          {/* Form fields */}
          {formFields.length > 0 && (
            <FormFieldOverlay
              fields={formFields}
              scale={scale}
              formValues={formValues}
              onChange={onFormValue}
            />
          )}

          {/* Existing word overlays (skip deleted and redacted) */}
          {page.words.map((word, i) =>
            (edits[i]?.deleted || edits[i]?.redacted) ? (
              redactMode ? (
                // In redact mode show a click target over the black box to un-redact
                <div
                  key={i}
                  onClick={e => { e.stopPropagation(); onRedact(i); }}
                  style={{
                    position: "absolute",
                    left    : word.box[0] * scale,
                    top     : word.box[1] * scale,
                    width   : (word.box[2] - word.box[0]) * scale,
                    height  : (word.box[3] - word.box[1]) * scale,
                    cursor  : "pointer",
                    zIndex  : 12,
                    outline : "2px dashed rgba(239,68,68,0.6)",
                  }}
                />
              ) : null
            ) : (
              <WordOverlay
                key={i}
                word={word}
                scale={scale}
                wordEdit={edits[i]}
                onEdit={(edit) => onEdit(i, edit)}
                onSelect={(shiftKey) => redactMode ? onRedact(i) : onSelect(i, shiftKey)}
                isSelected={selectedWordIdxs.has(i)}
                isHighlighted={findHighlights.has(i)}
                groupId={getGroupId({ kind: "word", pageIdx, wordIdx: i })}
                onGroupDragEnd={onGroupDragEnd}
                isCurrentHighlight={findCurrentHighlight === i}
                showEditIndicator={showEditIndicators}
                getSnap={(x0Px, y0Px) => getSnap(i, x0Px, y0Px)}
                onDragEnd={clearGuides}
                redactMode={redactMode}
              />
            )
          )}

          {/* Added word overlays */}
          {addedWords.map((item) => (
            <AddedWordOverlay
              key={item.id}
              item={item}
              scale={scale}
              isSelected={selectedAddedIds.has(item.id)}
              onEdit={(word) => onEditAdded(item.id, word)}
              onSelect={(shiftKey) => onSelectAdded(item.id, shiftKey)}
              onRemove={() => onRemoveAdded(item.id)}
              groupId={getGroupId({ kind: "added", pageIdx, id: item.id })}
              onGroupDragEnd={onGroupDragEnd}
            />
          ))}

          {/* Image overlays */}
          {addedImages.map((img) => (
            <AddedImageOverlay
              key={img.id}
              item={img}
              scale={scale}
              isSelected={selectedImageIds.has(img.id)}
              onEdit={(updated) => onEditImage(img.id, updated)}
              onSelect={(shiftKey) => onSelectImage(img.id, shiftKey)}
              onRemove={() => onRemoveImage(img.id)}
              groupId={getGroupId({ kind: "image", pageIdx, id: img.id })}
              onGroupDragEnd={onGroupDragEnd}
            />
          ))}

          {/* Sticky notes */}
          <StickyNoteOverlay
            notes={stickyNotes}
            scale={scale}
            onEdit={onEditNote}
            onRemove={onRemoveNote}
          />

          {/* Bookmark anchor markers */}
          {bookmarkAnchors.map(anchor => (
            <div
              key={anchor.id}
              title={anchor.title}
              style={{
                position : "absolute",
                left     : 0,
                top      : anchor.y * scale - 8,
                zIndex   : 15,
                pointerEvents: "none",
                display  : "flex",
                alignItems: "center",
                gap      : 4,
              }}
            >
              {/* Flag line */}
              <div style={{ width: 24, height: 1, background: "#3b82f6", opacity: 0.7 }} />
              {/* Flag label */}
              <div style={{
                background: "#1d4ed8",
                color: "white",
                fontSize: 9,
                padding: "1px 5px",
                borderRadius: "0 3px 3px 0",
                whiteSpace: "nowrap",
                maxWidth: 120,
                overflow: "hidden",
                textOverflow: "ellipsis",
                opacity: 0.9,
                boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
              }}>
                {anchor.title}
              </div>
            </div>
          ))}

          {/* Watermark overlay */}
          {watermark && (watermark.mode === "image" ? !!watermark.imageDataUrl : !!watermark.text) && (() => {
            const sharedCellStyle: React.CSSProperties = {
              display: "flex", alignItems: "center", justifyContent: "center",
            };
            const textEl = (size: number) => (
              <span style={{
                fontSize: size, color: watermark.color, opacity: watermark.opacity,
                transform: `rotate(${-watermark.angle}deg)`,
                fontWeight: "bold", userSelect: "none", whiteSpace: "nowrap",
              }}>{watermark.text}</span>
            );
            const imgEl = (maxW: string, maxH: string) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={watermark.imageDataUrl} alt="watermark"
                style={{
                  maxWidth: maxW, maxHeight: maxH, objectFit: "contain",
                  opacity: watermark.opacity,
                  transform: `rotate(${-watermark.angle}deg) scale(${watermark.imageScale ?? 1})`,
                  userSelect: "none", pointerEvents: "none",
                }} />
            );
            if (watermark.tile) {
              return (
                <div style={{
                  position: "absolute", inset: 0, pointerEvents: "none", zIndex: 19, overflow: "hidden",
                  display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gridTemplateRows: "repeat(4, 1fr)",
                }}>
                  {Array.from({ length: 12 }).map((_, i) => (
                    <div key={i} style={sharedCellStyle}>
                      {watermark.mode === "image"
                        ? imgEl("90%", "90%")
                        : textEl(watermark.fontSize * scale * 0.45)}
                    </div>
                  ))}
                </div>
              );
            }
            return (
              <div style={{
                position: "absolute", inset: 0, pointerEvents: "none", zIndex: 19,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {watermark.mode === "image"
                  ? imgEl("60%", "60%")
                  : textEl(watermark.fontSize * scale)}
              </div>
            );
          })()}

          {/* Redaction zones — solid black boxes; click to remove in redact mode */}
          {redactionZones.map(zone => (
            <div
              key={zone.id}
              onClick={redactMode ? (e) => { e.stopPropagation(); onRemoveRedactionZone(zone.id); } : undefined}
              style={{
                position: "absolute",
                left    : zone.x * scale,
                top     : zone.y * scale,
                width   : zone.w * scale,
                height  : zone.h * scale,
                background: "#000",
                zIndex  : 18,
                cursor  : redactMode ? "pointer" : "default",
                outline : redactMode ? "2px dashed rgba(239,68,68,0.7)" : "none",
              }}
              title={redactMode ? "Click to remove redaction" : undefined}
            />
          ))}

          {/* Crop overlay — shown when cropMode is active */}
          {cropMode && (
            <CropOverlay
              cropBox={cropBox ?? { x: 0, y: 0, w: page.width, h: page.height }}
              scale={scale}
              pageW={displayWidth}
              pageH={displayHeight}
              onChange={onSetCropBox}
            />
          )}

          {/* Crop border indicator — shown when a crop box exists and not in crop mode */}
          {!cropMode && cropBox && (
            <div style={{
              position: "absolute",
              left  : cropBox.x * scale,
              top   : cropBox.y * scale,
              width : cropBox.w * scale,
              height: cropBox.h * scale,
              border: "1.5px dashed rgba(139,92,246,0.6)",
              pointerEvents: "none",
              zIndex: 18,
            }} />
          )}

          {/* Page numbers */}
          {pageNumberConfig && (() => {
            const text = buildPageNumberText(pageNumberConfig, displayPageIndex, totalPageCount);
            if (!text) return null;
            const pos = pageNumberConfig.position;
            const m = pageNumberConfig.margin * scale;
            const style: React.CSSProperties = {
              position  : "absolute",
              fontSize  : pageNumberConfig.fontSize * scale,
              color     : pageNumberConfig.color,
              fontFamily: "Arial, sans-serif",
              pointerEvents: "none",
              userSelect: "none",
              zIndex    : 21,
              whiteSpace: "nowrap",
              ...(pos.startsWith("top")   ? { top: m }    : { bottom: m }),
              ...(pos.endsWith("left")    ? { left: m }
                : pos.endsWith("right")   ? { right: m }
                : { left: "50%", transform: "translateX(-50%)" }),
            };
            return <div style={style}>{text}</div>;
          })()}

          {/* Placement-mode overlay (text / image / note / bookmark) */}
          {(addTextMode || onPlaceImage || noteMode || bookmarkPlaceMode) && (
            <div style={{ position: "absolute", inset: 0, zIndex: 100, cursor: "crosshair" }} />
          )}

          {/* Rubber-band selection rect */}
          {rubberBand && (() => {
            const x = Math.min(rubberBand.sx, rubberBand.ex);
            const y = Math.min(rubberBand.sy, rubberBand.ey);
            const w = Math.abs(rubberBand.ex - rubberBand.sx);
            const h = Math.abs(rubberBand.ey - rubberBand.sy);
            return (
              <div style={{
                position: "absolute", left: x, top: y, width: w, height: h,
                border: "1.5px solid #f97316", background: "rgba(249,115,22,0.08)",
                pointerEvents: "none", zIndex: 200,
              }} />
            );
          })()}

          {/* Link creation draft rect */}
          {linkDraft && (() => {
            const x = Math.min(linkDraft.sx, linkDraft.ex);
            const y = Math.min(linkDraft.sy, linkDraft.ey);
            const w = Math.abs(linkDraft.ex - linkDraft.sx);
            const h = Math.abs(linkDraft.ey - linkDraft.sy);
            return (
              <div style={{
                position: "absolute", left: x, top: y, width: w, height: h,
                border: "2px solid #2563eb", background: "rgba(37,99,235,0.10)",
                pointerEvents: "none", zIndex: 200,
              }} />
            );
          })()}

          {/* Link annotations */}
          {links.map((link) => {
            const lx = link.x * scale;
            const ly = link.y * scale;
            const lw = link.w * scale;
            const lh = link.h * scale;
            const isHov = hoveredLinkId === link.id;
            const bStyle = link.borderStyle === "none"
              ? (linkMode ? "1px dashed rgba(37,99,235,0.4)" : "none")
              : `2px ${link.borderStyle} ${link.borderColor}`;
            return (
              <div
                key={link.id}
                onClick={(e) => { e.stopPropagation(); onLinkClick(link.id); }}
                onMouseEnter={() => setHoveredLinkId(link.id)}
                onMouseLeave={() => setHoveredLinkId(null)}
                style={{
                  position: "absolute",
                  left: lx, top: ly, width: lw, height: lh,
                  border: bStyle,
                  background: isHov ? "rgba(37,99,235,0.12)" : "transparent",
                  cursor: "pointer",
                  zIndex: 9,
                  borderRadius: 2,
                  boxSizing: "border-box",
                }}
                title={link.url ? `URL: ${link.url}` : `Jump to page ${(link.pageTarget ?? 0) + 1}`}
              >
                {/* Tooltip on hover */}
                {isHov && (
                  <div style={{
                    position: "absolute",
                    bottom: "calc(100% + 4px)",
                    left: 0,
                    background: "#1c1c1e",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 6,
                    padding: "3px 8px",
                    fontSize: 10,
                    color: "#a5b4fc",
                    whiteSpace: "nowrap",
                    pointerEvents: "none",
                    zIndex: 300,
                    maxWidth: 240,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
                  }}>
                    {link.url ? link.url : `→ Page ${(link.pageTarget ?? 0) + 1}`}
                  </div>
                )}
              </div>
            );
          })}
        </div>
    </div>
  );
}
