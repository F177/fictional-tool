import { API_BASE, type WordEdit, type AddedWordItem, type AddedImageItem, type DrawnShape, type StickyNote, type LinkAnnotation, type BookmarkEntry } from "./api";
import type { WatermarkConfig } from "@/components/editor/WatermarkDialog";
import type { ExportOptions } from "@/components/editor/ExportOptionsDialog";

export async function exportPdfWithEdits(
  fileHash    : string,
  edits       : Record<number, Record<number, WordEdit>>,
  addedWords  : Record<number, AddedWordItem[]>                   = {},
  rotations   : Record<number, number>                            = {},
  addedImages : Record<number, AddedImageItem[]>                  = {},
  deletedPages: number[]                                          = [],
  drawnShapes : (DrawnShape & { pageIdx: number })[]              = [],
  stickyNotes : (StickyNote & { pageIdx: number })[]             = [],
  formValues  : Record<number, Record<string, string>>            = {},
  pageOrder   : number[]                                          = [],
  watermark   : WatermarkConfig | null                            = null,
  exportOpts  : ExportOptions | null                              = null,
  links       : (LinkAnnotation & { pageIdx: number })[]          = [],
  bookmarks   : BookmarkEntry[]                                   = [],
): Promise<Uint8Array> {
  const addedWordList  = Object.entries(addedWords).flatMap(([p, words]) =>
    words.map(w => ({ ...w, pageIdx: Number(p) }))
  );
  const addedImageList = Object.entries(addedImages).flatMap(([p, imgs]) =>
    imgs.map(img => ({ ...img, pageIdx: Number(p) }))
  );

  const body = JSON.stringify({
    file_hash    : fileHash,
    edits,
    added_words  : addedWordList,
    rotations,
    added_images : addedImageList,
    deleted_pages: deletedPages,
    drawn_shapes : drawnShapes,
    sticky_notes : stickyNotes,
    form_values  : Object.fromEntries(Object.entries(formValues).map(([k, v]) => [k, v])),
    page_order   : pageOrder,
    watermark    : watermark ?? null,
    password     : exportOpts?.password ?? "",
    metadata     : exportOpts ? {
      title   : exportOpts.title,
      author  : exportOpts.author,
      subject : exportOpts.subject,
      keywords: exportOpts.keywords,
    } : {},
    compress     : exportOpts?.compress ?? true,
    page_range   : exportOpts?.pageRange ?? "",
    links,
    bookmarks,
  });

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/api/export`);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.responseType = "arraybuffer";
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(new Uint8Array(xhr.response as ArrayBuffer));
      } else {
        const text = new TextDecoder().decode(xhr.response as ArrayBuffer);
        reject(new Error(text || `HTTP ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(body);
  });
}
