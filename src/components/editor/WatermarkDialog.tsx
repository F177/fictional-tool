"use client";

import { useRef, useState } from "react";
import { X, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface WatermarkConfig {
  mode        : "text" | "image";
  text        : string;
  fontSize    : number;
  opacity     : number;
  color       : string;
  angle       : number;
  tile        : boolean;
  imageDataUrl?: string;
  imageScale? : number;   // 0.1–2, default 1
}

interface Props {
  current: WatermarkConfig | null;
  onSave : (cfg: WatermarkConfig | null) => void;
  onClose: () => void;
}

const DEFAULTS: WatermarkConfig = {
  mode: "text", text: "CONFIDENTIAL", fontSize: 72,
  opacity: 0.25, color: "#808080", angle: 45, tile: false, imageScale: 1,
};

export default function WatermarkDialog({ current, onSave, onClose }: Props) {
  const [cfg, setCfg] = useState<WatermarkConfig>({ ...DEFAULTS, ...current });
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof WatermarkConfig>(k: K, v: WatermarkConfig[K]) =>
    setCfg(prev => ({ ...prev, [k]: v }));

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => set("imageDataUrl", ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const previewFontSize = Math.min(cfg.fontSize * 0.25, 28);

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/40">
      <div className="bg-background border border-border rounded-xl shadow-2xl w-[400px] p-5 flex flex-col gap-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Watermark</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex border-b border-border/50">
          {(["text", "image"] as const).map(m => (
            <button
              key={m}
              onClick={() => set("mode", m)}
              className={`px-4 py-1.5 text-sm capitalize border-b-2 -mb-px transition-colors ${
                cfg.mode === m
                  ? "border-violet-500 text-violet-600 font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >{m}</button>
          ))}
        </div>

        {/* Text mode */}
        {cfg.mode === "text" && (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Text</span>
              <input
                value={cfg.text}
                onChange={e => set("text", e.target.value)}
                className="h-8 rounded border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-violet-400"
                placeholder="e.g. CONFIDENTIAL"
              />
            </label>

            <div className="flex gap-3">
              <label className="flex flex-col gap-1 flex-1">
                <span className="text-xs text-muted-foreground">Font size (pt)</span>
                <input type="number" min={8} max={300} step={4} value={cfg.fontSize}
                  onChange={e => set("fontSize", Number(e.target.value))}
                  className="h-8 rounded border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-violet-400" />
              </label>
              <label className="flex flex-col gap-1 items-center">
                <span className="text-xs text-muted-foreground">Color</span>
                <input type="color" value={cfg.color} onChange={e => set("color", e.target.value)}
                  className="h-8 w-10 rounded border border-input cursor-pointer" />
              </label>
            </div>
          </>
        )}

        {/* Image mode */}
        {cfg.mode === "image" && (
          <>
            <div className="flex flex-col gap-2">
              <span className="text-xs text-muted-foreground">Watermark image</span>
              {cfg.imageDataUrl ? (
                <div className="relative h-20 bg-muted/30 border border-border/40 rounded flex items-center justify-center overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={cfg.imageDataUrl} alt="watermark preview" className="max-h-full max-w-full object-contain" />
                  <button
                    onClick={() => set("imageDataUrl", undefined)}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-destructive flex items-center justify-center"
                  >
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="h-20 rounded border-2 border-dashed border-border/60 hover:border-violet-400 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Upload className="w-5 h-5" />
                  <span className="text-xs">Click to upload image</span>
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Scale ({Math.round((cfg.imageScale ?? 1) * 100)}%)</span>
              <input type="range" min={0.1} max={2} step={0.05} value={cfg.imageScale ?? 1}
                onChange={e => set("imageScale", Number(e.target.value))}
                className="h-2 accent-violet-500" />
            </label>
          </>
        )}

        {/* Shared: angle, opacity, tile */}
        <div className="flex gap-3">
          <label className="flex flex-col gap-1 flex-1">
            <span className="text-xs text-muted-foreground">Angle ({cfg.angle}°)</span>
            <input type="range" min={-180} max={180} step={5} value={cfg.angle}
              onChange={e => set("angle", Number(e.target.value))}
              className="h-2 accent-violet-500" />
          </label>
          <label className="flex flex-col gap-1 flex-1">
            <span className="text-xs text-muted-foreground">Opacity ({Math.round(cfg.opacity * 100)}%)</span>
            <input type="range" min={0.05} max={1} step={0.05} value={cfg.opacity}
              onChange={e => set("opacity", Number(e.target.value))}
              className="h-2 accent-violet-500" />
          </label>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={cfg.tile} onChange={e => set("tile", e.target.checked)}
            className="accent-violet-500" />
          <span className="text-sm">Tile across page (repeat pattern)</span>
        </label>

        {/* Preview */}
        <div className="relative h-20 bg-white dark:bg-zinc-900 border border-border/40 rounded overflow-hidden flex items-center justify-center select-none">
          {cfg.mode === "text" ? (
            <span style={{
              fontSize: previewFontSize, color: cfg.color, opacity: cfg.opacity,
              transform: `rotate(${-cfg.angle}deg)`, whiteSpace: "nowrap",
              fontWeight: "bold", userSelect: "none",
            }}>{cfg.text || "Watermark text"}</span>
          ) : cfg.imageDataUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={cfg.imageDataUrl} alt="preview"
              style={{
                maxHeight: "70%", maxWidth: "60%", objectFit: "contain",
                opacity: cfg.opacity, transform: `rotate(${-cfg.angle}deg)`,
              }} />
          ) : (
            <span className="text-xs text-muted-foreground">Upload an image to preview</span>
          )}
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
