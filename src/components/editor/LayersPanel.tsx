"use client";

import { useState } from "react";
import {
  ChevronRight, ChevronDown, Type, Image as ImageIcon,
  Pen, MessageSquare, Layers, Group as GroupIcon, FileText, X,
} from "lucide-react";
import type {
  CellRef, GroupDef, DrawnShape, StickyNote,
  AddedWordItem, AddedImageItem,
} from "@/lib/api";
import type { ApiPage, WordEdit } from "@/lib/api";

// ── helpers ───────────────────────────────────────────────────────────────────

function refKey(r: CellRef) {
  if (r.kind === "word")  return `w-${r.pageIdx}-${r.wordIdx}`;
  if (r.kind === "added") return `a-${r.pageIdx}-${r.id}`;
  return `i-${r.pageIdx}-${r.id}`;
}


function trunc(s: string, n = 22) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

// ── main component ────────────────────────────────────────────────────────────

interface Props {
  page        : ApiPage | null;
  pageIdx     : number;
  edits       : Record<number, WordEdit>;
  addedWords  : AddedWordItem[];
  addedImages : AddedImageItem[];
  drawings    : DrawnShape[];
  stickyNotes : StickyNote[];
  groups      : GroupDef[];
  selectedCells: CellRef[];
  onSelectRef : (ref: CellRef, add: boolean) => void;
  onSelectGroup: (groupId: string) => void;
  onClose     : () => void;
}

const GROUP_COLORS = [
  "#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
  "#ec4899", "#14b8a6", "#f97316",
];

