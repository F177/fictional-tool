"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2, RotateCcw, GripVertical, Plus, Copy } from "lucide-react";
import { API_BASE, type ApiPage } from "@/lib/api";

interface Props {
  pages          : ApiPage[];
  pageOrder      : number[];
  currentPage    : number;
  rotations      : Record<number, number>;
  deletedPages   : number[];
  onPageClick    : (displayIdx: number) => void;
  onDeletePage   : (origIdx: number) => void;
  onRestorePage  : (origIdx: number) => void;
  onReorder      : (newOrder: number[]) => void;
  onAddBlankPage?  : (afterDisplayIdx: number) => void;
  onDuplicatePage? : (afterDisplayIdx: number) => void;
}

export default function PageThumbnailSidebar({
  pages, pageOrder, currentPage, rotations, deletedPages,
  onPageClick, onDeletePage, onRestorePage, onReorder, onAddBlankPage, onDuplicatePage,
}: Props) {
  const thumbRefs  = useRef<(HTMLDivElement | null)[]>([]);
  const deletedSet = new Set(deletedPages);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const dragSrc    = useRef<number | null>(null);   // display index being dragged

  useEffect(() => {
    thumbRefs.current[currentPage]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [currentPage]);

  const handleDragStart = (displayIdx: number) => {
    dragSrc.current = displayIdx;
  };

  const handleDragOver = (e: React.DragEvent, displayIdx: number) => {
    e.preventDefault();
    setDragOver(displayIdx);
  };

  const handleDrop = (displayIdx: number) => {
    const src = dragSrc.current;
    if (src === null || src === displayIdx) { setDragOver(null); return; }
    const next = [...pageOrder];
    const [moved] = next.splice(src, 1);
    next.splice(displayIdx, 0, moved);
    onReorder(next);
    setDragOver(null);
    dragSrc.current = null;
  };

  return (
    <div className="w-[128px] shrink-0 border-r border-border/50 bg-background overflow-y-auto flex flex-col gap-1 py-3 px-2">
      {pageOrder.map((origIdx, displayIdx) => {
        const page      = pages[origIdx];
        if (!page) return null;
        const rot       = rotations[origIdx] ?? 0;
        const isActive  = displayIdx === currentPage;
        const isDeleted = deletedSet.has(origIdx);
        const isSwapped = rot % 180 !== 0;

        const thumbW = 96;
        const aspect = page.height / page.width;
        const imgW   = thumbW;
        const imgH   = thumbW * aspect;
        const cW     = isSwapped ? imgH : imgW;
        const cH     = isSwapped ? imgW : imgH;

        return (
          <PageThumb
            key={origIdx}
            ref={(el) => { thumbRefs.current[displayIdx] = el; }}
            isActive={isActive}
            isDeleted={isDeleted}
            isDragOver={dragOver === displayIdx}
            pageNum={displayIdx + 1}
            onClick={() => !isDeleted && onPageClick(displayIdx)}
            onDelete={() => onDeletePage(origIdx)}
            onRestore={() => onRestorePage(origIdx)}
            onAddAfter={onAddBlankPage ? () => onAddBlankPage(displayIdx) : undefined}
            onDuplicate={onDuplicatePage ? () => onDuplicatePage(displayIdx) : undefined}
            draggable
            onDragStart={() => handleDragStart(displayIdx)}
            onDragOver={(e) => handleDragOver(e, displayIdx)}
            onDrop={() => handleDrop(displayIdx)}
            onDragEnd={() => { setDragOver(null); dragSrc.current = null; }}
          >
            <div
              className={`relative overflow-hidden rounded shadow-sm border transition-colors ${
                isDeleted
                  ? "border-red-300 dark:border-red-800 opacity-40"
                  : isActive ? "border-violet-400" : "border-border"
              }`}
              style={{ width: cW, height: cH, flexShrink: 0 }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${API_BASE}${page.image_url}`}
                alt={`Page ${displayIdx + 1}`}
                draggable={false}
                style={{
                  width          : imgW,
                  height         : imgH,
                  position       : "absolute",
                  left           : (cW - imgW) / 2,
                  top            : (cH - imgH) / 2,
                  transform      : rot ? `rotate(${rot}deg)` : undefined,
                  transformOrigin: "center center",
                  display        : "block",
                }}
              />
              {isDeleted && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[9px] font-semibold text-red-500 bg-white/80 px-1 rounded">DELETED</span>
                </div>
              )}
            </div>
          </PageThumb>
        );
      })}
    </div>
  );
}

// ── PageThumb ─────────────────────────────────────────────────────────────────

interface ThumbProps {
  isActive   : boolean;
  isDeleted  : boolean;
  isDragOver : boolean;
  pageNum    : number;
  children   : React.ReactNode;
  onClick    : () => void;
  onDelete   : () => void;
  onRestore  : () => void;
  onAddAfter?  : () => void;
  onDuplicate? : () => void;
  draggable    : boolean;
  onDragStart: () => void;
  onDragOver : (e: React.DragEvent) => void;
  onDrop     : () => void;
  onDragEnd  : () => void;
  ref        : (el: HTMLDivElement | null) => void;
}

function PageThumb({
  isActive, isDeleted, isDragOver, pageNum, children,
  onClick, onDelete, onRestore, onAddAfter, onDuplicate,
  draggable, onDragStart, onDragOver, onDrop, onDragEnd,
  ref,
}: ThumbProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      ref={ref}
      draggable={draggable}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`relative cursor-pointer rounded flex flex-col items-center gap-1 p-1 transition-colors ${
        isDragOver ? "bg-violet-100 dark:bg-violet-900/40 ring-2 ring-violet-400" :
        isActive && !isDeleted ? "bg-violet-100 dark:bg-violet-900/30" : "hover:bg-accent"
      }`}
    >
      {/* Drag grip */}
      {hovered && (
        <div className="absolute top-1 left-0.5 text-muted-foreground/40 cursor-grab">
          <GripVertical className="w-3 h-3" />
        </div>
      )}

      {children}

      <div className="flex items-center justify-between w-full px-0.5">
        <span className={`text-[10px] tabular-nums select-none ${isDeleted ? "text-red-400" : "text-muted-foreground"}`}>
          {pageNum}
        </span>
        {hovered && (
          isDeleted ? (
            <button
              onClick={e => { e.stopPropagation(); onRestore(); }}
              className="text-[10px] text-green-600 hover:text-green-700 flex items-center gap-0.5"
              title="Restore page"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          ) : (
            <div className="flex items-center gap-0.5">
              {onDuplicate && (
                <button
                  onClick={e => { e.stopPropagation(); onDuplicate(); }}
                  className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
                  title="Duplicate page"
                >
                  <Copy className="w-3 h-3" />
                </button>
              )}
              {onAddAfter && (
                <button
                  onClick={e => { e.stopPropagation(); onAddAfter(); }}
                  className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
                  title="Add blank page after"
                >
                  <Plus className="w-3 h-3" />
                </button>
              )}
              <button
                onClick={e => { e.stopPropagation(); onDelete(); }}
                className="text-[10px] text-destructive hover:text-red-600 flex items-center gap-0.5"
                title="Delete page"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          )
        )}
      </div>
    </div>
  );
}
