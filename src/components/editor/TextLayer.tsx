"use client";

import { useEffect, useState, useRef, useCallback, RefObject } from "react";
import { useEditor, type Annotation } from "@/lib/editor-context";
import { recognizePage, sampleBackground, contrastColor, clearOcrCache, type OcrWord } from "@/lib/ocr-service";
import { nanoid } from "@/lib/nanoid";
import { Loader2 } from "lucide-react";

interface TextLayerProps {
  pdfCanvasRef: RefObject<HTMLCanvasElement | null>;
  pageIndex: number;
  cssWidth: number;
  cssHeight: number;
}

export default function TextLayer({ pdfCanvasRef, pageIndex, cssWidth, cssHeight }: TextLayerProps) {
  const editor = useEditor();
  const [words, setWords] = useState<OcrWord[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "empty" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [editingWord, setEditingWord] = useState<OcrWord | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasRunRef = useRef(false);

  const isEditMode = editor.activeTool === "edittext";
  const cacheKey = `page-${pageIndex}`;

  // ── Run OCR when edit-text tool is first activated ────────────────────────
  useEffect(() => {
    if (!isEditMode || hasRunRef.current) return;
    const canvas = pdfCanvasRef.current;
    if (!canvas || canvas.width === 0) return;

    hasRunRef.current = true;
    setStatus("loading");

    recognizePage(canvas, cacheKey)
      .then((result) => {
        setWords(result);
        setStatus(result.length === 0 ? "empty" : "done");
      })
      .catch((e) => { setErrorMsg(String(e?.message ?? e)); setStatus("error"); });
  }, [isEditMode, pdfCanvasRef, cacheKey]);

  // ── Re-run when page re-renders (zoom change clears hasRunRef) ─────────────
  useEffect(() => {
    hasRunRef.current = false;
    clearOcrCache(cacheKey);
    setWords([]);
    setStatus("idle");
  }, [cssWidth, cssHeight]); // canvas size changed = zoom changed

  // ── Get committed edit for a word ─────────────────────────────────────────
  const getEdit = useCallback(
    (w: OcrWord): Annotation | undefined =>
      editor.annotations.find(
        (a) =>
          a.type === "text-edit" &&
          a.pageIndex === pageIndex &&
          a.normLeft !== undefined &&
          Math.abs((a.normLeft ?? 0) - w.normLeft) < 0.001 &&
          Math.abs((a.normTop  ?? 0) - w.normTop)  < 0.001
      ),
    [editor.annotations, pageIndex]
  );

  const openEdit = useCallback((word: OcrWord) => {
    setEditingWord(word);
    setTimeout(() => { textareaRef.current?.focus(); textareaRef.current?.select(); }, 0);
  }, []);

  const commitEdit = useCallback(
    (word: OcrWord, newText: string) => {
      setEditingWord(null);
      const existing = getEdit(word);
      if (existing) editor.deleteAnnotation(existing.id);
      if (!newText.trim()) return; // blank = delete the text (leave cover, no new text)

      const canvas = pdfCanvasRef.current;
      const bgColor = canvas
        ? sampleBackground(canvas, word.normLeft, word.normTop, word.normRight, word.normBottom)
        : "rgb(255,255,255)";
      const textColor = contrastColor(bgColor);

      const x = word.normLeft  * cssWidth;
      const y = word.normTop   * cssHeight;
      const w = (word.normRight  - word.normLeft) * cssWidth;
      const h = (word.normBottom - word.normTop)  * cssHeight;

      editor.addAnnotation({
        id: nanoid(),
        pageIndex,
        type: "text-edit",
        x, y, width: w, height: h,
        text: newText,
        originalText: word.text,
        color: textColor,
        fontSize: h * 0.75,
        fontFamily: "sans-serif",
        opacity: 1,
        bgColor,
        normLeft:   word.normLeft,
        normTop:    word.normTop,
        normRight:  word.normRight,
        normBottom: word.normBottom,
      });
    },
    [editor, pageIndex, getEdit, pdfCanvasRef, cssWidth, cssHeight]
  );

  // ── Committed edits for THIS page ─────────────────────────────────────────
  const committed = editor.annotations.filter(
    (a) => a.type === "text-edit" && a.pageIndex === pageIndex && a.normLeft !== undefined
  );

  if (cssWidth === 0 || cssHeight === 0) return null;

  return (
    <div
      className="absolute top-0 left-0 select-none"
      style={{ width: cssWidth, height: cssHeight, pointerEvents: "none" }}
    >
      {/* ── Always-visible committed text replacements ───────────────────── */}
      {committed.map((ann) => {
        const x = (ann.normLeft  ?? 0) * cssWidth;
        const y = (ann.normTop   ?? 0) * cssHeight;
        const w = ((ann.normRight  ?? 1) - (ann.normLeft  ?? 0)) * cssWidth;
        const h = ((ann.normBottom ?? 1) - (ann.normTop   ?? 0)) * cssHeight;
        // Cover width: wide enough for longer replacement text
        const coverW = Math.max(w, (ann.text?.length ?? 1) * (h * 0.55) + 4);
        const textColor = ann.color ?? contrastColor(ann.bgColor ?? "rgb(255,255,255)");

        const isBeingEdited =
          editingWord !== null &&
          Math.abs((editingWord.normLeft) - (ann.normLeft ?? 0)) < 0.001 &&
          Math.abs((editingWord.normTop)  - (ann.normTop  ?? 0)) < 0.001;

        return (
          <div
            key={ann.id}
            className="absolute overflow-visible"
            style={{
              left: x,
              top: y,
              width: coverW,
              height: h,
              background: ann.bgColor ?? "white",
              fontSize: h * 0.75,
              fontFamily: "sans-serif",
              color: textColor,
              lineHeight: 1,
              display: "flex",
              alignItems: "center",
              whiteSpace: "nowrap",
              pointerEvents: isEditMode ? "auto" : "none",
              cursor: isEditMode ? "text" : "default",
              zIndex: 15,
            }}
            onClick={() => {
              if (!isEditMode) return;
              const src = words.find(
                (ww) =>
                  Math.abs(ww.normLeft - (ann.normLeft ?? 0)) < 0.001 &&
                  Math.abs(ww.normTop  - (ann.normTop  ?? 0)) < 0.001
              );
              if (src) openEdit(src);
            }}
          >
            {!isBeingEdited && ann.text}
          </div>
        );
      })}

      {/* ── Edit-mode UI ────────────────────────────────────────────────── */}
      {isEditMode && (
        <>
          {/* Loading / empty / error states */}
          {status === "loading" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/10 rounded z-30">
              <Loader2 className="w-6 h-6 animate-spin text-violet-600" />
              <p className="text-xs font-medium bg-white/90 px-2 py-1 rounded shadow">
                Analysing text with OCR…
              </p>
            </div>
          )}
          {status === "empty" && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 text-xs bg-amber-100 text-amber-800 px-3 py-1 rounded-full shadow">
              No text detected on this page
            </div>
          )}
          {status === "error" && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 text-xs bg-red-100 text-red-800 px-3 py-1 rounded shadow max-w-xs text-center">
              OCR failed — {errorMsg || "try again"}
            </div>
          )}

          {/* Word hover buttons */}
          {status === "done" &&
            words.map((word, i) => {
              const existingEdit = getEdit(word);
              if (existingEdit) return null; // covered by the committed div above
              const isEditing = editingWord === word;
              const x = word.normLeft  * cssWidth;
              const y = word.normTop   * cssHeight;
              const w = (word.normRight  - word.normLeft) * cssWidth;
              const h = (word.normBottom - word.normTop)  * cssHeight;
              const fontSize = h * 0.75;

              return (
                <div
                  key={i}
                  className="absolute"
                  style={{ left: x, top: y, width: Math.max(w, 10), height: Math.max(h, 10), pointerEvents: "auto", zIndex: 20 }}
                >
                  {isEditing ? (
                    <textarea
                      ref={textareaRef}
                      defaultValue={word.text}
                      rows={1}
                      className="absolute top-0 left-0 border-2 border-violet-500 bg-white text-black rounded-sm z-30"
                      style={{
                        fontSize,
                        lineHeight: 1,
                        fontFamily: "sans-serif",
                        width: Math.max(w * 2.5, 120),
                        height: Math.max(h * 1.6, 28),
                        resize: "none",
                        outline: "none",
                        padding: "1px 3px",
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          commitEdit(word, (e.target as HTMLTextAreaElement).value);
                        }
                        if (e.key === "Escape") setEditingWord(null);
                      }}
                      onBlur={(e) => commitEdit(word, e.target.value)}
                    />
                  ) : (
                    <button
                      className="absolute inset-0 w-full h-full rounded-sm transition-all"
                      style={{ background: "transparent", border: "1px dashed transparent", cursor: "text" }}
                      title={`Edit: "${word.text}"`}
                      onMouseEnter={(e) => {
                        const el = e.currentTarget as HTMLElement;
                        el.style.background = "rgba(139,92,246,0.18)";
                        el.style.border = "1px dashed rgba(139,92,246,0.7)";
                        el.style.borderRadius = "2px";
                      }}
                      onMouseLeave={(e) => {
                        const el = e.currentTarget as HTMLElement;
                        el.style.background = "transparent";
                        el.style.border = "1px dashed transparent";
                      }}
                      onClick={() => openEdit(word)}
                    />
                  )}
                </div>
              );
            })}
        </>
      )}
    </div>
  );
}
