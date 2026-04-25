"use client";
import React, { useEffect, useRef } from "react";

export const RULER_SIZE = 18;

const BG    = "#252525";
const TICK  = "#555555";
const LABEL = "#888888";
const CURSOR_COLOR = "#a78bfa";

interface Props {
  orientation  : "h" | "v";
  totalPts     : number;   // page dimension in PDF points
  scale        : number;   // display px per PDF point
  cursorPt?    : number;   // cursor position in PDF points (undefined = hidden)
  onMouseDown? : (e: React.MouseEvent<HTMLDivElement>) => void;
}

export default function Ruler({ orientation, totalPts, scale, cursorPt, onMouseDown }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isH       = orientation === "h";
  const lengthPx  = totalPts * scale;
  const w         = isH ? lengthPx   : RULER_SIZE;
  const h         = isH ? RULER_SIZE : lengthPx;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width  = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);

    // Pick nicest major-tick interval so major ticks appear every ~60px
    const rawPts = 60 / scale;
    const steps  = [9, 18, 36, 54, 72, 108, 144, 216, 288, 432, 576];
    const major  = steps.find(s => s >= rawPts) ?? 576;
    const minor  = major / 3;

    ctx.lineWidth = 0.5;
    ctx.font      = `${Math.max(7, Math.floor(RULER_SIZE * 0.5))}px sans-serif`;
    ctx.textBaseline = "bottom";

    for (let pt = 0; pt <= totalPts + minor; pt += minor) {
      const px      = pt * scale;
      if (px > lengthPx + 1) break;
      const isMajor = (pt % major) < 0.01 || (pt % major) > major - 0.01;
      const tLen    = isMajor ? RULER_SIZE * 0.55 : RULER_SIZE * 0.28;

      ctx.strokeStyle = TICK;
      ctx.beginPath();
      if (isH) { ctx.moveTo(px, RULER_SIZE); ctx.lineTo(px, RULER_SIZE - tLen); }
      else      { ctx.moveTo(RULER_SIZE, px); ctx.lineTo(RULER_SIZE - tLen, px); }
      ctx.stroke();

      if (isMajor && px > 4) {
        ctx.save();
        ctx.fillStyle = LABEL;
        const label = String(Math.round(pt));
        if (isH) {
          ctx.textAlign = "left";
          ctx.fillText(label, px + 2, RULER_SIZE - 2);
        } else {
          ctx.translate(RULER_SIZE - 2, px);
          ctx.rotate(-Math.PI / 2);
          ctx.textAlign = "right";
          ctx.fillText(label, -2, 0);
        }
        ctx.restore();
      }
    }

    // Border line along the edge facing the page
    ctx.strokeStyle = "#444";
    ctx.lineWidth   = 1;
    ctx.beginPath();
    if (isH) { ctx.moveTo(0, RULER_SIZE - 0.5); ctx.lineTo(w, RULER_SIZE - 0.5); }
    else      { ctx.moveTo(RULER_SIZE - 0.5, 0); ctx.lineTo(RULER_SIZE - 0.5, h); }
    ctx.stroke();
  }, [isH, w, h, lengthPx, totalPts, scale]);

  const cursorPx = cursorPt !== undefined ? cursorPt * scale : undefined;

  return (
    <div
      style={{ position: "relative", flexShrink: 0, width: w, height: h, cursor: "crosshair" }}
      onMouseDown={onMouseDown}
    >
      <canvas ref={canvasRef} style={{ display: "block", pointerEvents: "none" }} />
      {cursorPx !== undefined && (
        <div
          style={{
            position     : "absolute",
            background   : CURSOR_COLOR,
            pointerEvents: "none",
            opacity      : 0.9,
            ...(isH
              ? { top: 0, bottom: 0, left: cursorPx - 0.5, width: 1 }
              : { left: 0, right: 0, top: cursorPx - 0.5, height: 1 }),
          }}
        />
      )}
    </div>
  );
}
