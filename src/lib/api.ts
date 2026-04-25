"use client";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ApiWord {
  text: string;
  /** [x0, y0, x1, y1] in PDF points, top-left origin, y increases downward */
  box: [number, number, number, number];
  font_size: number;
  font_family: string;
  bold: boolean;
  italic: boolean;
  /** sRGB packed as 0xRRGGBB. 0 = black. */
  color?: number;
  confidence: number;
  source: "text" | "ocr";
  /** Baseline y in PDF points (top-left origin). Exact for text PDFs, ≈y1 for OCR. */
  baseline_y?: number;
}

export interface ApiPage {
  page_num : number;
  width    : number;
  height   : number;
  image_url: string;
  words    : ApiWord[];
  fields?  : FormField[];
}

// ── Drawing ───────────────────────────────────────────────────────────────────

export type DrawTool = "pen" | "rect" | "circle" | "arrow" | "line" | "triangle" | "star" | "diamond";

export interface DrawnShape {
  id       : string;
  tool     : DrawTool;
  points?  : Array<[number, number]>;  // pen: PDF-point coords
  x?       : number; y?: number; w?: number; h?: number;  // rect/circle bbox
  x1?      : number; y1?: number; x2?: number; y2?: number;  // arrow
  color    : string;   // CSS hex
  lineWidth: number;   // PDF points
  fill?    : string | null;
  opacity  : number;
}

// ── Sticky notes ──────────────────────────────────────────────────────────────

export interface StickyNote {
  id   : string;
  x    : number;  // PDF points
  y    : number;
  text : string;
  color: string;
}

// ── Form fields ───────────────────────────────────────────────────────────────

export interface FormField {
  id      : string;
  name    : string;
  type    : "text" | "checkbox" | "radio" | "dropdown" | "multiline";
  box     : [number, number, number, number];  // PDF points
  options?: string[];
  value?  : string;
}

export interface UploadResponse {
  file_hash: string;
  status: "done" | "queued";
  job_id: string | null;
  pages?: ApiPage[];
}

/** Per-word formatting + text override stored client-side. */
export interface WordEdit {
  text          : string;
  color?        : number;
  fontFamily?   : string;
  fontSize?     : number;
  bold?         : boolean;
  italic?       : boolean;
  underline?    : boolean;
  strikethrough?: boolean;
  highlight?    : string | null;
  opacity?      : number;    // 0–1, default 1
  dx?           : number;
  dy?           : number;
  deleted?      : boolean;
  redacted?     : boolean;   // true = permanent black-box redaction
}

/** A brand-new text box placed by the user (not from the original PDF). */
export interface AddedWordItem {
  id            : string;
  x             : number;   // left edge in PDF points
  y             : number;   // baseline in PDF points
  text          : string;
  fontSize      : number;
  fontFamily    : string;
  bold          : boolean;
  italic        : boolean;
  underline?    : boolean;
  strikethrough?: boolean;
  textAlign?    : "left" | "center" | "right";
  color         : number;   // sRGB 0xRRGGBB
  dx?           : number;
  dy?           : number;
  rotation?     : number;  // degrees, 0 = upright
  lineHeight?   : number;  // CSS line-height multiplier, default 1.3
  listType?     : "none" | "bullet" | "numbered";
  opacity?      : number;  // 0–1, default 1
  w?            : number;  // fixed width in PDF points (overrides auto-size)
  h?            : number;  // fixed height in PDF points
}

/** Patch applied by the toolbar — superset of WordEdit fields + added-word-only fields. */
export type FormatPatch = {
  color?        : number;
  fontFamily?   : string;
  fontSize?     : number;
  bold?         : boolean;
  italic?       : boolean;
  underline?    : boolean;
  strikethrough?: boolean;
  highlight?    : string | null;
  textAlign?    : "left" | "center" | "right";
  rotation?     : number;
  lineHeight?   : number;
  listType?     : "none" | "bullet" | "numbered";
  opacity?      : number;
};

/** A placed image or signature on a page. */
export interface AddedImageItem {
  id      : string;
  x       : number;   // PDF points, top-left
  y       : number;   // PDF points, top-left
  width   : number;   // PDF points
  height  : number;   // PDF points
  dataUrl : string;   // data:image/png;base64,...
  dx?     : number;
  dy?     : number;
}

