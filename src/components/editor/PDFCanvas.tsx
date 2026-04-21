"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useEditor } from "@/lib/editor-context";
import { nanoid } from "@/lib/nanoid";
import TextLayer from "./TextLayer";

interface PDFCanvasProps {
  pageIndex: number;
  pdfPage: unknown;
  scale: number;
  onSizeReported: (pageIndex: number, w: number, h: number) => void;
}

// Returns mouse/touch position relative to the canvas, accounting for CSS scaling
function getPos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const clientX = "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
  const clientY = "touches" in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

export default function PDFCanvas({ pageIndex, pdfPage, scale, onSizeReported }: PDFCanvasProps) {
  const editor = useEditor();

  // Three layered canvases: PDF | committed annotations | live drawing
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const annCanvasRef = useRef<HTMLCanvasElement>(null);
  const liveCanvasRef = useRef<HTMLCanvasElement>(null);

  // CSS display size (not bitmap size)
  const [cssSize, setCssSize] = useState({ w: 0, h: 0 });

  // ─── Render PDF page ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!pdfPage || !pdfCanvasRef.current) return;

    type PdfJsPage = {
      getViewport: (opts: { scale: number }) => {
        width: number;
        height: number;
        transform: number[];
      };
      render: (opts: unknown) => { promise: Promise<void>; cancel: () => void };
    };

    const page = pdfPage as PdfJsPage;
    const dpr = window.devicePixelRatio || 1;
    const viewport = page.getViewport({ scale });

    // CSS display size
    const cssW = Math.floor(viewport.width);
    const cssH = Math.floor(viewport.height);

    // Bitmap size = CSS × DPR for crisp rendering
    const bitmapW = Math.floor(cssW * dpr);
    const bitmapH = Math.floor(cssH * dpr);

    const canvas = pdfCanvasRef.current;
    canvas.width = bitmapW;
    canvas.height = bitmapH;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;

    // Sync the other two canvases
    for (const ref of [annCanvasRef, liveCanvasRef]) {
      if (!ref.current) continue;
      ref.current.width = bitmapW;
      ref.current.height = bitmapH;
      ref.current.style.width = `${cssW}px`;
      ref.current.style.height = `${cssH}px`;
    }

    setCssSize({ w: cssW, h: cssH });
    onSizeReported(pageIndex, cssW, cssH);

    // willReadFrequently enables fast getImageData for background sampling
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    // Scale context for DPR so pdfjs viewport coordinates work correctly
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const task = page.render({ canvasContext: ctx, viewport });
    task.promise.catch(() => {}); // swallow AbortException on cleanup

    return () => {
      task.cancel();
    };
  }, [pdfPage, scale, pageIndex, onSizeReported]);

  // ─── Redraw committed annotations ────────────────────────────────────────
  const redrawAnnotations = useCallback(() => {
    const canvas = annCanvasRef.current;
    if (!canvas || canvas.width === 0) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const anns = editor.annotations.filter((a) => a.pageIndex === pageIndex);
    for (const ann of anns) {
      const isSelected = ann.id === editor.selectedAnnotationId;
      ctx.save();
      // All annotation coordinates are in CSS pixels → scale up to bitmap pixels
      ctx.scale(dpr, dpr);

      switch (ann.type) {
        case "text-edit":
          // Rendered as DOM divs in TextLayer, not on canvas
          break;
        case "text": {
          ctx.font = `${ann.fontSize ?? 16}px ${ann.fontFamily ?? "sans-serif"}`;
          ctx.fillStyle = ann.color ?? "#1a1a2e";
          ctx.globalAlpha = ann.opacity ?? 1;
          ctx.fillText(ann.text ?? "", ann.x, ann.y);
          if (isSelected) {
            const m = ctx.measureText(ann.text ?? "");
            ctx.strokeStyle = "#7c3aed";
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 2]);
            ctx.strokeRect(ann.x - 2, ann.y - (ann.fontSize ?? 16) - 2, m.width + 4, (ann.fontSize ?? 16) + 6);
          }
          break;
        }
        case "highlight": {
          ctx.fillStyle = ann.color ?? "#facc15";
          ctx.globalAlpha = 0.4;
          ctx.fillRect(ann.x, ann.y, ann.width ?? 80, ann.height ?? 20);
          break;
        }
        case "rectangle": {
          ctx.strokeStyle = ann.color ?? "#1a1a2e";
          ctx.lineWidth = ann.strokeWidth ?? 2;
          ctx.globalAlpha = ann.opacity ?? 1;
          ctx.strokeRect(ann.x, ann.y, ann.width ?? 80, ann.height ?? 40);
          if (isSelected) {
            ctx.strokeStyle = "#7c3aed";
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 2]);
            ctx.strokeRect(ann.x - 3, ann.y - 3, (ann.width ?? 80) + 6, (ann.height ?? 40) + 6);
          }
          break;
        }
        case "ellipse": {
          ctx.strokeStyle = ann.color ?? "#1a1a2e";
          ctx.lineWidth = ann.strokeWidth ?? 2;
          ctx.globalAlpha = ann.opacity ?? 1;
          ctx.beginPath();
          ctx.ellipse(
            ann.x + (ann.width ?? 80) / 2,
            ann.y + (ann.height ?? 40) / 2,
            (ann.width ?? 80) / 2,
            (ann.height ?? 40) / 2,
            0, 0, Math.PI * 2
          );
          ctx.stroke();
          break;
        }
        case "erase": {
          ctx.fillStyle = "#ffffff";
          ctx.globalAlpha = 1;
          ctx.fillRect(ann.x, ann.y, ann.width ?? 30, ann.height ?? 30);
          break;
        }
        case "draw":
        case "signature": {
          if (!ann.points || ann.points.length < 2) break;
          ctx.strokeStyle = ann.color ?? "#1a1a2e";
          ctx.lineWidth = ann.strokeWidth ?? 2;
          ctx.globalAlpha = ann.opacity ?? 1;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.beginPath();
          ctx.moveTo(ann.points[0].x, ann.points[0].y);
          for (let i = 1; i < ann.points.length; i++) {
            ctx.lineTo(ann.points[i].x, ann.points[i].y);
          }
          ctx.stroke();
          break;
        }
      }
      ctx.restore();
    }
  }, [editor.annotations, editor.selectedAnnotationId, pageIndex]);

  useEffect(() => {
    redrawAnnotations();
  }, [redrawAnnotations]);

  // ─── Interaction (draw into live canvas, commit on pointerup) ─────────────
  const drawing = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });
  const livePoints = useRef<{ x: number; y: number }[]>([]);
  const textInputRef = useRef<HTMLInputElement | null>(null);

  const clearLive = useCallback(() => {
    const c = liveCanvasRef.current;
    if (c) c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
  }, []);

  const drawLiveStroke = useCallback(
    (points: { x: number; y: number }[]) => {
      const canvas = liveCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d")!;
      const dpr = window.devicePixelRatio || 1;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (points.length < 1) return;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.strokeStyle = editor.activeColor;
      ctx.lineWidth = editor.strokeWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.globalAlpha = editor.activeTool === "signature" ? 1 : 0.9;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
      ctx.stroke();
      ctx.restore();
    },
    [editor.activeColor, editor.strokeWidth, editor.activeTool]
  );

  const drawLiveRect = useCallback(
    (start: { x: number; y: number }, end: { x: number; y: number }, isHighlight: boolean) => {
      const canvas = liveCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d")!;
      const dpr = window.devicePixelRatio || 1;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const x = Math.min(start.x, end.x);
      const y = Math.min(start.y, end.y);
      const w = Math.abs(end.x - start.x);
      const h = Math.abs(end.y - start.y);

      ctx.save();
      ctx.scale(dpr, dpr);
      if (isHighlight) {
        ctx.fillStyle = editor.activeHighlightColor;
        ctx.globalAlpha = 0.4;
        ctx.fillRect(x, y, w, h);
      } else {
        ctx.strokeStyle = editor.activeColor;
        ctx.lineWidth = editor.strokeWidth;
        ctx.strokeRect(x, y, w, h);
      }
      ctx.restore();
    },
    [editor.activeColor, editor.activeHighlightColor, editor.strokeWidth]
  );

  const drawLiveEllipse = useCallback(
    (start: { x: number; y: number }, end: { x: number; y: number }) => {
      const canvas = liveCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d")!;
      const dpr = window.devicePixelRatio || 1;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const x = Math.min(start.x, end.x);
      const y = Math.min(start.y, end.y);
      const w = Math.abs(end.x - start.x);
      const h = Math.abs(end.y - start.y);

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.strokeStyle = editor.activeColor;
      ctx.lineWidth = editor.strokeWidth;
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    },
    [editor.activeColor, editor.strokeWidth]
  );

  const showTextInput = useCallback(
    (x: number, y: number) => {
      if (textInputRef.current) textInputRef.current.remove();
      const canvas = liveCanvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / (window.devicePixelRatio || 1) / rect.width;
      const scaleY = canvas.height / (window.devicePixelRatio || 1) / rect.height;
      const screenX = rect.left + x / scaleX;
      const screenY = rect.top + y / scaleY;

      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = "Type here…";
      input.style.cssText = `
        position: fixed;
        left: ${screenX}px;
        top: ${screenY - editor.fontSize - 4}px;
        font-size: ${editor.fontSize}px;
        font-family: sans-serif;
        border: 1.5px dashed #7c3aed;
        outline: none;
        background: transparent;
        color: ${editor.activeColor};
        min-width: 80px;
        padding: 2px 4px;
        z-index: 1000;
      `;
      document.body.appendChild(input);
      textInputRef.current = input;
      input.focus();

      const commit = () => {
        if (input.value.trim()) {
          editor.addAnnotation({
            id: nanoid(),
            pageIndex,
            type: "text",
            x,
            y,
            text: input.value,
            color: editor.activeColor,
            fontSize: editor.fontSize,
            fontFamily: "sans-serif",
            opacity: 1,
          });
        }
        input.remove();
        textInputRef.current = null;
      };
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") { input.remove(); textInputRef.current = null; }
      });
      input.addEventListener("blur", commit);
    },
    [editor, pageIndex]
  );

  const handlePointerDown = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      if (!liveCanvasRef.current) return;
      const pos = getPos(e, liveCanvasRef.current);
      drawing.current = true;
      startPos.current = pos;
      livePoints.current = [pos];

      const { activeTool } = editor;

      if (activeTool === "text") {
        drawing.current = false;
        showTextInput(pos.x, pos.y);
        return;
      }

      if (activeTool === "select") {
        const annCanvas = annCanvasRef.current;
        if (!annCanvas) return;
        const dpr = window.devicePixelRatio || 1;
        const hit = [...editor.annotations].reverse().find((a) => {
          if (a.pageIndex !== pageIndex) return false;
          if (a.type === "text") {
            const ctx = annCanvas.getContext("2d")!;
            ctx.font = `${a.fontSize ?? 16}px sans-serif`;
            const w = ctx.measureText(a.text ?? "").width;
            return pos.x >= a.x && pos.x <= a.x + w && pos.y >= a.y - (a.fontSize ?? 16) && pos.y <= a.y;
          }
          return pos.x >= a.x && pos.x <= a.x + (a.width ?? 1) && pos.y >= a.y && pos.y <= a.y + (a.height ?? 1);
        });
        editor.setSelectedAnnotationId(hit?.id ?? null);
        drawing.current = false;
        return;
      }
    },
    [editor, pageIndex, showTextInput]
  );

  const handlePointerMove = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!drawing.current || !liveCanvasRef.current) return;
      e.preventDefault();
      const pos = getPos(e, liveCanvasRef.current);
      const { activeTool } = editor;

      if (activeTool === "draw" || activeTool === "signature") {
        livePoints.current.push(pos);
        drawLiveStroke(livePoints.current);
      } else if (activeTool === "erase") {
        livePoints.current.push(pos);
        // Draw erase preview
        const canvas = liveCanvasRef.current;
        const ctx = canvas.getContext("2d")!;
        const dpr = window.devicePixelRatio || 1;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.strokeStyle = "#7c3aed";
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.strokeRect(pos.x - 15, pos.y - 15, 30, 30);
        ctx.restore();
      } else if (activeTool === "rectangle") {
        drawLiveRect(startPos.current, pos, false);
      } else if (activeTool === "ellipse") {
        drawLiveEllipse(startPos.current, pos);
      } else if (activeTool === "highlight") {
        drawLiveRect(startPos.current, pos, true);
      }
    },
    [editor, drawLiveStroke, drawLiveRect, drawLiveEllipse]
  );

  const handlePointerUp = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!drawing.current) return;
      drawing.current = false;
      clearLive();

      if (!liveCanvasRef.current) return;
      const pos = getPos(e, liveCanvasRef.current);
      const { activeTool, activeColor, activeHighlightColor, strokeWidth } = editor;
      const points = livePoints.current;

      if (activeTool === "draw" || activeTool === "signature") {
        if (points.length >= 2) {
          editor.addAnnotation({
            id: nanoid(),
            pageIndex,
            type: activeTool,
            x: points[0].x,
            y: points[0].y,
            color: activeColor,
            strokeWidth,
            opacity: 1,
            points,
          });
        }
      } else if (activeTool === "erase") {
        for (const p of points) {
          editor.addAnnotation({
            id: nanoid(),
            pageIndex,
            type: "erase",
            x: p.x - 15,
            y: p.y - 15,
            width: 30,
            height: 30,
          });
        }
      } else if (activeTool === "rectangle") {
        const dx = pos.x - startPos.current.x;
        const dy = pos.y - startPos.current.y;
        if (Math.abs(dx) > 3 && Math.abs(dy) > 3) {
          editor.addAnnotation({
            id: nanoid(),
            pageIndex,
            type: "rectangle",
            x: Math.min(startPos.current.x, pos.x),
            y: Math.min(startPos.current.y, pos.y),
            width: Math.abs(dx),
            height: Math.abs(dy),
            color: activeColor,
            strokeWidth,
            opacity: 1,
          });
        }
      } else if (activeTool === "ellipse") {
        const dx = pos.x - startPos.current.x;
        const dy = pos.y - startPos.current.y;
        if (Math.abs(dx) > 3 && Math.abs(dy) > 3) {
          editor.addAnnotation({
            id: nanoid(),
            pageIndex,
            type: "ellipse",
            x: Math.min(startPos.current.x, pos.x),
            y: Math.min(startPos.current.y, pos.y),
            width: Math.abs(dx),
            height: Math.abs(dy),
            color: activeColor,
            strokeWidth,
            opacity: 1,
          });
        }
      } else if (activeTool === "highlight") {
        const dx = pos.x - startPos.current.x;
        const dy = pos.y - startPos.current.y;
        if (Math.abs(dx) > 3 && Math.abs(dy) > 3) {
          editor.addAnnotation({
            id: nanoid(),
            pageIndex,
            type: "highlight",
            x: Math.min(startPos.current.x, pos.x),
            y: Math.min(startPos.current.y, pos.y),
            width: Math.abs(dx),
            height: Math.abs(dy),
            color: activeHighlightColor,
            opacity: 0.4,
          });
        }
      }

      livePoints.current = [];
    },
    [editor, pageIndex, clearLive]
  );

  const cursor = (() => {
    switch (editor.activeTool) {
      case "text": return "text";
      case "draw":
      case "signature":
      case "rectangle":
      case "ellipse":
      case "highlight": return "crosshair";
      case "erase": return "cell";
      default: return "default";
    }
  })();

  return (
    <div className="relative shadow-xl" style={{ width: cssSize.w, height: cssSize.h }}>
      <canvas ref={pdfCanvasRef} className="absolute top-0 left-0 block" />
      <canvas ref={annCanvasRef} className="absolute top-0 left-0 block pointer-events-none" />
      {/* Live canvas — pointer-events-none when edittext is active so text layer gets clicks */}
      <canvas
        ref={liveCanvasRef}
        className="absolute top-0 left-0 block"
        style={{
          cursor: editor.activeTool === "edittext" ? "text" : cursor,
          touchAction: "none",
          userSelect: "none",
          pointerEvents: editor.activeTool === "edittext" ? "none" : "auto",
        }}
        onMouseDown={handlePointerDown}
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onMouseLeave={() => { if (drawing.current) { drawing.current = false; clearLive(); livePoints.current = []; } }}
        onTouchStart={handlePointerDown}
        onTouchMove={handlePointerMove}
        onTouchEnd={handlePointerUp}
      />
      {/* Text edit overlay — OCR-powered, on top of everything */}
      <TextLayer
        pdfCanvasRef={pdfCanvasRef}
        pageIndex={pageIndex}
        cssWidth={cssSize.w}
        cssHeight={cssSize.h}
      />
    </div>
  );
}
