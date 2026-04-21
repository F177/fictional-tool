"use client";

import { useRef, useState } from "react";
import { BookOpen, ChevronRight, ChevronDown, Plus, X, ChevronUp, Pencil, MapPin, FileText } from "lucide-react";
import type { BookmarkEntry } from "@/lib/api";

interface Props {
  bookmarks         : BookmarkEntry[];
  currentOrigPageIdx: number;   // original page index of the current view (pageOrder[currentPage])
  pageCount         : number;
  onNavigate        : (bm: BookmarkEntry) => void;
  onAdd             : (title: string, pageIdx: number, level: number) => void;
  onStartPlace      : () => void;  // activate crosshair to drop an anchor on the page
  onRename          : (id: string, title: string) => void;
  onDelete          : (id: string) => void;
  onIndent          : (id: string, delta: 1 | -1) => void;
  onMoveUp          : (id: string) => void;
  onMoveDown        : (id: string) => void;
  onClose           : () => void;
  bookmarkPlaceMode : boolean;
}

const MAX_LEVEL = 3;

export default function BookmarksPanel({
  bookmarks, currentOrigPageIdx, pageCount,
  onNavigate, onAdd, onStartPlace, onRename, onDelete,
  onIndent, onMoveUp, onMoveDown, onClose, bookmarkPlaceMode,
}: Props) {
  const [collapsed, setCollapsed]   = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal,  setRenameVal]  = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  const toggle = (id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const startRename = (bm: BookmarkEntry) => {
    setRenamingId(bm.id);
    setRenameVal(bm.title);
    setTimeout(() => renameInputRef.current?.select(), 0);
  };

  const commitRename = () => {
    if (renamingId && renameVal.trim()) onRename(renamingId, renameVal.trim());
    setRenamingId(null);
  };

  // Collapse-aware visibility
  const parentCollapsed = (idx: number): boolean => {
    for (let j = idx - 1; j >= 0; j--) {
      if (bookmarks[j].level < bookmarks[idx].level) {
        return collapsed.has(bookmarks[j].id) || parentCollapsed(j);
      }
    }
    return false;
  };
  const visibleIds = new Set(
    bookmarks.filter((_, i) => !parentCollapsed(i)).map(b => b.id)
  );

  const hasChildren = (id: string) => {
    const idx = bookmarks.findIndex(b => b.id === id);
    return idx >= 0 && idx < bookmarks.length - 1 && bookmarks[idx + 1].level > bookmarks[idx].level;
  };

  return (
    <div className="w-[230px] shrink-0 border-l border-border/50 bg-[#1c1c1e] dark:bg-[#141416] flex flex-col overflow-hidden text-[#e0e0e0]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/8 shrink-0">
        <div className="flex items-center gap-2">
          <BookOpen className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-xs font-bold text-white tracking-wide">BOOKMARKS</span>
        </div>
        <button onClick={onClose} className="text-white/40 hover:text-white/80 transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-1" style={{ colorScheme: "dark" }}>
        {bookmarks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center gap-3">
            <BookOpen className="w-9 h-9 text-white/15" />
            <p className="text-[11px] text-white/40 leading-relaxed">
              No bookmarks yet.<br />
              <span className="text-white/25">Use the buttons below to add one.</span>
            </p>
          </div>
        )}

        {bookmarks.map((bm, idx) => {
          if (!visibleIds.has(bm.id)) return null;
          const isCollapsed = collapsed.has(bm.id);
          const hasCh  = hasChildren(bm.id);
          const isRenaming = renamingId === bm.id;
          // isActive: bookmark is on the page currently visible
          const isActive = bm.pageIdx === currentOrigPageIdx;
          const isPositioned = bm.y !== undefined;

          return (
            <div
              key={bm.id}
              className={`group flex items-center gap-0.5 py-[5px] pr-1 cursor-pointer select-none text-[11px] transition-colors ${
                isActive ? "bg-blue-700/40 text-white" : "text-white/70 hover:bg-white/7 hover:text-white"
              }`}
              style={{ paddingLeft: 6 + bm.level * 14 }}
              onClick={() => !isRenaming && onNavigate(bm)}
            >
              {/* Collapse toggle */}
              <button
                className="shrink-0 w-4 h-4 flex items-center justify-center text-white/30 hover:text-white"
                onClick={e => { e.stopPropagation(); if (hasCh) toggle(bm.id); }}
              >
                {hasCh
                  ? (isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)
                  : <span className="w-3 h-3 block" />}
              </button>

              {/* Anchor vs page icon */}
              <span className="shrink-0 opacity-60 mr-0.5">
                {isPositioned
                  ? <MapPin className="w-2.5 h-2.5 text-blue-400" />
                  : <FileText className="w-2.5 h-2.5 text-white/40" />}
              </span>

              {/* Title */}
              {isRenaming ? (
                <input
                  ref={renameInputRef}
                  value={renameVal}
                  autoFocus
                  onChange={e => setRenameVal(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={e => {
                    if (e.key === "Enter")  { e.preventDefault(); commitRename(); }
                    if (e.key === "Escape") setRenamingId(null);
                    e.stopPropagation();
                  }}
                  onClick={e => e.stopPropagation()}
                  className="flex-1 bg-white/10 text-white text-[11px] rounded px-1 outline-none border border-blue-400/60 min-w-0"
                />
              ) : (
                <span className="truncate flex-1 leading-none">{bm.title}</span>
              )}

              {/* Page badge */}
              <span className="text-[9px] text-white/25 shrink-0 ml-1 tabular-nums">
                p{bm.pageIdx + 1}{isPositioned ? "↓" : ""}
              </span>

              {/* Hover actions */}
              {!isRenaming && (
                <div className="hidden group-hover:flex items-center gap-0.5 shrink-0 ml-0.5">
                  <button title="Rename" onClick={e => { e.stopPropagation(); startRename(bm); }}
                    className="w-4 h-4 flex items-center justify-center text-white/40 hover:text-white rounded">
                    <Pencil className="w-2.5 h-2.5" />
                  </button>
                  <button title="Move up" onClick={e => { e.stopPropagation(); onMoveUp(bm.id); }}
                    disabled={idx === 0}
                    className="w-4 h-4 flex items-center justify-center text-white/40 hover:text-white rounded disabled:opacity-20">
                    <ChevronUp className="w-2.5 h-2.5" />
                  </button>
                  <button title="Outdent" onClick={e => { e.stopPropagation(); if (bm.level > 0) onIndent(bm.id, -1); }}
                    disabled={bm.level === 0}
                    className="w-4 h-4 flex items-center justify-center text-white/40 hover:text-white rounded disabled:opacity-20">
                    <ChevronRight className="w-2.5 h-2.5 rotate-180" />
                  </button>
                  <button title="Indent" onClick={e => { e.stopPropagation(); if (bm.level < MAX_LEVEL) onIndent(bm.id, 1); }}
                    disabled={bm.level >= MAX_LEVEL}
                    className="w-4 h-4 flex items-center justify-center text-white/40 hover:text-white rounded disabled:opacity-20">
                    <ChevronRight className="w-2.5 h-2.5" />
                  </button>
                  <button title="Delete" onClick={e => { e.stopPropagation(); onDelete(bm.id); }}
                    className="w-4 h-4 flex items-center justify-center text-red-400/60 hover:text-red-400 rounded">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="border-t border-white/8 px-3 py-2 shrink-0 flex flex-col gap-1.5">
        {/* Page bookmark */}
        <button
          onClick={() => onAdd(`Page ${currentOrigPageIdx + 1}`, currentOrigPageIdx, 0)}
          className="flex items-center gap-1.5 text-[11px] text-white/60 hover:text-white transition-colors py-0.5 rounded"
          title="Bookmark the entire current page"
        >
          <FileText className="w-3 h-3 shrink-0 text-white/40" />
          Bookmark current page
        </button>

        {/* Position anchor */}
        <button
          onClick={onStartPlace}
          className={`flex items-center gap-1.5 text-[11px] transition-colors py-0.5 rounded ${
            bookmarkPlaceMode
              ? "text-blue-400 font-semibold"
              : "text-white/60 hover:text-white"
          }`}
          title="Click a spot on the page to anchor a bookmark there"
        >
          <MapPin className={`w-3 h-3 shrink-0 ${bookmarkPlaceMode ? "text-blue-400" : "text-white/40"}`} />
          {bookmarkPlaceMode ? "Click on the page…" : "Place anchor on page"}
        </button>
      </div>
    </div>
  );
}
