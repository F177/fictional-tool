"use client";

import { createContext, useContext, useState, useCallback, useRef, ReactNode } from "react";

export type Tool =
  | "select"
  | "edittext"
  | "text"
  | "draw"
  | "highlight"
  | "erase"
  | "rectangle"
  | "ellipse"
  | "arrow"
  | "signature";

export interface Annotation {
  id: string;
  pageIndex: number;
  type: Tool | "text-edit";
  x: number;
  y: number;
  width?: number;
  height?: number;
  text?: string;
  color?: string;
  fontSize?: number;
  fontFamily?: string;
  strokeWidth?: number;
  opacity?: number;
  points?: { x: number; y: number }[];
  // text-edit specific: original PDF space coordinates (unscaled, for pdf-lib)
  pdfX?: number;
  pdfY?: number;
  pdfWidth?: number;
  pdfHeight?: number;
  pdfFontSize?: number;
  originalText?: string;
  // OCR-based text-edit: normalised coordinates [0–1] — zoom-invariant
  normLeft?: number;
  normTop?: number;
  normRight?: number;
  normBottom?: number;
  bgColor?: string; // sampled background colour (replaces white cover)
}

interface EditorState {
  pdfData: string | null;
  pdfName: string;
  totalPages: number;
  currentPage: number;
  zoom: number;
  activeTool: Tool;
  activeColor: string;
  activeHighlightColor: string;
  fontSize: number;
  strokeWidth: number;
  annotations: Annotation[];
  selectedAnnotationId: string | null;
  history: Annotation[][];
  historyIndex: number;
}

interface EditorContextType extends EditorState {
  setPdfData: (data: string, name: string) => void;
  setTotalPages: (n: number) => void;
  setCurrentPage: (n: number) => void;
  setZoom: (z: number) => void;
  setActiveTool: (t: Tool) => void;
  setActiveColor: (c: string) => void;
  setActiveHighlightColor: (c: string) => void;
  setFontSize: (s: number) => void;
  setStrokeWidth: (w: number) => void;
  addAnnotation: (ann: Annotation) => void;
  updateAnnotation: (id: string, partial: Partial<Annotation>) => void;
  deleteAnnotation: (id: string) => void;
  setSelectedAnnotationId: (id: string | null) => void;
  undo: () => void;
  redo: () => void;
  clearPage: (pageIndex: number) => void;
}

const EditorContext = createContext<EditorContextType | null>(null);

export function EditorProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<EditorState>({
    pdfData: null,
    pdfName: "",
    totalPages: 0,
    currentPage: 0,
    zoom: 1,
    activeTool: "draw",
    activeColor: "#1a1a2e",
    activeHighlightColor: "#facc15",
    fontSize: 16,
    strokeWidth: 3,
    annotations: [],
    selectedAnnotationId: null,
    history: [[]],
    historyIndex: 0,
  });

  const pushHistory = useCallback((annotations: Annotation[]) => {
    setState((prev) => {
      const newHistory = prev.history.slice(0, prev.historyIndex + 1);
      newHistory.push([...annotations]);
      return { ...prev, history: newHistory, historyIndex: newHistory.length - 1 };
    });
  }, []);

  const setPdfData = useCallback((data: string, name: string) => {
    setState((prev) => ({ ...prev, pdfData: data, pdfName: name }));
  }, []);

  const setTotalPages = useCallback((n: number) => setState((p) => ({ ...p, totalPages: n })), []);
  const setCurrentPage = useCallback((n: number) => setState((p) => ({ ...p, currentPage: n })), []);
  const setZoom = useCallback((z: number) => setState((p) => ({ ...p, zoom: Math.min(3, Math.max(0.3, z)) })), []);
  const setActiveTool = useCallback((t: Tool) => setState((p) => ({ ...p, activeTool: t, selectedAnnotationId: null })), []);
  const setActiveColor = useCallback((c: string) => setState((p) => ({ ...p, activeColor: c })), []);
  const setActiveHighlightColor = useCallback((c: string) => setState((p) => ({ ...p, activeHighlightColor: c })), []);
  const setFontSize = useCallback((s: number) => setState((p) => ({ ...p, fontSize: s })), []);
  const setStrokeWidth = useCallback((w: number) => setState((p) => ({ ...p, strokeWidth: w })), []);
  const setSelectedAnnotationId = useCallback((id: string | null) => setState((p) => ({ ...p, selectedAnnotationId: id })), []);

  const addAnnotation = useCallback((ann: Annotation) => {
    setState((prev) => {
      const updated = [...prev.annotations, ann];
      const newHistory = prev.history.slice(0, prev.historyIndex + 1);
      newHistory.push([...updated]);
      return { ...prev, annotations: updated, history: newHistory, historyIndex: newHistory.length - 1 };
    });
  }, []);

  const updateAnnotation = useCallback((id: string, partial: Partial<Annotation>) => {
    setState((prev) => {
      const updated = prev.annotations.map((a) => (a.id === id ? { ...a, ...partial } : a));
      const newHistory = prev.history.slice(0, prev.historyIndex + 1);
      newHistory.push([...updated]);
      return { ...prev, annotations: updated, history: newHistory, historyIndex: newHistory.length - 1 };
    });
  }, []);

  const deleteAnnotation = useCallback((id: string) => {
    setState((prev) => {
      const updated = prev.annotations.filter((a) => a.id !== id);
      const newHistory = prev.history.slice(0, prev.historyIndex + 1);
      newHistory.push([...updated]);
      return { ...prev, annotations: updated, history: newHistory, historyIndex: newHistory.length - 1, selectedAnnotationId: null };
    });
  }, []);

  const undo = useCallback(() => {
    setState((prev) => {
      if (prev.historyIndex <= 0) return prev;
      const newIndex = prev.historyIndex - 1;
      return { ...prev, annotations: [...prev.history[newIndex]], historyIndex: newIndex };
    });
  }, []);

  const redo = useCallback(() => {
    setState((prev) => {
      if (prev.historyIndex >= prev.history.length - 1) return prev;
      const newIndex = prev.historyIndex + 1;
      return { ...prev, annotations: [...prev.history[newIndex]], historyIndex: newIndex };
    });
  }, []);

  const clearPage = useCallback((pageIndex: number) => {
    setState((prev) => {
      const updated = prev.annotations.filter((a) => a.pageIndex !== pageIndex);
      const newHistory = prev.history.slice(0, prev.historyIndex + 1);
      newHistory.push([...updated]);
      return { ...prev, annotations: updated, history: newHistory, historyIndex: newHistory.length - 1 };
    });
  }, []);

  return (
    <EditorContext.Provider
      value={{
        ...state,
        setPdfData,
        setTotalPages,
        setCurrentPage,
        setZoom,
        setActiveTool,
        setActiveColor,
        setActiveHighlightColor,
        setFontSize,
        setStrokeWidth,
        addAnnotation,
        updateAnnotation,
        deleteAnnotation,
        setSelectedAnnotationId,
        undo,
        redo,
        clearPage,
      }}
    >
      {children}
    </EditorContext.Provider>
  );
}

export function useEditor() {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error("useEditor must be used within EditorProvider");
  return ctx;
}
