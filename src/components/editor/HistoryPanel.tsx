"use client";

import { useEffect, useRef, useState } from "react";
import {
  Type, Plus, Trash2, RotateCw, RotateCcw, Image as ImageIcon,
  Paintbrush, X, FileText,
} from "lucide-react";
import type { HistoryMeta, HistoryIconType } from "./EditorClient";

// ── Icon map ──────────────────────────────────────────────────────────────────

const ICON_MAP: Record<HistoryIconType, React.ComponentType<{ className?: string }>> = {
  text       : Type,
  addText    : Plus,
  deleteText : Trash2,
  rotate     : RotateCw,
  image      : ImageIcon,
  deleteImage: Trash2,
  deletePage : Trash2,
  restorePage: RotateCcw,
  format     : Paintbrush,
};

const ICON_COLOR: Record<HistoryIconType, string> = {
  text       : "text-blue-500",
  addText    : "text-green-500",
  deleteText : "text-red-500",
  rotate     : "text-orange-500",
  image      : "text-purple-500",
  deleteImage: "text-red-500",
  deletePage : "text-red-600",
  restorePage: "text-green-600",
  format     : "text-violet-500",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 5000)    return "just now";
  if (diff < 60000)   return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000)return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  meta        : HistoryMeta[];
  currentIndex: number;
  onJumpTo    : (i: number) => void;
  onDelete    : (i: number) => void;
  onClose     : () => void;
}

export default function HistoryPanel({ meta, currentIndex, onJumpTo, onDelete, onClose }: Props) {
  const listRef    = useRef<HTMLDivElement>(null);
  const [, setTick] = useState(0);

  // Re-render every 30s to keep relative times fresh
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  // Scroll current entry into view when panel opens or index changes
  useEffect(() => {
    const el = document.getElementById(`hist-entry-${currentIndex}`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [currentIndex]);

  return (
    <aside className="w-[260px] shrink-0 border-l border-border/50 bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <FileText className="w-3.5 h-3.5 text-muted-foreground" />
          History
          <span className="text-[10px] font-normal text-muted-foreground ml-1">({meta.length})</span>
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground rounded p-0.5 hover:bg-accent"
          title="Close history"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Legend */}
      <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-b border-border/30 shrink-0 leading-relaxed">
        Click to jump · <span className="text-red-400">×</span> to delete
      </div>

      {/* Entry list — oldest at top, newest at bottom */}
      <div ref={listRef} className="flex-1 overflow-y-auto py-1">
        {meta.map((entry, i) => (
          <HistoryEntry
            key={i}
            id={`hist-entry-${i}`}
            entry={entry}
            isCurrent={i === currentIndex}
            isFuture={i > currentIndex}
            isFirst={i === 0}
            onClick={() => onJumpTo(i)}
            onDelete={() => onDelete(i)}
          />
        ))}
      </div>
    </aside>
  );
}

// ── Individual entry ──────────────────────────────────────────────────────────

interface EntryProps {
  id      : string;
  entry   : HistoryMeta;
  isCurrent: boolean;
  isFuture : boolean;
  isFirst  : boolean;
  onClick  : () => void;
  onDelete : () => void;
}

function HistoryEntry({ id, entry, isCurrent, isFuture, isFirst, onClick, onDelete }: EntryProps) {
  const [hovered, setHovered] = useState(false);
  const Icon = ICON_MAP[entry.iconType];
  const iconColor = ICON_COLOR[entry.iconType];

  return (
    <div
      id={id}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`
        relative flex items-start gap-2 px-3 py-2 cursor-pointer select-none
        transition-colors group
        ${isCurrent
          ? "bg-violet-50 dark:bg-violet-950/40 border-l-2 border-violet-500"
          : isFuture
          ? "opacity-40 hover:opacity-60 hover:bg-accent/50"
          : "hover:bg-accent"}
      `}
    >
      {/* Timeline line */}
      {!isFirst && (
        <div className="absolute left-[22px] top-0 w-px h-2 bg-border/60 pointer-events-none" />
      )}

      {/* Icon badge */}
      <div className={`
        mt-0.5 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center
        ${isCurrent ? "bg-violet-100 dark:bg-violet-900/60" : "bg-muted"}
      `}>
        <Icon className={`w-2.5 h-2.5 ${isCurrent ? "text-violet-600" : iconColor}`} />
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className={`text-xs leading-snug truncate ${isCurrent ? "font-semibold text-violet-700 dark:text-violet-300" : "text-foreground"}`}>
          {entry.label}
        </p>
        <p className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
          {isFuture ? "redo →" : formatTime(entry.timestamp)}
        </p>
      </div>

      {/* Delete button — only if not the base "Document opened" entry */}
      {hovered && !isFirst && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="flex-shrink-0 mt-0.5 w-4 h-4 rounded flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
          title="Remove this entry from history"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      )}

      {/* Current indicator dot */}
      {isCurrent && (
        <div className="flex-shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full bg-violet-500" />
      )}
    </div>
  );
}
