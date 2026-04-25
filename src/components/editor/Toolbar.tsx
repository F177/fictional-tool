"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Undo2, Redo2, ZoomIn, ZoomOut, Bold, Italic, Underline, Strikethrough, Highlighter, AlignLeft, AlignCenter, AlignRight, Trash2, Type, Search, RotateCcw, RotateCw, PanelLeft, PanelRight, PenLine, ImagePlus, X, Eye, EyeOff, Pen, Square, Circle, ArrowUpRight, Eraser, MessageSquare, Stamp, Group, Ungroup, Layers, Link2, BookOpen, Minus, Triangle, Diamond, Star, Sun, Moon, Pipette, RotateCw as RotateIcon, List, ListOrdered, MousePointer, Crop, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FormatPatch, DrawTool } from "@/lib/api";

export const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

const FONT_FAMILIES = [
  { label: "Arial",           value: "Arial, Helvetica, sans-serif" },
  { label: "Times New Roman", value: "Times New Roman, Times, serif" },
  { label: "Courier New",     value: "Courier New, Courier, monospace" },
  { label: "Georgia",         value: "Georgia, serif" },
  { label: "Verdana",         value: "Verdana, sans-serif" },
  { label: "Calibri",         value: "Calibri, Arial, sans-serif" },
  { label: "Helvetica",       value: "Helvetica, Arial, sans-serif" },
  { label: "Garamond",        value: "Garamond, Georgia, serif" },
];

const FONT_SIZES = [6, 8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72];

export interface ActiveFormat {
  color        : number;
  fontFamily   : string;
  fontSize     : number;
  bold         : boolean;
  italic       : boolean;
  underline    : boolean;
  strikethrough: boolean;
  highlight    : string | null;
  textAlign    : "left" | "center" | "right";
  rotation     : number;
  lineHeight?  : number;
  listType?    : "none" | "bullet" | "numbered";
  opacity?     : number;   // 0–1, default 1
  isAddedWord  : boolean;
}

interface ToolbarProps {
  canUndo        : boolean;
  canRedo        : boolean;
  onUndo         : () => void;
  onRedo         : () => void;
  zoom           : number;
  onZoomChange   : (z: number) => void;
  activeFormat   : ActiveFormat | null;
  onFormatChange : (patch: FormatPatch) => void;
  addTextMode    : boolean;
  onAddTextToggle: () => void;
  hasSelection   : boolean;
  onDeleteSelected: () => void;
  onFindToggle   : () => void;
  sidebarOpen    : boolean;
  onSidebarToggle: () => void;
  onRotateLeft   : () => void;
  onRotateRight  : () => void;
  onSignature    : () => void;
  onInsertImage  : () => void;
  historyOpen           : boolean;
  onHistoryToggle       : () => void;
  showEditIndicators    : boolean;
  onToggleEditIndicators: () => void;
  // Drawing
  drawTool          : DrawTool | null;
  onDrawToolChange  : (t: DrawTool | null) => void;
  drawColor         : string;
  onDrawColorChange : (c: string) => void;
  drawWidth         : number;
  onDrawWidthChange : (w: number) => void;
  drawFill          : string | null;
  onDrawFillChange  : (c: string | null) => void;
  drawOpacity       : number;
  onDrawOpacityChange: (o: number) => void;
  // Redaction + notes
  redactMode   : boolean;
  onRedactToggle: () => void;
  noteMode     : boolean;
  onNoteToggle : () => void;
  // Watermark
  hasWatermark     : boolean;
  onWatermarkToggle: () => void;
  // Crop
  cropMode        : boolean;
  onCropToggle    : () => void;
  // Page numbers
  hasPageNumbers  : boolean;
  onPageNumbers   : () => void;
  // Grouping
  canGroup  : boolean;
  canUngroup: boolean;
  onGroup   : () => void;
  onUngroup : () => void;
  // Layers panel
  layersOpen     : boolean;
  onLayersToggle : () => void;
  // Links
  linkMode       : boolean;
  onLinkToggle   : () => void;
  // Bookmarks panel
  bookmarksOpen  : boolean;
  onBookmarksToggle: () => void;
  // Dark mode
  darkMode       : boolean;
  onDarkModeToggle: () => void;
  // Page filter
  pageFilter         : "original" | "color" | "grayscale" | "bw" | "highcontrast" | "sepia" | "warm" | "cool" | "invert";
  onPageFilterChange : (f: "original" | "color" | "grayscale" | "bw" | "highcontrast" | "sepia" | "warm" | "cool" | "invert") => void;
}