export default function LayersPanel({
  page, pageIdx, edits, addedWords, addedImages, drawings, stickyNotes,
  groups, selectedCells, onSelectRef, onSelectGroup, onClose,
}: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (groupId: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
      return next;
    });
  };

  if (!page) return null;

  const selectedKeys = new Set(selectedCells.map(refKey));
  const isSel = (r: CellRef) => selectedKeys.has(refKey(r));

  // Groups with members on this page
  const pageGroups = groups.filter(g => g.members.some(m => m.pageIdx === pageIdx));
  const inGroupIds = new Set(
    pageGroups.flatMap(g => g.members.filter(m => m.pageIdx === pageIdx).map(refKey))
  );

  // Ungrouped items
  const ungroupedWords  = addedWords.filter(w => !inGroupIds.has(refKey({ kind: "added", pageIdx, id: w.id })));
  const ungroupedImages = addedImages.filter(i => !inGroupIds.has(refKey({ kind: "image", pageIdx, id: i.id })));

  const isEmpty = pageGroups.length === 0 && ungroupedWords.length === 0 &&
    ungroupedImages.length === 0 && drawings.length === 0 && stickyNotes.length === 0;

  return (
    <div className="w-[210px] shrink-0 border-l border-border/50 bg-[#1c1c1e] dark:bg-[#141416] flex flex-col overflow-hidden text-[#e0e0e0]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/8 shrink-0">
        <div className="flex items-center gap-2">
          <Layers className="w-3.5 h-3.5 text-violet-400" />
          <span className="text-xs font-bold text-white tracking-wide">LAYERS</span>
        </div>
        <button
          onClick={onClose}
          className="text-white/40 hover:text-white/80 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Layer list */}
      <div className="flex-1 overflow-y-auto py-1" style={{ colorScheme: "dark" }}>
        {isEmpty && (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
            <Layers className="w-9 h-9 mb-3 text-white/15" />
            <p className="text-[11px] text-white/40 leading-relaxed">
              Add text, images, or shapes.<br />Group elements to see them here.
            </p>
          </div>
        )}

        {/* ── Groups ── */}
        {pageGroups.map((group, gIdx) => {
          const color     = GROUP_COLORS[gIdx % GROUP_COLORS.length];
          const isCollapsed = collapsed.has(group.id);
          const members   = group.members.filter(m => m.pageIdx === pageIdx);
          const allSel    = members.length > 0 && members.every(isSel);

          return (
            <div key={group.id}>
              {/* Group header row */}
              <div
                onClick={() => onSelectGroup(group.id)}
                className={`
                  flex items-center gap-1.5 py-[5px] cursor-pointer select-none text-[11px] font-semibold transition-colors
                  ${allSel ? "bg-violet-700" : "hover:bg-white/7"}
                `}
                style={{ paddingLeft: 6, paddingRight: 8 }}
              >
                <button
                  className="p-0.5 shrink-0 text-white/50 hover:text-white"
                  onClick={(e) => { e.stopPropagation(); toggle(group.id); }}
                >
                  {isCollapsed
                    ? <ChevronRight className="w-3 h-3" />
                    : <ChevronDown className="w-3 h-3" />
                  }
                </button>
                <GroupIcon className="w-3.5 h-3.5 shrink-0" style={{ color }} />
                <span className="truncate flex-1 text-white">Group {gIdx + 1}</span>
                <span
                  className="text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0"
                  style={{ background: color + "33", color }}
                >
                  {members.length}
                </span>
              </div>

              {/* Members */}
              {!isCollapsed && (
                <div className="relative">
                  {/* Vertical group bracket */}
                  <div
                    style={{
                      position: "absolute", left: 18, top: 0, bottom: 0, width: 2,
                      background: color, borderRadius: 1, opacity: 0.45,
                    }}
                  />
                  {members.map((m) => {
                    let label = "Item";
                    let icon: React.ReactNode = <Type className="w-3 h-3" />;

                    if (m.kind === "word") {
                      const w = page.words[m.wordIdx];
                      label = w ? trunc(edits[m.wordIdx]?.text ?? w.text) : "Word";
                      icon  = <FileText className="w-3 h-3" />;
                    } else if (m.kind === "added") {
                      const item = addedWords.find(w => w.id === m.id);
                      label = item ? trunc(item.text || "Text Box") : "Text Box";
                      icon  = <Type className="w-3 h-3" />;
                    } else if (m.kind === "image") {
                      label = "Image";
                      icon  = <ImageIcon className="w-3 h-3" />;
                    }

                    const sel = isSel(m);
                    return (
                      <div
                        key={refKey(m)}
                        onClick={(e) => onSelectRef(m, e.shiftKey)}
                        className={`
                          flex items-center gap-2 py-[5px] cursor-pointer select-none text-[11px] transition-colors
                          ${sel ? "bg-violet-700 text-white" : "text-white/70 hover:bg-white/7 hover:text-white"}
                        `}
                        style={{ paddingLeft: 30, paddingRight: 8 }}
                      >
                        <span className="shrink-0 opacity-70">{icon}</span>
                        <span className="truncate flex-1">{label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* ── Divider if both groups and ungrouped exist ── */}
        {pageGroups.length > 0 && (ungroupedWords.length > 0 || ungroupedImages.length > 0 || drawings.length > 0 || stickyNotes.length > 0) && (
          <div className="flex items-center gap-2 px-3 py-1.5 mt-0.5">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-[9px] text-white/30 font-semibold tracking-widest uppercase">Ungrouped</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>
        )}

        {/* ── Ungrouped added words ── */}
        {ungroupedWords.map((item) => {
          const r: CellRef = { kind: "added", pageIdx, id: item.id };
          const sel = isSel(r);
          return (
            <div
              key={item.id}
              onClick={(e) => onSelectRef(r, e.shiftKey)}
              className={`
                flex items-center gap-2 py-[5px] cursor-pointer select-none text-[11px] transition-colors
                ${sel ? "bg-violet-700 text-white" : "text-white/70 hover:bg-white/7 hover:text-white"}
              `}
              style={{ paddingLeft: 10, paddingRight: 8 }}
            >
              <Type className="w-3 h-3 shrink-0 opacity-70" />
              <span className="truncate flex-1">{trunc(item.text || "Text Box")}</span>
            </div>
          );
        })}

        {/* ── Ungrouped images ── */}
        {ungroupedImages.map((img, i) => {
          const r: CellRef = { kind: "image", pageIdx, id: img.id };
          const sel = isSel(r);
          return (
            <div
              key={img.id}
              onClick={(e) => onSelectRef(r, e.shiftKey)}
              className={`
                flex items-center gap-2 py-[5px] cursor-pointer select-none text-[11px] transition-colors
                ${sel ? "bg-violet-700 text-white" : "text-white/70 hover:bg-white/7 hover:text-white"}
              `}
              style={{ paddingLeft: 10, paddingRight: 8 }}
            >
              <ImageIcon className="w-3 h-3 shrink-0 opacity-70" />
              <span className="truncate flex-1">Image {ungroupedImages.length > 1 ? i + 1 : ""}</span>
            </div>
          );
        })}

        {/* ── Drawn shapes (not groupable) ── */}
        {drawings.length > 0 && (
          <>
            {drawings.map((shape, i) => (
              <div
                key={shape.id}
                className="flex items-center gap-2 py-[5px] text-[11px] text-white/35 select-none"
                style={{ paddingLeft: 10, paddingRight: 8 }}
                title="Shapes cannot be grouped yet"
              >
                <Pen className="w-3 h-3 shrink-0" />
                <span className="truncate flex-1 capitalize">{shape.tool} {drawings.length > 1 ? i + 1 : ""}</span>
                <span className="text-[9px] bg-white/10 text-white/30 px-1 rounded shrink-0">shape</span>
              </div>
            ))}
          </>
        )}

        {/* ── Sticky notes (not groupable) ── */}
        {stickyNotes.map((note, i) => (
          <div
            key={note.id}
            className="flex items-center gap-2 py-[5px] text-[11px] text-white/35 select-none"
            style={{ paddingLeft: 10, paddingRight: 8 }}
            title="Notes cannot be grouped yet"
          >
            <MessageSquare className="w-3 h-3 shrink-0" />
            <span className="truncate flex-1">{trunc(note.text || `Note ${i + 1}`)}</span>
            <span className="text-[9px] bg-white/10 text-white/30 px-1 rounded shrink-0">note</span>
          </div>
        ))}
      </div>

      {/* Footer: summary */}
      <div className="border-t border-white/8 px-3 py-2 shrink-0 text-[10px] text-white/30 flex items-center gap-2">
        <span>{pageGroups.length} group{pageGroups.length !== 1 ? "s" : ""}</span>
        <span>·</span>
        <span>{ungroupedWords.length + ungroupedImages.length} ungrouped</span>
      </div>
    </div>
  );
}
