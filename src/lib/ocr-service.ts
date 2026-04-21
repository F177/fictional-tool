"use client";

import type { Worker } from "tesseract.js";

export interface OcrWord {
  text: string;
  // Normalized coords [0–1] relative to canvas CSS size — zoom-invariant
  normLeft: number;
  normTop: number;
  normRight: number;
  normBottom: number;
  confidence: number;
}

// Singleton worker — created once, reused for all pages
let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    const { createWorker } = await import("tesseract.js");
    const base = window.location.origin;
    workerPromise = (createWorker("eng", 1, {
      workerPath: `${base}/tesseract/worker.min.js`,
      corePath:   `${base}/tesseract/`,
      langPath:   `${base}/tesseract`,   // serves eng.traineddata.gz locally
      logger: () => {},
    }) as unknown as Promise<Worker>).catch((e) => {
      // Reset so next call retries
      workerPromise = null;
      throw e;
    });
  }
  return workerPromise;
}

// Cache keyed by pageIndex so we don't re-run on every zoom change
const cache = new Map<string, OcrWord[]>();

export async function recognizePage(
  canvas: HTMLCanvasElement,
  cacheKey: string
): Promise<OcrWord[]> {
  if (cache.has(cacheKey)) return cache.get(cacheKey)!;

  const worker = await getWorker();
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.width / dpr;
  const cssH = canvas.height / dpr;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (worker as any).recognize(canvas);

  // Parse TSV output — columns: level page_num block_num par_num line_num word_num left top width height conf text
  // Level 5 = word
  const tsv: string = result?.data?.tsv ?? "";
  const words: OcrWord[] = tsv
    .split("\n")
    .slice(1) // skip header
    .map((line) => line.split("\t"))
    .filter((cols) => cols[0] === "5" && +cols[10] > 30 && cols[11]?.trim().length > 0)
    .map((cols) => {
      const left   = +cols[6] / dpr;
      const top    = +cols[7] / dpr;
      const width  = +cols[8] / dpr;
      const height = +cols[9] / dpr;
      return {
        text:       cols[11].trim(),
        normLeft:   left / cssW,
        normTop:    top  / cssH,
        normRight:  (left + width)  / cssW,
        normBottom: (top  + height) / cssH,
        confidence: +cols[10],
      };
    });

  cache.set(cacheKey, words);
  return words;
}

export function clearOcrCache(key?: string) {
  key ? cache.delete(key) : cache.clear();
}

/**
 * Sample the background colour of a region on the PDF canvas.
 * Reads a thin strip ABOVE the bounding box (or below if at page top).
 * Returns a CSS rgb() string.
 */
export function sampleBackground(
  canvas: HTMLCanvasElement,
  normLeft: number,
  normTop: number,
  normRight: number,
  normBottom: number
): string {
  const ctx = canvas.getContext("2d");
  if (!ctx) return "rgb(255,255,255)";

  const bmpW = canvas.width;
  const bmpH = canvas.height;
  const dpr  = window.devicePixelRatio || 1;

  const x0 = Math.max(0, Math.floor(normLeft   * bmpW));
  const y0 = Math.max(0, Math.floor(normTop    * bmpH));
  const x1 = Math.min(bmpW, Math.ceil(normRight  * bmpW));
  const y1 = Math.min(bmpH, Math.ceil(normBottom * bmpH));
  const w  = Math.max(1, x1 - x0);

  // Try the strip just above the word first
  const stripPx = Math.max(1, Math.floor(5 * dpr));
  const aboveY  = Math.max(0, y0 - stripPx);
  const aboveH  = y0 - aboveY;

  let data: ImageData;
  if (aboveH > 0) {
    data = ctx.getImageData(x0, aboveY, w, aboveH);
  } else {
    // Fallback: strip just below
    const belowH = Math.min(stripPx, bmpH - y1);
    if (belowH <= 0) return "rgb(255,255,255)";
    data = ctx.getImageData(x0, y1, w, belowH);
  }

  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < data.data.length; i += 4) {
    r += data.data[i]; g += data.data[i + 1]; b += data.data[i + 2]; n++;
  }
  return n ? `rgb(${Math.round(r/n)},${Math.round(g/n)},${Math.round(b/n)})` : "rgb(255,255,255)";
}

/** Returns black or white text colour that contrasts with a CSS rgb() background */
export function contrastColor(bgCss: string): string {
  const m = bgCss.match(/rgb\((\d+),(\d+),(\d+)\)/);
  if (!m) return "#000000";
  const lum = (0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3]) / 255;
  return lum > 0.55 ? "#000000" : "#ffffff";
}
