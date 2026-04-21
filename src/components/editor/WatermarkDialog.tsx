"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface WatermarkConfig {
  text    : string;
  fontSize: number;
  opacity : number;
  color   : string;
  angle   : number;
  tile    : boolean;
}

interface Props {
  current: WatermarkConfig | null;
  onSave : (cfg: WatermarkConfig | null) => void;
  onClose: () => void;
}

const DEFAULTS: WatermarkConfig = {
  text: "CONFIDENTIAL", fontSize: 72, opacity: 0.25, color: "#808080", angle: 45, tile: false,
};

export default function WatermarkDialog({ current, onSave, onClose }: Props) {
  const [cfg, setCfg] = useState<WatermarkConfig>(current ?? DEFAULTS);

  const set = <K extends keyof WatermarkConfig>(k: K, v: WatermarkConfig[K]) =>
    setCfg(prev => ({ ...prev, [k]: v }));

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/40">
      <div className="bg-background border border-border rounded-xl shadow-2xl w-[380px] p-5 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Watermark</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Text */}
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Text</span>
          <input
            value={cfg.text}
            onChange={e => set("text", e.target.value)}
            className="h-8 rounded border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-violet-400"
            placeholder="e.g. CONFIDENTIAL"
          />
        </label>

        {/* Font size + angle */}
        <div className="flex gap-3">
          <label className="flex flex-col gap-1 flex-1">
            <span className="text-xs text-muted-foreground">Font size (pt)</span>
            <input
              type="number" min={8} max={200} step={4}
              value={cfg.fontSize}
              onChange={e => set("fontSize", Number(e.target.value))}
              className="h-8 rounded border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-violet-400"
            />
          </label>
          <label className="flex flex-col gap-1 flex-1">
            <span className="text-xs text-muted-foreground">Angle (°)</span>
            <input
              type="number" min={-180} max={180} step={5}
              value={cfg.angle}
              onChange={e => set("angle", Number(e.target.value))}
              className="h-8 rounded border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-violet-400"
            />
          </label>
        </div>

        {/* Opacity + color */}
        <div className="flex gap-3 items-end">
          <label className="flex flex-col gap-1 flex-1">
            <span className="text-xs text-muted-foreground">Opacity ({Math.round(cfg.opacity * 100)}%)</span>
            <input
              type="range" min={0.05} max={1} step={0.05}
              value={cfg.opacity}
              onChange={e => set("opacity", Number(e.target.value))}
              className="h-2 accent-violet-500"
            />
          </label>
          <label className="flex flex-col gap-1 items-center">
            <span className="text-xs text-muted-foreground">Color</span>
            <input
              type="color" value={cfg.color}
              onChange={e => set("color", e.target.value)}
              className="h-8 w-10 rounded border border-input cursor-pointer"
            />
          </label>
        </div>

        {/* Tile */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={cfg.tile} onChange={e => set("tile", e.target.checked)}
            className="accent-violet-500" />
          <span className="text-sm">Tile across page (repeat pattern)</span>
        </label>

        {/* Preview */}
        <div className="relative h-20 bg-white border border-border/40 rounded overflow-hidden flex items-center justify-center select-none">
          <span style={{
            fontSize   : Math.min(cfg.fontSize * 0.25, 28),
            color      : cfg.color,
            opacity    : cfg.opacity,
            transform  : `rotate(${-cfg.angle}deg)`,
            whiteSpace : "nowrap",
            fontWeight : "bold",
            userSelect : "none",
          }}>
            {cfg.text || "Watermark text"}
          </span>
        </div>

        {/* Buttons */}
        <div className="flex gap-2 justify-end">
          {current && (
            <Button variant="outline" size="sm" onClick={() => { onSave(null); onClose(); }}>
              Remove watermark
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
