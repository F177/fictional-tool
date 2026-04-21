"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  open   : boolean;
  onClose: () => void;
  /** dataUrl is a transparent PNG; aspectRatio = width/height */
  onPlace: (dataUrl: string, aspectRatio: number) => void;
}

const SIG_FONTS = [
  { label: "Cursive",      value: "cursive" },
  { label: "Brush Script", value: '"Brush Script MT", cursive' },
  { label: "Segoe Print",  value: '"Segoe Print", "Comic Sans MS", cursive' },
  { label: "Palatino",     value: '"Palatino Linotype", "Book Antiqua", cursive' },
];

export default function SignatureDialog({ open, onClose, onPlace }: Props) {
  const [tab,       setTab]       = useState<"draw" | "type">("draw");
  const [typeText,  setTypeText]  = useState("");
  const [typeFont,  setTypeFont]  = useState(SIG_FONTS[0].value);
  const [color,     setColor]     = useState("#000000");
  const [hasDrawing,setHasDrawing]= useState(false);

  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const isDrawing  = useRef(false);
  const lastPt     = useRef<{ x: number; y: number } | null>(null);

  // Clear canvas when dialog opens or tab switches
  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawing(false);
  }, [open, tab]);

  // ── Drawing handlers ──────────────────────────────────────────────────────

  const getPoint = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    const rect   = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width  / rect.width),
      y: (e.clientY - rect.top)  * (canvas.height / rect.height),
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    canvasRef.current!.setPointerCapture(e.pointerId);
    isDrawing.current = true;
    lastPt.current    = getPoint(e);
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.beginPath();
    ctx.moveTo(lastPt.current.x, lastPt.current.y);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDrawing.current) return;
    const pt  = getPoint(e);
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.strokeStyle = color;
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    lastPt.current = pt;
    setHasDrawing(true);
  };

  const onPointerUp = () => { isDrawing.current = false; lastPt.current = null; };

  const clearCanvas = () => {
    canvasRef.current!.getContext("2d")!.clearRect(0, 0, 480, 180);
    setHasDrawing(false);
  };

  // ── Build PNG ─────────────────────────────────────────────────────────────

  const buildDataUrl = (): { dataUrl: string; aspectRatio: number } | null => {
    if (tab === "draw") {
      const canvas = canvasRef.current!;
      const ctx    = canvas.getContext("2d")!;
      const { width, height } = canvas;
      const px   = ctx.getImageData(0, 0, width, height).data;
      let x0 = width, x1 = 0, y0 = height, y1 = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (px[(y * width + x) * 4 + 3] > 10) {
            x0 = Math.min(x0, x); x1 = Math.max(x1, x);
            y0 = Math.min(y0, y); y1 = Math.max(y1, y);
          }
        }
      }
      if (x0 > x1 || y0 > y1) return null;
      const pad = 12;
      const cx  = Math.max(0, x0 - pad), cy = Math.max(0, y0 - pad);
      const cw  = Math.min(width,  x1 + pad) - cx;
      const ch  = Math.min(height, y1 + pad) - cy;
      const out = document.createElement("canvas");
      out.width = cw; out.height = ch;
      out.getContext("2d")!.drawImage(canvas, cx, cy, cw, ch, 0, 0, cw, ch);
      return { dataUrl: out.toDataURL("image/png"), aspectRatio: cw / ch };
    } else {
      const text = typeText.trim();
      if (!text) return null;
      const size = 56;
      const tmp  = document.createElement("canvas");
      tmp.width  = 800; tmp.height = 120;
      const ctx  = tmp.getContext("2d")!;
      ctx.font   = `${size}px ${typeFont}`;
      const textW = ctx.measureText(text).width;
      const w = Math.ceil(textW) + 24, h = 100;
      const out  = document.createElement("canvas");
      out.width  = w; out.height = h;
      const oc   = out.getContext("2d")!;
      oc.font    = `${size}px ${typeFont}`;
      oc.fillStyle   = color;
      oc.textBaseline = "middle";
      oc.fillText(text, 12, h / 2);
      return { dataUrl: out.toDataURL("image/png"), aspectRatio: w / h };
    }
  };

  const handlePlace = () => {
    const result = buildDataUrl();
    if (!result) return;
    onPlace(result.dataUrl, result.aspectRatio);
    onClose();
  };

  const canPlace = (tab === "draw" && hasDrawing) || (tab === "type" && typeText.trim().length > 0);

  if (!open) return null;

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-background rounded-xl shadow-2xl border border-border/50 p-6 flex flex-col gap-4"
        style={{ width: 520, maxWidth: "95vw" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Add Signature</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs + color */}
        <div className="flex items-center border-b border-border/50">
          {(["draw", "type"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 text-sm capitalize border-b-2 -mb-px transition-colors ${
                tab === t
                  ? "border-violet-500 text-violet-600 font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2 pb-1">
            <span className="text-xs text-muted-foreground">Color</span>
            <label className="relative w-6 h-6 rounded cursor-pointer border border-border" title="Pen color"
              style={{ background: color }}>
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
            </label>
          </div>
        </div>

        {/* Draw tab */}
        {tab === "draw" && (
          <div className="flex flex-col gap-2">
            <canvas
              ref={canvasRef}
              width={480} height={180}
              className="w-full rounded-lg border border-border/50 touch-none"
              style={{ background: "white", cursor: "crosshair", display: "block" }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Draw your signature above</p>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearCanvas}>Clear</Button>
            </div>
          </div>
        )}

        {/* Type tab */}
        {tab === "type" && (
          <div className="flex flex-col gap-3">
            <div
              className="h-[90px] flex items-center border border-border/50 rounded-lg px-4 bg-white overflow-hidden"
              style={{ fontFamily: typeFont, fontSize: 44, color }}
            >
              <span style={{ whiteSpace: "nowrap" }}>{typeText || <span className="text-gray-300 text-2xl font-sans">Type your name…</span>}</span>
            </div>
            <div className="flex items-center gap-3">
              <input
                value={typeText}
                onChange={(e) => setTypeText(e.target.value)}
                placeholder="Your name"
                className="h-8 flex-1 rounded border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-violet-400"
                autoFocus
              />
              <select
                value={typeFont}
                onChange={(e) => setTypeFont(e.target.value)}
                className="h-8 rounded border border-input bg-background px-2 text-xs focus:outline-none"
              >
                {SIG_FONTS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            className="bg-violet-600 hover:bg-violet-700 text-white"
            disabled={!canPlace}
            onClick={handlePlace}
          >
            Place Signature
          </Button>
        </div>
      </div>
    </div>
  );
}