function numToHex(n: number) {
  return "#" + n.toString(16).padStart(6, "0");
}
function hexToNum(hex: string) {
  return parseInt(hex.replace("#", ""), 16);
}

function Sep() {
  return <div className="w-px h-5 bg-border mx-0.5 shrink-0" />;
}

function MiniSep() {
  return <div className="w-px h-4 bg-border/60 mx-0.5 shrink-0" />;
}

async function openEyeDropper(): Promise<string | null> {
  if (!("EyeDropper" in window)) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ed = new (window as any).EyeDropper();
    const { sRGBHex } = await ed.open();
    return sRGBHex as string;
  } catch {
    return null;
  }
}

// Standalone draw tools — always their own button
const SOLO_TOOLS: { tool: DrawTool; icon: React.ReactNode; label: string }[] = [
  { tool: "pen",  icon: <Pen   className="w-3.5 h-3.5" />, label: "Freehand (P)"  },
  { tool: "line", icon: <Minus className="w-3.5 h-3.5" />, label: "Straight line" },
  { tool: "rect", icon: <Square className="w-3.5 h-3.5" />, label: "Rectangle (R)" },
];

// Shapes collapsed into a single picker button
const PICKER_TOOLS: { tool: DrawTool; icon: React.ReactNode; label: string }[] = [
  { tool: "circle",   icon: <Circle       className="w-3.5 h-3.5" />, label: "Circle/Ellipse" },
  { tool: "triangle", icon: <Triangle     className="w-3.5 h-3.5" />, label: "Triangle"       },
  { tool: "diamond",  icon: <Diamond      className="w-3.5 h-3.5" />, label: "Diamond"        },
  { tool: "star",     icon: <Star         className="w-3.5 h-3.5" />, label: "Star"           },
  { tool: "arrow",    icon: <ArrowUpRight className="w-3.5 h-3.5" />, label: "Arrow"          },
];

const PICKER_TOOL_SET = new Set(PICKER_TOOLS.map(t => t.tool));

