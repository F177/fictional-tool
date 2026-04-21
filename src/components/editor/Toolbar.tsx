"use client";

import { Undo2, Redo2, ZoomIn, ZoomOut, Bold, Italic, Underline, Strikethrough, Highlighter, AlignLeft, AlignCenter, AlignRight, Trash2, Type, Search, RotateCcw, RotateCw, PanelLeft, PanelRight, PenLine, ImagePlus, X, Eye, EyeOff, Pen, Square, Circle, ArrowUpRight, Eraser, MessageSquare, Stamp, Group, Ungroup, Layers, Link2, BookOpen } from "lucide-react";
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
  redactMode, onRedactToggle,
  noteMode, onNoteToggle,
  hasWatermark, onWatermarkToggle,
  canGroup, canUngroup, onGroup, onUngroup,
  layersOpen, onLayersToggle,
  linkMode, onLinkToggle,
  bookmarksOpen, onBookmarksToggle,
}: ToolbarProps) {
  const fmt = activeFormat;
  const off = !fmt;
  const zoomIdx = ZOOM_STEPS.indexOf(zoom);

  return (
    <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-border/50 bg-background shrink-0 flex-wrap select-none">

      {/* Sidebar toggle */}
      <Button
        variant={sidebarOpen ? "secondary" : "ghost"}
        size="icon" className="h-7 w-7"
        onClick={onSidebarToggle}
        title="Toggle page sidebar"
      >
        <PanelLeft className="w-3.5 h-3.5" />
      </Button>

      <Sep />

      {/* Add Text */}
      <Button
        variant={addTextMode ? "secondary" : "ghost"}
        size="icon" className="h-7 w-7"
        onClick={onAddTextToggle}
        title="Add text (T) — click anywhere on the page"
      >
        <Type className="w-3.5 h-3.5" />
      </Button>

      {/* Delete */}
      <Button
        variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
        disabled={!hasSelection}
        onClick={onDeleteSelected}
        title="Delete selected word (Del)"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </Button>

      {/* Group / Ungroup */}
      {canGroup && (
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onGroup} title="Group selected elements (Ctrl+G)">
          <Group className="w-3.5 h-3.5" />
        </Button>
      )}
      {canUngroup && (
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onUngroup} title="Ungroup (Ctrl+Shift+G)">
          <Ungroup className="w-3.5 h-3.5" />
        </Button>
      )}

      {/* Find & Replace */}
      <Button
        variant="ghost" size="icon" className="h-7 w-7"
        onClick={onFindToggle}
        title="Find & Replace (Ctrl+H)"
      >
        <Search className="w-3.5 h-3.5" />
      </Button>

      {/* Signature */}
      <Button
        variant="ghost" size="icon" className="h-7 w-7"
        onClick={onSignature}
        title="Add signature"
      >
        <PenLine className="w-3.5 h-3.5" />
      </Button>

      {/* Insert Image */}
      <Button
        variant="ghost" size="icon" className="h-7 w-7"
        onClick={onInsertImage}
        title="Insert image"
      >
        <ImagePlus className="w-3.5 h-3.5" />
      </Button>

      {/* Rotate */}
      <Button
        variant="ghost" size="icon" className="h-7 w-7"
        onClick={onRotateLeft}
        title="Rotate page 90° counter-clockwise"
      >
        <RotateCcw className="w-3.5 h-3.5" />
      </Button>
      <Button
        variant="ghost" size="icon" className="h-7 w-7"
        onClick={onRotateRight}
        title="Rotate page 90° clockwise"
      >
        <RotateCw className="w-3.5 h-3.5" />
      </Button>

      <Sep />

      {/* Drawing tools */}
      {(["pen", "rect", "circle", "arrow"] as DrawTool[]).map((tool) => {
        const Icon = tool === "pen" ? Pen : tool === "rect" ? Square : tool === "circle" ? Circle : ArrowUpRight;
        const label = tool === "pen" ? "Freehand (P)" : tool === "rect" ? "Rectangle (R)" : tool === "circle" ? "Circle/Ellipse (C)" : "Arrow (A)";
        return (
          <Button
            key={tool}
            variant={drawTool === tool ? "secondary" : "ghost"}
            size="icon" className="h-7 w-7"
            onClick={() => onDrawToolChange(drawTool === tool ? null : tool)}
            title={label}
          >
            <Icon className="w-3.5 h-3.5" />
          </Button>
        );
      })}

      {/* Draw color */}
      <label className="relative h-7 w-7 flex items-center justify-center rounded hover:bg-accent cursor-pointer" title="Shape color">
        <span className="w-4 h-4 rounded border border-border/60" style={{ background: drawColor }} />
        <input type="color" value={drawColor} onChange={e => onDrawColorChange(e.target.value)}
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
      </label>

      {/* Draw width */}
      <select
        value={drawWidth}
        onChange={e => onDrawWidthChange(Number(e.target.value))}
        className="h-7 w-12 rounded border border-input bg-background px-1 text-xs focus:outline-none focus:ring-1 focus:ring-violet-400 cursor-pointer"
        title="Stroke width (pt)"
      >
        {[1, 1.5, 2, 3, 4, 6, 8].map(w => <option key={w} value={w}>{w}pt</option>)}
      </select>

      <Sep />

      {/* Redact */}
      <Button
        variant={redactMode ? "secondary" : "ghost"}
        size="icon" className="h-7 w-7"
        onClick={onRedactToggle}
        title="Redact (black-box) — click words to redact"
      >
        <Eraser className="w-3.5 h-3.5" />
      </Button>

      {/* Sticky note */}
      <Button
        variant={noteMode ? "secondary" : "ghost"}
        size="icon" className="h-7 w-7"
        onClick={onNoteToggle}
        title="Add sticky note — click page to place"
      >
        <MessageSquare className="w-3.5 h-3.5" />
      </Button>

      {/* Link tool */}
      <Button
        variant={linkMode ? "secondary" : "ghost"}
        size="icon" className="h-7 w-7"
        onClick={onLinkToggle}
        title="Add/edit hyperlinks — drag to create a link region (Ctrl+K)"
      >
        <Link2 className="w-3.5 h-3.5" />
      </Button>

      {/* Watermark */}
      <Button
        variant={hasWatermark ? "secondary" : "ghost"}
        size="icon" className="h-7 w-7"
        onClick={onWatermarkToggle}
        title={hasWatermark ? "Edit watermark" : "Add watermark"}
      >
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
      <select
        disabled={off}
        value={fmt?.fontFamily ?? "Arial, Helvetica, sans-serif"}
        onChange={(e) => onFormatChange({ fontFamily: e.target.value })}
        className="h-7 max-w-[160px] rounded border border-input bg-background px-2 text-xs disabled:opacity-40 focus:outline-none focus:ring-1 focus:ring-violet-400 cursor-pointer"
        style={{ fontFamily: fmt?.fontFamily }}
        title="Font family"
      >
        {FONT_FAMILIES.map((f) => (
          <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
            {f.label}
          </option>
        ))}
      </select>

      {/* Font size */}
      <select
        disabled={off}
        value={FONT_SIZES.includes(Math.round(fmt?.fontSize ?? 12)) ? Math.round(fmt?.fontSize ?? 12) : 12}
        onChange={(e) => onFormatChange({ fontSize: Number(e.target.value) })}
        className="h-7 w-14 rounded border border-input bg-background px-1 text-xs disabled:opacity-40 focus:outline-none focus:ring-1 focus:ring-violet-400 cursor-pointer"
        title="Font size (pt)"
      >
        {FONT_SIZES.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      <Sep />

      {/* Bold */}
      <Button
        variant={fmt?.bold ? "secondary" : "ghost"}
        size="icon" className="h-7 w-7"
        disabled={off}
        onClick={() => onFormatChange({ bold: !fmt!.bold })}
        title="Bold"
      >
        <Bold className="w-3.5 h-3.5" />
      </Button>

      {/* Italic */}
      <Button
        variant={fmt?.italic ? "secondary" : "ghost"}
        size="icon" className="h-7 w-7"
        disabled={off}
        onClick={() => onFormatChange({ italic: !fmt!.italic })}
        title="Italic"
      >
        <Italic className="w-3.5 h-3.5" />
      </Button>

      {/* Underline */}
      <Button
        variant={fmt?.underline ? "secondary" : "ghost"}
        size="icon" className="h-7 w-7"
        disabled={off}
        onClick={() => onFormatChange({ underline: !fmt!.underline })}
        title="Underline"
      >
        <Underline className="w-3.5 h-3.5" />
      </Button>

      {/* Strikethrough */}
      <Button
        variant={fmt?.strikethrough ? "secondary" : "ghost"}
        size="icon" className="h-7 w-7"
        disabled={off}
        onClick={() => onFormatChange({ strikethrough: !fmt!.strikethrough })}
        title="Strikethrough"
      >
        <Strikethrough className="w-3.5 h-3.5" />
      </Button>

      {/* Highlight */}
      <label
        className={`relative h-7 w-7 flex items-center justify-center rounded cursor-pointer ${off ? "opacity-40 pointer-events-none" : fmt?.highlight ? "bg-accent" : "hover:bg-accent"}`}
        title="Highlight color"
      >
        <span className="flex flex-col items-center gap-[2px]">
          <Highlighter className="w-3.5 h-3.5" />
          <span className="w-4 h-[3px] rounded-sm" style={{ background: fmt?.highlight ?? "#fef08a" }} />
        </span>
        <input
          type="color"
          disabled={off}
          value={fmt?.highlight ?? "#fef08a"}
          onChange={(e) => onFormatChange({ highlight: e.target.value })}
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
        />
      </label>
      {!off && fmt?.highlight && (
        <button
          onClick={() => onFormatChange({ highlight: null })}
          className="h-7 w-4 flex items-center justify-center text-muted-foreground hover:text-foreground -ml-0.5"
          title="Remove highlight"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      )}

      {/* Text alignment — only for added text boxes */}
      {fmt?.isAddedWord && (
        <>
          <Sep />
          <Button
            variant={fmt.textAlign === "left" ? "secondary" : "ghost"}
            size="icon" className="h-7 w-7"
            onClick={() => onFormatChange({ textAlign: "left" })}
            title="Align left"
          >
            <AlignLeft className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant={fmt.textAlign === "center" ? "secondary" : "ghost"}
            size="icon" className="h-7 w-7"
            onClick={() => onFormatChange({ textAlign: "center" })}
            title="Align center"
          >
            <AlignCenter className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant={fmt.textAlign === "right" ? "secondary" : "ghost"}
            size="icon" className="h-7 w-7"
            onClick={() => onFormatChange({ textAlign: "right" })}
            title="Align right"
          >
            <AlignRight className="w-3.5 h-3.5" />
          </Button>
        </>
      )}

      {/* Color */}
      <label
        className={`relative h-7 w-7 flex items-center justify-center rounded hover:bg-accent cursor-pointer ${off ? "opacity-40 pointer-events-none" : ""}`}
        title="Text color"
      >
        <span className="flex flex-col items-center gap-[2px]">
          <span className="text-xs font-bold leading-none" style={{ color: fmt ? numToHex(fmt.color) : "#000" }}>A</span>
          <span className="w-4 h-[3px] rounded-sm" style={{ background: fmt ? numToHex(fmt.color) : "#000" }} />
        </span>
        <input
          type="color"
          disabled={off}
          value={fmt ? numToHex(fmt.color) : "#000000"}
          onChange={(e) => onFormatChange({ color: hexToNum(e.target.value) })}
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
        />
      </label>

      <Sep />

      {/* Zoom */}
      <Button
        variant="ghost" size="icon" className="h-7 w-7"
        disabled={zoom <= ZOOM_STEPS[0]}
        onClick={() => zoomIdx > 0 && onZoomChange(ZOOM_STEPS[zoomIdx - 1])}
        title="Zoom out (Ctrl+-)"
      >
        <ZoomOut className="w-3.5 h-3.5" />
      </Button>
      <button
        className="text-xs font-mono w-11 text-center tabular-nums hover:bg-accent rounded py-0.5"
        onClick={() => onZoomChange(1)}
        title="Reset zoom (Ctrl+0)"
      >
        {Math.round(zoom * 100)}%
      </button>
      <Button
        variant="ghost" size="icon" className="h-7 w-7"
        disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
        onClick={() => zoomIdx < ZOOM_STEPS.length - 1 && onZoomChange(ZOOM_STEPS[zoomIdx + 1])}
        title="Zoom in (Ctrl+=)"
      >
        <ZoomIn className="w-3.5 h-3.5" />
      </Button>

      {/* Hint text */}
      {!fmt && (
        <span className="ml-2 text-xs text-muted-foreground hidden sm:block">
          Click a word to select it and enable formatting controls
        </span>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Show / hide edit indicators */}
      <Button
        variant={showEditIndicators ? "secondary" : "ghost"}
        size="icon" className="h-7 w-7 shrink-0"
        onClick={onToggleEditIndicators}
        title={showEditIndicators ? "Hide edit indicators" : "Show edit indicators"}
      >
        {showEditIndicators ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
      </Button>

      {/* Bookmarks panel toggle */}
      <Button
        variant={bookmarksOpen ? "secondary" : "ghost"}
        size="icon" className="h-7 w-7 shrink-0"
        onClick={onBookmarksToggle}
        title="Bookmarks / Outline panel"
      >
        <BookOpen className="w-3.5 h-3.5" />
      </Button>

      {/* Layers panel toggle */}
      <Button
        variant={layersOpen ? "secondary" : "ghost"}
        size="icon" className="h-7 w-7 shrink-0"
        onClick={onLayersToggle}
        title="Layers panel"
      >
        <Layers className="w-3.5 h-3.5" />
      </Button>

      {/* History panel toggle */}
      <Button
        variant={historyOpen ? "secondary" : "ghost"}
        size="icon" className="h-7 w-7 shrink-0"
        onClick={onHistoryToggle}
        title="Edit history (Ctrl+Shift+H)"
      >
        <PanelRight className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