/** Discriminated union identifying a selected element. */
export type CellRef =
  | { kind: "word";  pageIdx: number; wordIdx: number }
  | { kind: "added"; pageIdx: number; id: string }
  | { kind: "image"; pageIdx: number; id: string };

/** A named group of elements that move and select as one unit. */
export interface GroupDef {
  id     : string;
  members: CellRef[];
}

/** A free-form redaction zone (fills any arbitrary area with black). */
export interface RedactionZone {
  id: string;
  x : number;  // PDF points from left
  y : number;  // PDF points from top
  w : number;
  h : number;
}

/** Per-page crop box — clips the visible area of the page. */
export interface CropBox {
  x: number;  // PDF points from left
  y: number;  // PDF points from top
  w: number;
  h: number;
}

/** Configuration for automatic page-number overlays. */
export interface PageNumberConfig {
  position : "top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right";
  format   : "n" | "page-n" | "n-of-total" | "page-n-of-total";
  fontSize : number;   // pt
  color    : string;   // CSS hex
  startFrom: number;
  margin   : number;   // PDF points from edge
  skipFirst: boolean;
}

/** A clickable link region placed on a page. */
export interface LinkAnnotation {
  id          : string;
  x           : number;  // PDF points, top-left
  y           : number;  // PDF points, top-left
  w           : number;  // PDF points
  h           : number;  // PDF points
  url?        : string;  // external URL
  pageTarget? : number;  // 0-indexed destination page (internal link)
  borderStyle : "solid" | "dashed" | "none";
  borderColor : string;  // CSS hex e.g. "#2563eb"
}

/** A bookmark entry in the PDF outline tree. */
export interface BookmarkEntry {
  id      : string;
  title   : string;
  pageIdx : number;   // 0-indexed original page index
  level   : number;   // 0 = top-level, 1 = sub, 2 = sub-sub, etc.
  x?      : number;   // PDF points — present when anchored to a position
  y?      : number;   // PDF points
}

// ── API calls ────────────────────────────────────────────────────────────────

function xhrJson<T>(method: string, url: string, body?: FormData | string): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    if (typeof body === "string") xhr.setRequestHeader("Content-Type", "application/json");
    xhr.responseType = "json";
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response as T);
      } else {
        reject(new Error(typeof xhr.response === "object" && xhr.response?.detail
          ? xhr.response.detail
          : `HTTP ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(body);
  });
}

export async function uploadPdf(file: File): Promise<UploadResponse> {
  const form = new FormData();
  form.append("file", file);
  return xhrJson<UploadResponse>("POST", `${API_BASE}/api/upload`, form);
}

export async function fetchOutline(fileHash: string): Promise<BookmarkEntry[]> {
  // Use XMLHttpRequest instead of fetch so browser extensions that intercept
  // fetch() (e.g. Ant Design devtools) don't break the outline load.
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", `${API_BASE}/api/outline/${fileHash}`);
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) { resolve([]); return; }
      try {
        const data: Array<{ level: number; title: string; page: number }> = JSON.parse(xhr.responseText);
        const ts = Date.now();
        resolve(data.map((item, i) => ({
          id     : `bm-${i}-${ts}`,
          title  : item.title,
          pageIdx: Math.max(0, item.page - 1),
          level  : Math.max(0, item.level - 1),
        })));
      } catch {
        resolve([]);
      }
    };
    xhr.onerror = () => resolve([]);
    xhr.send();
  });
}

export interface JobResponse {
  status: "done" | "processing" | "error";
  progress?: number;
  pages?: ApiPage[];
  message?: string;
}

export async function pollJob(jobId: string): Promise<JobResponse> {
  return xhrJson<JobResponse>("GET", `${API_BASE}/api/job/${jobId}`);
}

/** Convenience: poll until done, reject on error. Calls onProgress with 0–100. */
export async function waitForJob(
  jobId: string,
  onProgress?: (pct: number) => void
): Promise<ApiPage[]> {
  while (true) {
    const data = await pollJob(jobId);
    if (data.status === "done") return data.pages!;
    if (data.status === "error") throw new Error(data.message ?? "Processing failed");
    onProgress?.(data.progress ?? 0);
    await new Promise((r) => setTimeout(r, 1200));
  }
}
