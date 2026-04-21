"use client";

import { useState } from "react";
import { ExternalLink, FileText, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LinkAnnotation } from "@/lib/api";

interface Props {
  mode       : "create" | "edit";
  initial?   : LinkAnnotation;
  pageCount  : number;
  onConfirm  : (data: Omit<LinkAnnotation, "id">) => void;
  onDelete?  : () => void;
  onClose    : () => void;
}

type LinkType = "url" | "page";

export default function LinkDialog({ mode, initial, pageCount, onConfirm, onDelete, onClose }: Props) {
  const [linkType,     setLinkType]     = useState<LinkType>(initial?.pageTarget !== undefined ? "page" : "url");
  const [url,          setUrl]          = useState(initial?.url ?? "https://");
  const [pageNum,      setPageNum]      = useState((initial?.pageTarget ?? 0) + 1);
  const [borderStyle,  setBorderStyle]  = useState<LinkAnnotation["borderStyle"]>(initial?.borderStyle ?? "solid");
  const [borderColor,  setBorderColor]  = useState(initial?.borderColor ?? "#2563eb");

  const confirm = () => {
    const base = {
      x: initial?.x ?? 0,
      y: initial?.y ?? 0,
      w: initial?.w ?? 100,
      h: initial?.h ?? 20,
      borderStyle,
      borderColor,
    };
    if (linkType === "url") {
      const trimmed = url.trim();
      if (!trimmed || trimmed === "https://") return;
      onConfirm({ ...base, url: trimmed, pageTarget: undefined });
    } else {
      const target = Math.max(0, Math.min(pageCount - 1, pageNum - 1));
      onConfirm({ ...base, pageTarget: target, url: undefined });
    }
  };

  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#1c1c1e] border border-white/10 rounded-xl shadow-2xl w-[340px] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
          <span className="text-sm font-semibold text-white">
            {mode === "create" ? "Add Link" : "Edit Link"}
          </span>
          <button onClick={onClose} className="text-white/40 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4 flex flex-col gap-4">
          {/* Link type */}
          <div className="flex rounded-lg overflow-hidden border border-white/10">
            <button
              onClick={() => setLinkType("url")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${linkType === "url" ? "bg-blue-600 text-white" : "text-white/50 hover:text-white hover:bg-white/5"}`}
            >
              <ExternalLink className="w-3 h-3" />
              Web URL
            </button>
            <button
              onClick={() => setLinkType("page")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${linkType === "page" ? "bg-blue-600 text-white" : "text-white/50 hover:text-white hover:bg-white/5"}`}
            >
              <FileText className="w-3 h-3" />
              Page jump
            </button>
          </div>

          {/* Input */}
          {linkType === "url" ? (
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-white/40 font-medium uppercase tracking-wide">URL</label>
              <input
                autoFocus
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") confirm(); }}
                placeholder="https://example.com"
                className="bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-blue-500 transition-colors"
              />
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-white/40 font-medium uppercase tracking-wide">
                Page number (1–{pageCount})
              </label>
              <input
                autoFocus
                type="number"
                min={1}
                max={pageCount}
                value={pageNum}
                onChange={e => setPageNum(Number(e.target.value))}
                onKeyDown={e => { if (e.key === "Enter") confirm(); }}
                className="bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white outline-none focus:border-blue-500 transition-colors w-full"
              />
            </div>
          )}

          {/* Border style */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-white/40 font-medium uppercase tracking-wide">Border</label>
            <div className="flex items-center gap-2">
              <select
                value={borderStyle}
                onChange={e => setBorderStyle(e.target.value as LinkAnnotation["borderStyle"])}
                className="flex-1 bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-xs text-white outline-none focus:border-blue-500"
              >
                <option value="solid">Solid</option>
                <option value="dashed">Dashed</option>
                <option value="none">None (invisible)</option>
              </select>
              {borderStyle !== "none" && (
                <label className="relative cursor-pointer" title="Border color">
                  <span
                    className="block w-7 h-7 rounded border border-white/20"
                    style={{ background: borderColor }}
                  />
                  <input
                    type="color"
                    value={borderColor}
                    onChange={e => setBorderColor(e.target.value)}
                    className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                  />
                </label>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 pb-4 gap-2">
          {mode === "edit" && onDelete ? (
            <button
              onClick={() => { onDelete(); onClose(); }}
              className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              Delete
            </button>
          ) : <div />}
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} className="text-white/60 hover:text-white">
              Cancel
            </Button>
            <Button size="sm" onClick={confirm} className="bg-blue-600 hover:bg-blue-500 text-white border-0">
              {mode === "create" ? "Add Link" : "Save"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
