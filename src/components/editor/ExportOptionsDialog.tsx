"use client";

import { useState } from "react";
import { X, Download, Lock, FileText, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ExportOptions {
  password    : string;
  title       : string;
  author      : string;
  subject     : string;
  keywords    : string;
  compress    : boolean;
  pageRange   : string;   // "" = all, "1-3,5" = specific pages (1-indexed)
}

interface Props {
  pageCount : number;
  onExport  : (opts: ExportOptions) => void;
  onClose   : () => void;
}

const EMPTY: ExportOptions = {
  password: "", title: "", author: "", subject: "", keywords: "", compress: true, pageRange: "",
};

export default function ExportOptionsDialog({ pageCount, onExport, onClose }: Props) {
  const [opts, setOpts] = useState<ExportOptions>(EMPTY);
  const [showPwd, setShowPwd] = useState(false);

  const set = <K extends keyof ExportOptions>(k: K, v: ExportOptions[K]) =>
    setOpts(prev => ({ ...prev, [k]: v }));

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/40">
      <div className="bg-background border border-border rounded-xl shadow-2xl w-[420px] p-5 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Export PDF</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Password */}
        <section className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Lock className="w-3.5 h-3.5" /> Password protection
          </div>
          <div className="relative">
            <input
              type={showPwd ? "text" : "password"}
              value={opts.password}
              onChange={e => set("password", e.target.value)}
              placeholder="Leave blank for no password"
              className="h-8 w-full rounded border border-input bg-background px-2 pr-16 text-sm focus:outline-none focus:ring-1 focus:ring-violet-400"
            />
            <button
              type="button"
              onClick={() => setShowPwd(p => !p)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
            >
              {showPwd ? "hide" : "show"}
            </button>
          </div>
        </section>

        {/* Metadata */}
        <section className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <FileText className="w-3.5 h-3.5" /> Document metadata
          </div>
          {(["title", "author", "subject", "keywords"] as const).map(field => (
            <label key={field} className="flex flex-col gap-0.5">
              <span className="text-[10px] text-muted-foreground capitalize">{field}</span>
              <input
                value={opts[field]}
                onChange={e => set(field, e.target.value)}
                className="h-7 rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-violet-400"
              />
            </label>
          ))}
        </section>

        {/* Page range */}
        <section className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Download className="w-3.5 h-3.5" /> Page range
          </div>
          <input
            value={opts.pageRange}
            onChange={e => set("pageRange", e.target.value)}
            placeholder={`All ${pageCount} pages — or e.g. 1-3, 5, 7-9`}
            className="h-8 rounded border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-violet-400"
          />
          <p className="text-[10px] text-muted-foreground">Use page numbers as shown (1-indexed). Ranges and comma-separated lists both work.</p>
        </section>

        {/* Compress */}
        <section>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={opts.compress} onChange={e => set("compress", e.target.checked)}
              className="accent-violet-500" />
            <div className="flex items-center gap-1.5 text-sm">
              <Minimize2 className="w-3.5 h-3.5 text-muted-foreground" />
              Compress output (deflate fonts & images)
            </div>
          </label>
        </section>

        {/* Buttons */}
        <div className="flex gap-2 justify-end pt-1">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white border-0"
            onClick={() => { onExport(opts); onClose(); }}>
            <Download className="w-3.5 h-3.5 mr-1" /> Download
          </Button>
        </div>
      </div>
    </div>
  );
}
