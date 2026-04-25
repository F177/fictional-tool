"use client";

import { Undo2, Redo2, ZoomIn, ZoomOut, Bold, Italic, Underline, Strikethrough, Highlighter, AlignLeft, AlignCenter, AlignRight, Trash2, Type, Search, RotateCcw, RotateCw, PanelLeft, PanelRight, PenLine, ImagePlus, X, Eye, EyeOff, Pen, Square, Circle, ArrowUpRight, Eraser, MessageSquare, Stamp, Group, Ungroup, Layers, Link2, BookOpen, Minus, Triangle, Diamond, Star, Sun, Moon, Pipette, RotateCw as RotateIcon, List, ListOrdered } from "lucide-react";
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
  pageFilter         : "original" | "color" | "grayscale" | "bw" | "highcontrast";
  onPageFilterChange : (f: "original" | "color" | "grayscale" | "bw" | "highcontrast") => void;
}

function numToHex(n: number) {
  return "#" + n.toString(16).padStart(6, "0");
}
function hexToNum(hex: string) {
  return parseInt(hex.replace("#", ""), 16);
}
function Sep() {
  return <div className="w-px h-5 bg-border mx-1 shrink-0" />;
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

const DRAW_TOOLS: { tool: DrawTool; icon: React.ReactNode; label: string }[] = [
  { tool: "pen",      icon: <Pen      className="w-3.5 h-3.5" />, label: "Freehand (P)"      },
  { tool: "line",     icon: <Minus    className="w-3.5 h-3.5" />, label: "Straight line"      },
  { tool: "rect",     icon: <Square   className="w-3.5 h-3.5" />, label: "Rectangle (R)"      },
  { tool: "circle",   icon: <Circle   className="w-3.5 h-3.5" />, label: "Circle/Ellipse (C)" },
  { tool: "triangle", icon: <Triangle className="w-3.5 h-3.5" />, label: "Triangle"           },
  { tool: "diamond",  icon: <Diamond  className="w-3.5 h-3.5" />, label: "Diamond"            },
  { tool: "star",     icon: <Star     className="w-3.5 h-3.5" />, label: "Star"               },
  { tool: "arrow",    icon: <ArrowUpRight className="w-3.5 h-3.5" />, label: "Arrow (A)"      },
];

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
  canGroup, canUngroup, onGroup, onUngroup,
  layersOpen, onLayersToggle,
  linkMode, onLinkToggle,
  bookmarksOpen, onBookmarksToggle,
  darkMode, onDarkModeToggle,
  pageFilter, onPageFilterChange,
}: ToolbarProps) {
  const fmt = activeFormat;
  const off = !fmt;
  const zoomIdx = ZOOM_STEPS.indexOf(zoom);
  const hasEyeDropper = typeof window !== "undefined" && "EyeDropper" in window;

  return (
    <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-border/50 bg-background shrink-0 flex-wrap select-none">

      {/* Sidebar toggle */}
      <Button variant={sidebarOpen ? "secondary" : "ghost"} size="icon" className="h-7 w-7" onClick={onSidebarToggle} title="Toggle page sidebar">
        <PanelLeft className="w-3.5 h-3.5" />
      </Button>

      <Sep />

      {/* Add Text */}
      <Button variant={addTextMode ? "secondary" : "ghost"} size="icon" className="h-7 w-7" onClick={onAddTextToggle} title="Add text (T)">
        <Type className="w-3.5 h-3.5" />
      </Button>

      {/* Delete */}
      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" disabled={!hasSelection} onClick={onDeleteSelected} title="Delete selected (Del)">
        <Trash2 className="w-3.5 h-3.5" />
      </Button>

      {/* Group / Ungroup */}
      {canGroup && (
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onGroup} title="Group (Ctrl+G)">
          <Group className="w-3.5 h-3.5" />
        </Button>
      )}
      {canUngroup && (
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onUngroup} title="Ungroup (Ctrl+Shift+G)">
          <Ungroup className="w-3.5 h-3.5" />
        </Button>
      )}

      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onFindToggle} title="Find & Replace (Ctrl+H)">
        <Search className="w-3.5 h-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onSignature} title="Add signature">
        <PenLine className="w-3.5 h-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onInsertImage} title="Insert image">
        <ImagePlus className="w-3.5 h-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRotateLeft} title="Rotate page 90° CCW">
        <RotateCcw className="w-3.5 h-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRotateRight} title="Rotate page 90° CW">
        <RotateCw className="w-3.5 h-3.5" />
      </Button>

      <Sep />

      {/* Drawing tools */}
      {DRAW_TOOLS.map(({ tool, icon, label }) => (
        <Button
          key={tool}
          variant={drawTool === tool ? "secondary" : "ghost"}
          size="icon" className="h-7 w-7"
          onClick={() => onDrawToolChange(drawTool === tool ? null : tool)}
          title={label}
        >
          {icon}
        </Button>
      ))}

      {/* Stroke color + eyedropper */}
      <label className="relative h-7 w-7 flex items-center justify-center rounded hover:bg-accent cursor-pointer" title="Stroke color">
        <span className="w-4 h-4 rounded border border-border/60" style={{ background: drawColor }} />
        <input type="color" value={drawColor} onChange={e => onDrawColorChange(e.target.value)}
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
      </label>
      {hasEyeDropper && (
        <Button variant="ghost" size="icon" className="h-7 w-7" title="Pick stroke color from screen"
          onClick={async () => { const c = await openEyeDropper(); if (c) onDrawColorChange(c); }}>
          <Pipette className="w-3.5 h-3.5" />
        </Button>
      )}

      {/* Fill color toggle + picker */}
      <button
        onClick={() => onDrawFillChange(drawFill === null ? drawColor : null)}
        className={`h-7 px-1.5 rounded text-[10px] font-medium border transition-colors ${drawFill !== null ? "border-orange-400 text-orange-400" : "border-border text-muted-foreground hover:text-foreground"}`}
        title={drawFill !== null ? "Disable fill" : "Enable fill"}
      >
        Fill
      </button>
      {drawFill !== null && (
        <label className="relative h-7 w-7 flex items-center justify-center rounded hover:bg-accent cursor-pointer" title="Fill color">
          <span className="w-4 h-4 rounded border border-border/60" style={{ background: drawFill }} />
          <input type="color" value={drawFill} onChange={e => onDrawFillChange(e.target.value)}
            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
        </label>
      )}

      {/* Stroke width */}
      <select value={drawWidth} onChange={e => onDrawWidthChange(Number(e.target.value))}
        className="h-7 w-12 rounded border border-input bg-background px-1 text-xs focus:outline-none cursor-pointer"
        title="Stroke width (pt)">
        {[0.5, 1, 1.5, 2, 3, 4, 6, 8, 12].map(w => <option key={w} value={w}>{w}pt</option>)}
      </select>

      {/* Opacity */}
      <div className="flex items-center gap-1" title="Shape opacity">
        <span className="text-[10px] text-muted-foreground">Op</span>
        <input type="range" min={0.1} max={1} step={0.05} value={drawOpacity}
          onChange={e => onDrawOpacityChange(Number(e.target.value))}
          className="w-14 h-1.5 accent-orange-400 cursor-pointer" />
        <span className="text-[10px] text-muted-foreground w-6">{Math.round(drawOpacity * 100)}%</span>
      </div>

      <Sep />

      {/* Redact / Note / Link / Watermark */}
      <Button variant={redactMode ? "secondary" : "ghost"} size="icon" className="h-7 w-7" onClick={onRedactToggle} title="Redact (black-box)">
        <Eraser className="w-3.5 h-3.5" />
      </Button>
      <Button variant={noteMode ? "secondary" : "ghost"} size="icon" className="h-7 w-7" onClick={onNoteToggle} title="Sticky note">
        <MessageSquare className="w-3.5 h-3.5" />
      </Button>
      <Button variant={linkMode ? "secondary" : "ghost"} size="icon" className="h-7 w-7" onClick={onLinkToggle} title="Add hyperlink (Ctrl+K)">
        <Link2 className="w-3.5 h-3.5" />
      </Button>
      <Button variant={hasWatermark ? "secondary" : "ghost"} size="icon" className="h-7 w-7" onClick={onWatermarkToggle} title="Watermark">
        <Stamp className="w-3.5 h-3.5" />
      </Button>

      <Sep />

      {/* Undo / Redo */}
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">
        <Undo2 className="w-3.5 h-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Y)">
        <Redo2 className="w-3.5 h-3.5" />
      </Button>

      <Sep />

      {/* Font family */}
      <select disabled={off} value={fmt?.fontFamily ?? "Arial, Helvetica, sans-serif"}
        onChange={e => onFormatChange({ fontFamily: e.target.value })}
        className="h-7 max-w-[160px] rounded border border-input bg-background px-2 text-xs disabled:opacity-40 focus:outline-none cursor-pointer"
        style={{ fontFamily: fmt?.fontFamily }} title="Font family">
        {FONT_FAMILIES.map(f => <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>)}
      </select>

      {/* Font size */}
      <select disabled={off}
        value={FONT_SIZES.includes(Math.round(fmt?.fontSize ?? 12)) ? Math.round(fmt?.fontSize ?? 12) : 12}
        onChange={e => onFormatChange({ fontSize: Number(e.target.value) })}
        className="h-7 w-14 rounded border border-input bg-background px-1 text-xs disabled:opacity-40 focus:outline-none cursor-pointer"
        title="Font size (pt)">
        {FONT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
      </select>

      <Sep />

      {/* Bold / Italic / Underline / Strikethrough */}
      <Button variant={fmt?.bold ? "secondary" : "ghost"} size="icon" className="h-7 w-7" disabled={off} onClick={() => onFormatChange({ bold: !fmt!.bold })} title="Bold">
        <Bold className="w-3.5 h-3.5" />
      </Button>
      <Button variant={fmt?.italic ? "secondary" : "ghost"} size="icon" className="h-7 w-7" disabled={off} onClick={() => onFormatChange({ italic: !fmt!.italic })} title="Italic">
        <Italic className="w-3.5 h-3.5" />
      </Button>
      <Button variant={fmt?.underline ? "secondary" : "ghost"} size="icon" className="h-7 w-7" disabled={off} onClick={() => onFormatChange({ underline: !fmt!.underline })} title="Underline">
        <Underline className="w-3.5 h-3.5" />
      </Button>
      <Button variant={fmt?.strikethrough ? "secondary" : "ghost"} size="icon" className="h-7 w-7" disabled={off} onClick={() => onFormatChange({ strikethrough: !fmt!.strikethrough })} title="Strikethrough">
        <Strikethrough className="w-3.5 h-3.5" />
      </Button>

      {/* Highlight */}
      <label className={`relative h-7 w-7 flex items-center justify-center rounded cursor-pointer ${off ? "opacity-40 pointer-events-none" : fmt?.highlight ? "bg-accent" : "hover:bg-accent"}`} title="Highlight color">
        <span className="flex flex-col items-center gap-[2px]">
          <Highlighter className="w-3.5 h-3.5" />
          <span className="w-4 h-[3px] rounded-sm" style={{ background: fmt?.highlight ?? "#fef08a" }} />
        </span>
        <input type="color" disabled={off} value={fmt?.highlight ?? "#fef08a"} onChange={e => onFormatChange({ highlight: e.target.value })}
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
      </label>
      {!off && fmt?.highlight && (
        <button onClick={() => onFormatChange({ highlight: null })}
          className="h-7 w-4 flex items-center justify-center text-muted-foreground hover:text-foreground -ml-0.5" title="Remove highlight">
          <X className="w-2.5 h-2.5" />
        </button>
      )}

      {/* Text alignment + rotation — only for added text boxes */}
      {fmt?.isAddedWord && (
        <>
          <Sep />
          <Button variant={fmt.textAlign === "left"   ? "secondary" : "ghost"} size="icon" className="h-7 w-7" onClick={() => onFormatChange({ textAlign: "left"   })} title="Align left">
            <AlignLeft className="w-3.5 h-3.5" />
          </Button>
          <Button variant={fmt.textAlign === "center" ? "secondary" : "ghost"} size="icon" className="h-7 w-7" onClick={() => onFormatChange({ textAlign: "center" })} title="Align center">
            <AlignCenter className="w-3.5 h-3.5" />
          </Button>
          <Button variant={fmt.textAlign === "right"  ? "secondary" : "ghost"} size="icon" className="h-7 w-7" onClick={() => onFormatChange({ textAlign: "right"  })} title="Align right">
            <AlignRight className="w-3.5 h-3.5" />
          </Button>
          {/* Text rotation */}
          <div className="flex items-center gap-1 ml-1" title="Text rotation">
            <RotateIcon className="w-3 h-3 text-muted-foreground" />
            <input type="number" min={-180} max={180} step={5}
              value={Math.round(fmt.rotation ?? 0)}
              onChange={e => onFormatChange({ rotation: Number(e.target.value) })}
              className="h-6 w-14 rounded border border-input bg-background px-1 text-xs focus:outline-none focus:ring-1 focus:ring-orange-400"
              title="Rotation in degrees" />
            <span className="text-[10px] text-muted-foreground">°</span>
          </div>
          {/* Line height */}
          <div className="flex items-center gap-1 ml-1" title="Line spacing">
            <span className="text-[10px] text-muted-foreground">↕</span>
            <select value={fmt.lineHeight ?? 1.3}
              onChange={e => onFormatChange({ lineHeight: Number(e.target.value) })}
              className="h-6 w-14 rounded border border-input bg-background px-1 text-xs focus:outline-none cursor-pointer">
              {[0.8, 1.0, 1.15, 1.3, 1.5, 1.75, 2.0, 2.5, 3.0].map(v =>
                <option key={v} value={v}>{v}×</option>
              )}
            </select>
          </div>
          {/* List type */}
          <Button variant={fmt.listType === "bullet" ? "secondary" : "ghost"} size="icon" className="h-7 w-7"
            onClick={() => onFormatChange({ listType: fmt.listType === "bullet" ? "none" : "bullet" })}
            title="Bullet list">
            <List className="w-3.5 h-3.5" />
          </Button>
          <Button variant={fmt.listType === "numbered" ? "secondary" : "ghost"} size="icon" className="h-7 w-7"
            onClick={() => onFormatChange({ listType: fmt.listType === "numbered" ? "none" : "numbered" })}
            title="Numbered list">
            <ListOrdered className="w-3.5 h-3.5" />
          </Button>
        </>
      )}

      {/* Text color + eyedropper */}
      <label className={`relative h-7 w-7 flex items-center justify-center rounded hover:bg-accent cursor-pointer ${off ? "opacity-40 pointer-events-none" : ""}`} title="Text color">
        <span className="flex flex-col items-center gap-[2px]">
          <span className="text-xs font-bold leading-none" style={{ color: fmt ? numToHex(fmt.color) : "#000" }}>A</span>
          <span className="w-4 h-[3px] rounded-sm" style={{ background: fmt ? numToHex(fmt.color) : "#000" }} />
        </span>
        <input type="color" disabled={off} value={fmt ? numToHex(fmt.color) : "#000000"}
          onChange={e => onFormatChange({ color: hexToNum(e.target.value) })}
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
      </label>
      {hasEyeDropper && !off && (
        <Button variant="ghost" size="icon" className="h-7 w-7" title="Pick text color from screen"
          onClick={async () => { const c = await openEyeDropper(); if (c) onFormatChange({ color: hexToNum(c) }); }}>
          <Pipette className="w-3.5 h-3.5" />
        </Button>
      )}

      <Sep />

      {/* Zoom */}
      <Button variant="ghost" size="icon" className="h-7 w-7" disabled={zoom <= ZOOM_STEPS[0]}
        onClick={() => zoomIdx > 0 && onZoomChange(ZOOM_STEPS[zoomIdx - 1])} title="Zoom out (Ctrl+-)">
        <ZoomOut className="w-3.5 h-3.5" />
      </Button>
      <button className="text-xs font-mono w-11 text-center tabular-nums hover:bg-accent rounded py-0.5"
        onClick={() => onZoomChange(1)} title="Reset zoom (Ctrl+0)">
        {Math.round(zoom * 100)}%
      </button>
      <Button variant="ghost" size="icon" className="h-7 w-7" disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
        onClick={() => zoomIdx < ZOOM_STEPS.length - 1 && onZoomChange(ZOOM_STEPS[zoomIdx + 1])} title="Zoom in (Ctrl+=)">
        <ZoomIn className="w-3.5 h-3.5" />
      </Button>

      {!fmt && (
        <span className="ml-2 text-xs text-muted-foreground hidden sm:block">
          Click a word to select it
        </span>
      )}

      <div className="flex-1" />

      {/* Right-side panel toggles */}
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

      {/* Page filter */}
      <select
        value={pageFilter}
        onChange={e => onPageFilterChange(e.target.value as "original" | "color" | "grayscale" | "bw" | "highcontrast")}
        className="h-7 rounded border border-input bg-background px-1 text-xs focus:outline-none cursor-pointer shrink-0"
        title="Page view filter"
      >
        <option value="original">Original</option>
        <option value="color">Color</option>
        <option value="grayscale">Grayscale</option>
        <option value="bw">Black &amp; White</option>
        <option value="highcontrast">High Contrast</option>
      </select>

      {/* Dark mode toggle */}
      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"
        onClick={onDarkModeToggle} title={darkMode ? "Switch to light mode" : "Switch to dark mode"}>
        {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
      </Button>
    </div>
  );
}