function ShapePicker({ drawTool, onDrawToolChange }: { drawTool: DrawTool | null; onDrawToolChange: (t: DrawTool | null) => void }) {
  const [open, setOpen]         = useState(false);
  const [flyPos, setFlyPos]     = useState<{ left: number; top: number } | null>(null);
  const btnRef                  = useRef<HTMLButtonElement>(null);
  const flyRef                  = useRef<HTMLDivElement>(null);

  const isPickerActive = drawTool !== null && PICKER_TOOL_SET.has(drawTool);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!btnRef.current?.contains(e.target as Node) && !flyRef.current?.contains(e.target as Node))
        setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const handleClick = () => {
    if (isPickerActive) {
      onDrawToolChange(null);
      setOpen(false);
    } else {
      if (btnRef.current) {
        const r = btnRef.current.getBoundingClientRect();
        setFlyPos({ left: r.left, top: r.bottom + 4 });
      }
      setOpen(o => !o);
    }
  };

  const handleSelect = (tool: DrawTool) => {
    onDrawToolChange(drawTool === tool ? null : tool);
    setOpen(false);
  };

  return (
    <>
      <Button
        ref={btnRef}
        variant={isPickerActive ? "secondary" : "ghost"}
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={handleClick}
        title="Shapes (circle, triangle, diamond, star, arrow)"
      >
        <Square className="w-3.5 h-3.5" />
      </Button>

      {open && flyPos && createPortal(
        <div
          ref={flyRef}
          style={{ position: "fixed", left: flyPos.left, top: flyPos.top, zIndex: 9999 }}
          className="flex gap-0.5 p-1 bg-background border border-border rounded-lg shadow-xl"
        >
          {PICKER_TOOLS.map(({ tool, icon, label }) => (
            <Button
              key={tool}
              variant={drawTool === tool ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8"
              onClick={() => handleSelect(tool)}
              title={label}
            >
              {icon}
            </Button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

export default function Toolbar({
  canUndo, canRedo, onUndo, onRedo,
  zoom, onZoomChange,
  activeFormat, onFormatChange,
  addTextMode, onAddTextToggle,
  hasSelection, onDeleteSelected,
  onFindToggle,
  sidebarOpen, onSidebarToggle,
  onRotateLeft, onRotateRight,
  onSignature, onInsertImage,
  historyOpen, onHistoryToggle,
  showEditIndicators, onToggleEditIndicators,
  drawTool, onDrawToolChange,
  drawColor, onDrawColorChange,
  drawWidth, onDrawWidthChange,
  drawFill, onDrawFillChange,
  drawOpacity, onDrawOpacityChange,
  redactMode, onRedactToggle,
  noteMode, onNoteToggle,
  hasWatermark, onWatermarkToggle,
  cropMode, onCropToggle,
  hasPageNumbers, onPageNumbers,
  canGroup, canUngroup, onGroup, onUngroup,
  layersOpen, onLayersToggle,
  linkMode, onLinkToggle,
  bookmarksOpen, onBookmarksToggle,
  darkMode, onDarkModeToggle,
  pageFilter, onPageFilterChange,
}: ToolbarProps) {
  const fmt = activeFormat;
  const zoomIdx = ZOOM_STEPS.indexOf(zoom);
  const hasEyeDropper = typeof window !== "undefined" && "EyeDropper" in window;

  return (
    <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border/50 bg-background shrink-0 overflow-x-auto select-none">

      {/* ── Left: sidebar + undo/redo ───────────────────────── */}
      <Button variant={sidebarOpen ? "secondary" : "ghost"} size="icon" className="h-7 w-7 shrink-0" onClick={onSidebarToggle} title="Toggle page sidebar">
        <PanelLeft className="w-3.5 h-3.5" />
      </Button>

      <Sep />

      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">
        <Undo2 className="w-3.5 h-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Y)">
        <Redo2 className="w-3.5 h-3.5" />
      </Button>

      <Sep />

      {/* ── Tool palette ────────────────────────────────────── */}

      {/* Select */}
      <Button
        variant={drawTool === null && !addTextMode ? "secondary" : "ghost"}
        size="icon" className="h-7 w-7 shrink-0"
        onClick={() => { onDrawToolChange(null); }}
        title="Select / move (Esc)"
      >
        <MousePointer className="w-3.5 h-3.5" />
      </Button>

      {/* Add text */}
      <Button variant={addTextMode ? "secondary" : "ghost"} size="icon" className="h-7 w-7 shrink-0" onClick={onAddTextToggle} title="Add text (T)">
        <Type className="w-3.5 h-3.5" />
      </Button>

      {/* Standalone draw tools: pen, line, rect */}
      {SOLO_TOOLS.map(({ tool, icon, label }) => (
        <Button
          key={tool}
          variant={drawTool === tool ? "secondary" : "ghost"}
          size="icon" className="h-7 w-7 shrink-0"
          onClick={() => onDrawToolChange(drawTool === tool ? null : tool)}
          title={label}
        >
          {icon}
        </Button>
      ))}

      {/* Shape picker: circle, triangle, diamond, star, arrow */}
      <ShapePicker drawTool={drawTool} onDrawToolChange={onDrawToolChange} />

      {/* Draw options — only visible when a draw tool is active */}
      {drawTool && (
        <>
          <Sep />
          <label className="relative h-7 w-7 flex items-center justify-center rounded hover:bg-accent cursor-pointer shrink-0" title="Stroke color">
            <span className="w-4 h-4 rounded border border-border/60" style={{ background: drawColor }} />
            <input type="color" value={drawColor} onChange={e => onDrawColorChange(e.target.value)}
              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
          </label>
          {hasEyeDropper && (
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" title="Pick stroke color from screen"
              onClick={async () => { const c = await openEyeDropper(); if (c) onDrawColorChange(c); }}>
              <Pipette className="w-3.5 h-3.5" />
            </Button>
          )}
          <button
            onClick={() => onDrawFillChange(drawFill === null ? drawColor : null)}
            className={`h-7 px-1.5 rounded text-[10px] font-medium border transition-colors shrink-0 ${drawFill !== null ? "border-orange-400 text-orange-400" : "border-border text-muted-foreground hover:text-foreground"}`}
            title={drawFill !== null ? "Disable fill" : "Enable fill"}
          >Fill</button>
          {drawFill !== null && (
            <label className="relative h-7 w-7 flex items-center justify-center rounded hover:bg-accent cursor-pointer shrink-0" title="Fill color">
              <span className="w-4 h-4 rounded border border-border/60" style={{ background: drawFill }} />
              <input type="color" value={drawFill} onChange={e => onDrawFillChange(e.target.value)}
                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
            </label>
          )}
          <select value={drawWidth} onChange={e => onDrawWidthChange(Number(e.target.value))}
            className="h-7 w-12 rounded border border-input bg-background px-1 text-xs focus:outline-none cursor-pointer shrink-0"
            title="Stroke width (pt)">
            {[0.5, 1, 1.5, 2, 3, 4, 6, 8, 12].map(w => <option key={w} value={w}>{w}pt</option>)}
          </select>
          <div className="flex items-center gap-1 shrink-0" title="Shape opacity">
            <span className="text-[10px] text-muted-foreground">Op</span>
            <input type="range" min={0.1} max={1} step={0.05} value={drawOpacity}
              onChange={e => onDrawOpacityChange(Number(e.target.value))}
              className="w-14 h-1.5 accent-orange-400 cursor-pointer" />
            <span className="text-[10px] text-muted-foreground w-6">{Math.round(drawOpacity * 100)}%</span>
          </div>
        </>
      )}

      <Sep />

      {/* Annotation tools */}
      <Button variant={noteMode ? "secondary" : "ghost"} size="icon" className="h-7 w-7 shrink-0" onClick={onNoteToggle} title="Sticky note">
        <MessageSquare className="w-3.5 h-3.5" />
      </Button>
      <Button variant={redactMode ? "secondary" : "ghost"} size="icon" className="h-7 w-7 shrink-0" onClick={onRedactToggle} title="Redact — draw or click words to black out">
        <Eraser className="w-3.5 h-3.5" />
      </Button>
      <Button variant={cropMode ? "secondary" : "ghost"} size="icon" className="h-7 w-7 shrink-0" onClick={onCropToggle} title="Crop page">
        <Crop className="w-3.5 h-3.5" />
      </Button>
      <Button variant={hasPageNumbers ? "secondary" : "ghost"} size="icon" className="h-7 w-7 shrink-0" onClick={onPageNumbers} title="Add page numbers">
        <Hash className="w-3.5 h-3.5" />
      </Button>
      <Button variant={linkMode ? "secondary" : "ghost"} size="icon" className="h-7 w-7 shrink-0" onClick={onLinkToggle} title="Add hyperlink (Ctrl+K)">
        <Link2 className="w-3.5 h-3.5" />
      </Button>
      <Button variant={hasWatermark ? "secondary" : "ghost"} size="icon" className="h-7 w-7 shrink-0" onClick={onWatermarkToggle} title="Watermark">
        <Stamp className="w-3.5 h-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onSignature} title="Add signature">
        <PenLine className="w-3.5 h-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onInsertImage} title="Insert image">
        <ImagePlus className="w-3.5 h-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onRotateLeft} title="Rotate page 90° CCW">
        <RotateCcw className="w-3.5 h-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onRotateRight} title="Rotate page 90° CW">
        <RotateCw className="w-3.5 h-3.5" />
      </Button>
      {canGroup && (
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onGroup} title="Group (Ctrl+G)">
          <Group className="w-3.5 h-3.5" />
        </Button>
      )}
      {canUngroup && (
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onUngroup} title="Ungroup (Ctrl+Shift+G)">
          <Ungroup className="w-3.5 h-3.5" />
        </Button>
      )}
      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onFindToggle} title="Find & Replace (Ctrl+H)">
        <Search className="w-3.5 h-3.5" />
      </Button>

      {/* Delete — shown when something is selected but no text format panel */}
      {hasSelection && !fmt && (
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive hover:text-destructive" onClick={onDeleteSelected} title="Delete selected (Del)">
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      )}

      {/* ── Contextual formatting panel — appears when text is selected ── */}
      {fmt && (
        <>
          <Sep />
          <div className="flex items-center gap-0.5 bg-orange-500/[0.07] dark:bg-orange-500/[0.12] border border-orange-400/25 rounded-lg px-2 py-0.5 shrink-0">

            {/* Font family */}
            <select
              value={fmt.fontFamily}
              onChange={e => onFormatChange({ fontFamily: e.target.value })}
              className="h-7 max-w-[110px] rounded border border-input bg-background px-1 text-xs focus:outline-none cursor-pointer"
              style={{ fontFamily: fmt.fontFamily }}
              title="Font family"
            >
              {FONT_FAMILIES.map(f => <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>)}
            </select>

            {/* Font size */}
            <select
              value={FONT_SIZES.includes(Math.round(fmt.fontSize)) ? Math.round(fmt.fontSize) : 12}
              onChange={e => onFormatChange({ fontSize: Number(e.target.value) })}
              className="h-7 w-12 rounded border border-input bg-background px-1 text-xs focus:outline-none cursor-pointer"
              title="Font size (pt)"
            >
              {FONT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            <MiniSep />

            {/* Bold / Italic / Underline / Strikethrough */}
            <Button variant={fmt.bold ? "secondary" : "ghost"} size="icon" className="h-7 w-7" onClick={() => onFormatChange({ bold: !fmt.bold })} title="Bold">
              <Bold className="w-3.5 h-3.5" />
            </Button>
            <Button variant={fmt.italic ? "secondary" : "ghost"} size="icon" className="h-7 w-7" onClick={() => onFormatChange({ italic: !fmt.italic })} title="Italic">
              <Italic className="w-3.5 h-3.5" />
            </Button>
            <Button variant={fmt.underline ? "secondary" : "ghost"} size="icon" className="h-7 w-7" onClick={() => onFormatChange({ underline: !fmt.underline })} title="Underline">
              <Underline className="w-3.5 h-3.5" />
            </Button>
            <Button variant={fmt.strikethrough ? "secondary" : "ghost"} size="icon" className="h-7 w-7" onClick={() => onFormatChange({ strikethrough: !fmt.strikethrough })} title="Strikethrough">
              <Strikethrough className="w-3.5 h-3.5" />
            </Button>

            {/* Highlight */}
            <label className={`relative h-7 w-7 flex items-center justify-center rounded cursor-pointer ${fmt.highlight ? "bg-accent" : "hover:bg-accent"}`} title="Highlight color">
              <span className="flex flex-col items-center gap-[2px]">
                <Highlighter className="w-3.5 h-3.5" />
                <span className="w-4 h-[3px] rounded-sm" style={{ background: fmt.highlight ?? "#fef08a" }} />
              </span>
              <input type="color" value={fmt.highlight ?? "#fef08a"} onChange={e => onFormatChange({ highlight: e.target.value })}
                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
            </label>
            {fmt.highlight && (
              <button onClick={() => onFormatChange({ highlight: null })}
                className="h-7 w-4 flex items-center justify-center text-muted-foreground hover:text-foreground -ml-0.5" title="Remove highlight">
                <X className="w-2.5 h-2.5" />
              </button>
            )}

            {/* Text color */}
            <label className="relative h-7 w-7 flex items-center justify-center rounded hover:bg-accent cursor-pointer" title="Text color">
              <span className="flex flex-col items-center gap-[2px]">
                <span className="text-xs font-bold leading-none" style={{ color: numToHex(fmt.color) }}>A</span>
                <span className="w-4 h-[3px] rounded-sm" style={{ background: numToHex(fmt.color) }} />
              </span>
              <input type="color" value={numToHex(fmt.color)} onChange={e => onFormatChange({ color: hexToNum(e.target.value) })}
                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
            </label>
            {hasEyeDropper && (
              <Button variant="ghost" size="icon" className="h-7 w-7" title="Pick text color from screen"
                onClick={async () => { const c = await openEyeDropper(); if (c) onFormatChange({ color: hexToNum(c) }); }}>
                <Pipette className="w-3.5 h-3.5" />
              </Button>
            )}

            {/* Text opacity */}
            <div className="flex items-center gap-1 shrink-0" title="Text opacity">
              <span className="text-[10px] text-muted-foreground">Op</span>
              <input type="range" min={0.1} max={1} step={0.05}
                value={fmt.opacity ?? 1}
                onChange={e => onFormatChange({ opacity: Number(e.target.value) })}
                className="w-14 h-1.5 accent-orange-400 cursor-pointer" />
              <span className="text-[10px] text-muted-foreground w-6">{Math.round((fmt.opacity ?? 1) * 100)}%</span>
            </div>

            {/* Added-word-only: alignment, rotation, line height, list */}
            {fmt.isAddedWord && (
              <>
                <MiniSep />
                <Button variant={fmt.textAlign === "left"   ? "secondary" : "ghost"} size="icon" className="h-7 w-7" onClick={() => onFormatChange({ textAlign: "left"   })} title="Align left"><AlignLeft   className="w-3.5 h-3.5" /></Button>
                <Button variant={fmt.textAlign === "center" ? "secondary" : "ghost"} size="icon" className="h-7 w-7" onClick={() => onFormatChange({ textAlign: "center" })} title="Align center"><AlignCenter className="w-3.5 h-3.5" /></Button>
                <Button variant={fmt.textAlign === "right"  ? "secondary" : "ghost"} size="icon" className="h-7 w-7" onClick={() => onFormatChange({ textAlign: "right"  })} title="Align right"><AlignRight  className="w-3.5 h-3.5" /></Button>
                <div className="flex items-center gap-0.5 ml-0.5" title="Text rotation">
                  <RotateIcon className="w-3 h-3 text-muted-foreground shrink-0" />
                  <input
                    type="number" min={-180} max={180} step={5}
                    value={Math.round(fmt.rotation ?? 0)}
                    onChange={e => onFormatChange({ rotation: Number(e.target.value) })}
                    className="h-6 w-12 rounded border border-input bg-background px-1 text-xs focus:outline-none focus:ring-1 focus:ring-orange-400"
                    title="Rotation in degrees"
                  />
                  <span className="text-[10px] text-muted-foreground">°</span>
                </div>
                <MiniSep />
                <div className="flex items-center gap-0.5" title="Line spacing">
                  <span className="text-[10px] text-muted-foreground">↕</span>
                  <select
                    value={fmt.lineHeight ?? 1.3}
                    onChange={e => onFormatChange({ lineHeight: Number(e.target.value) })}
                    className="h-6 w-14 rounded border border-input bg-background px-1 text-xs focus:outline-none cursor-pointer"
                  >
                    {[0.8, 1.0, 1.15, 1.3, 1.5, 1.75, 2.0, 2.5, 3.0].map(v =>
                      <option key={v} value={v}>{v}×</option>
                    )}
                  </select>
                </div>
                <Button variant={fmt.listType === "bullet"   ? "secondary" : "ghost"} size="icon" className="h-7 w-7"
                  onClick={() => onFormatChange({ listType: fmt.listType === "bullet"   ? "none" : "bullet"   })} title="Bullet list">
                  <List className="w-3.5 h-3.5" />
                </Button>
                <Button variant={fmt.listType === "numbered" ? "secondary" : "ghost"} size="icon" className="h-7 w-7"
                  onClick={() => onFormatChange({ listType: fmt.listType === "numbered" ? "none" : "numbered" })} title="Numbered list">
                  <ListOrdered className="w-3.5 h-3.5" />
                </Button>
              </>
            )}

            <MiniSep />

            {/* Delete */}
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={onDeleteSelected} title="Delete selected (Del)">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </>
      )}

      {/* Idle hint */}
      {!fmt && !drawTool && !hasSelection && (
        <span className="ml-2 text-xs text-muted-foreground/60 hidden xl:block pointer-events-none">
          Select text or draw a shape to format
        </span>
      )}

      <div className="flex-1 min-w-0" />

      {/* ── Right: zoom + panels + view ─────────────────────── */}
      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" disabled={zoom <= ZOOM_STEPS[0]}
        onClick={() => zoomIdx > 0 && onZoomChange(ZOOM_STEPS[zoomIdx - 1])} title="Zoom out (Ctrl+-)">
        <ZoomOut className="w-3.5 h-3.5" />
      </Button>
      <button
        className="text-xs font-mono w-11 text-center tabular-nums hover:bg-accent rounded py-0.5 shrink-0"
        onClick={() => onZoomChange(1)} title="Reset zoom (Ctrl+0)">
        {Math.round(zoom * 100)}%
      </button>
      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
        onClick={() => zoomIdx < ZOOM_STEPS.length - 1 && onZoomChange(ZOOM_STEPS[zoomIdx + 1])} title="Zoom in (Ctrl+=)">
        <ZoomIn className="w-3.5 h-3.5" />
      </Button>

      <Sep />

      <Button variant={showEditIndicators ? "secondary" : "ghost"} size="icon" className="h-7 w-7 shrink-0"
        onClick={onToggleEditIndicators} title={showEditIndicators ? "Hide edit indicators" : "Show edit indicators"}>
        {showEditIndicators ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
      </Button>
      <Button variant={bookmarksOpen ? "secondary" : "ghost"} size="icon" className="h-7 w-7 shrink-0"
        onClick={onBookmarksToggle} title="Bookmarks panel">
        <BookOpen className="w-3.5 h-3.5" />
      </Button>
      <Button variant={layersOpen ? "secondary" : "ghost"} size="icon" className="h-7 w-7 shrink-0"
        onClick={onLayersToggle} title="Layers panel">
        <Layers className="w-3.5 h-3.5" />
      </Button>
      <Button variant={historyOpen ? "secondary" : "ghost"} size="icon" className="h-7 w-7 shrink-0"
        onClick={onHistoryToggle} title="Edit history (Ctrl+Shift+H)">
        <PanelRight className="w-3.5 h-3.5" />
      </Button>

      <Sep />

      <select
        value={pageFilter}
        onChange={e => onPageFilterChange(e.target.value as "original" | "color" | "grayscale" | "bw" | "highcontrast" | "sepia" | "warm" | "cool" | "invert")}
        className="h-7 rounded border border-input bg-background px-1 text-xs focus:outline-none cursor-pointer shrink-0"
        title="Page view filter"
      >
        <option value="original">Original</option>
        <option value="color">Color+</option>
        <option value="grayscale">Grayscale</option>
        <option value="bw">B&amp;W</option>
        <option value="highcontrast">Hi-Contrast</option>
        <option value="sepia">Sepia</option>
        <option value="warm">Warm</option>
        <option value="cool">Cool</option>
        <option value="invert">Invert</option>
      </select>

      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"
        onClick={onDarkModeToggle} title={darkMode ? "Switch to light mode" : "Switch to dark mode"}>
        {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
      </Button>
    </div>
  );
}
