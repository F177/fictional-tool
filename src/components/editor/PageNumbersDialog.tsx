"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PageNumberConfig } from "@/lib/api";

const POSITIONS = [
  { value: "top-left",      label: "Top Left"      },
  { value: "top-center",    label: "Top Center"    },
  { value: "top-right",     label: "Top Right"     },
  { value: "bottom-left",   label: "Bottom Left"   },
  { value: "bottom-center", label: "Bottom Center" },
  { value: "bottom-right",  label: "Bottom Right"  },
] as const;

const FORMATS = [
  { value: "n",               label: "1, 2, 3 …"         },
  { value: "page-n",          label: "Page 1, Page 2 …"  },
  { value: "n-of-total",      label: "1 of 12, 2 of 12 …"},
  { value: "page-n-of-total", label: "Page 1 of 12 …"    },
] as const;

const DEFAULTS: PageNumberConfig = {
  position : "bottom-center",
  format   : "n",
  fontSize : 10,
  color    : "#000000",
  startFrom: 1,
  margin   : 18,
  skipFirst: false,
};

interface Props {
  current   : PageNumberConfig | null;
  totalPages: number;
  onSave    : (cfg: PageNumberConfig | null) => void;
  onClose   : () => void;
}

function buildText(cfg: PageNumberConfig, n: number, lastN: number): string {
  switch (cfg.format) {
    case "n":               return String(n);
    case "page-n":          return `Page ${n}`;
    case "n-of-total":      return `${n} of ${lastN}`;
    case "page-n-of-total": return `Page ${n} of ${lastN}`;
  }
}

export default function PageNumbersDialog({ current, totalPages, onSave, onClose }: Props) {
  const [cfg, setCfg] = useState<PageNumberConfig>({ ...DEFAULTS, ...current });
  const set = <K extends keyof PageNumberConfig>(k: K, v: PageNumberConfig[K]) =>
    setCfg(prev => ({ ...prev, [k]: v }));

  const numberedCount = totalPages - (cfg.skipFirst ? 1 : 0);
  const lastN = cfg.startFrom + Math.max(0, numberedCount - 1);
  const previewText = buildText(cfg, cfg.startFrom, lastN);

  const pos = cfg.position;
  const previewStyle: React.CSSProperties = {
    position  : "absolute",
    fontSize  : Math.min(cfg.fontSize * 1.4, 14),
    color     : cfg.color,
    fontFamily: "Arial, sans-serif",
    whiteSpace: "nowrap",
    ...(pos.startsWith("top")  ? { top: "16px" } : { bottom: "4px" }),
    ...(pos.endsWith("left")   ? { left: "8px" }
      : pos.endsWith("right")  ? { right: "8px" }
      : { left: "50%", transform: "translateX(-50%)" }),
  };

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/40">
      <div className="bg-background border border-border rounded-xl shadow-2xl w-[380px] p-5 flex flex-col gap-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Add Page Numbers</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Position grid */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground font-medium">Position</span>
          <div className="grid grid-cols-3 gap-1">
            {POSITIONS.map(p => (
              <button
                key={p.value}
                onClick={() => set("position", p.value)}
                className={`px-2 py-1.5 text-xs rounded border transition-colors ${
                  cfg.position === p.value
                    ? "border-violet-500 bg-violet-500/10 text-violet-600 font-medium"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Format */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground font-medium">Format</span>
          <div className="flex flex-col gap-1">
            {FORMATS.map(f => (
              <label key={f.value} className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="pn-fmt" value={f.value} checked={cfg.format === f.value}
                  onChange={() => set("format", f.value)} className="accent-violet-500" />
                <span className="text-sm">{f.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Font size + color */}
        <div className="flex gap-3">
          <label className="flex flex-col gap-1 flex-1">
            <span className="text-xs text-muted-foreground">Font size (pt)</span>
            <input type="number" min={6} max={72} step={1} value={cfg.fontSize}
              onChange={e => set("fontSize", Number(e.target.value))}
              className="h-8 rounded border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-violet-400" />
          </label>
          <label className="flex flex-col gap-1 items-center">
            <span className="text-xs text-muted-foreground">Color</span>
            <input type="color" value={cfg.color} onChange={e => set("color", e.target.value)}
              className="h-8 w-10 rounded border border-input cursor-pointer" />
          </label>
        </div>

        {/* Start from + margin */}
        <div className="flex gap-3">
          <label className="flex flex-col gap-1 flex-1">
            <span className="text-xs text-muted-foreground">Start from</span>
            <input type="number" min={0} step={1} value={cfg.startFrom}
              onChange={e => set("startFrom", Number(e.target.value))}
              className="h-8 rounded border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-violet-400" />
          </label>
          <label className="flex flex-col gap-1 flex-1">
            <span className="text-xs text-muted-foreground">Margin (pt)</span>
            <input type="number" min={4} max={72} step={2} value={cfg.margin}
              onChange={e => set("margin", Number(e.target.value))}
              className="h-8 rounded border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-violet-400" />
          </label>
        </div>

        {/* Skip first page */}
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={cfg.skipFirst} onChange={e => set("skipFirst", e.target.checked)}
            className="accent-violet-500" />
          <span className="text-sm">Skip first page (e.g. cover page)</span>
        </label>

        {/* Preview */}
        <div className="relative h-16 bg-white dark:bg-zinc-900 border border-border/40 rounded overflow-hidden">
          <span className="text-[10px] text-muted-foreground absolute top-1 left-2">Preview</span>
          <span style={previewStyle}>{previewText}</span>
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          {current && (
            <Button variant="outline" size="sm" onClick={() => { onSave(null); onClose(); }}>
              Remove
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white border-0"
            onClick={() => { onSave(cfg); onClose(); }}>
            Apply
          </Button>
        </div>
      </div>
    </div>
  );
}
