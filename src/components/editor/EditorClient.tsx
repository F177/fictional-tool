"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Download, FileText, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import PageOverlay from "./PageOverlay";
import PageThumbnailSidebar from "./PageThumbnailSidebar";
import Ruler, { RULER_SIZE } from "./Ruler";
import HistoryPanel from "./HistoryPanel";
import LayersPanel from "./LayersPanel";
import InlineFormatBar from "./InlineFormatBar";
import Toolbar, { ZOOM_STEPS, type ActiveFormat } from "./Toolbar";
import FindReplace from "./FindReplace";
import { uploadPdf, waitForJob, fetchOutline, type ApiPage, type WordEdit, type AddedWordItem, type AddedImageItem, type CellRef, type FormatPatch, type DrawnShape, type DrawTool, type StickyNote, type GroupDef, type LinkAnnotation, type BookmarkEntry, type RedactionZone, type CropBox, type PageNumberConfig } from "@/lib/api";
import SignatureDialog from "./SignatureDialog";
import PageNumbersDialog from "./PageNumbersDialog";
import ShapeFormatBar from "./ShapeFormatBar";
import BookmarksPanel from "./BookmarksPanel";
import LinkDialog from "./LinkDialog";
import WatermarkDialog, { type WatermarkConfig } from "./WatermarkDialog";
import ExportOptionsDialog, { type ExportOptions } from "./ExportOptionsDialog";
import { exportPdfWithEdits } from "@/lib/pdf-utils";
import { getPdf } from "@/lib/pdf-store";
import { nanoid } from "@/lib/nanoid";

type Status = "idle" | "uploading" | "processing" | "done" | "error";

// ── History reducer ────────────────────────────────────────────────────────────

type Edits          = Record<number, Record<number, WordEdit>>;
type Added          = Record<number, AddedWordItem[]>;
type Images         = Record<number, AddedImageItem[]>;
type Drawings       = Record<number, DrawnShape[]>;
type Notes          = Record<number, StickyNote[]>;
type FormValues     = Record<number, Record<string, string>>;
type Links          = Record<number, LinkAnnotation[]>;
type RedactionZones = Record<number, RedactionZone[]>;
type CropBoxes      = Record<number, CropBox>;

type Snapshot = {
  edits          : Edits;
  added          : Added;
  addedImages    : Images;
  rotations      : Record<number, number>;
  deletedPages   : number[];
  drawings       : Drawings;
  stickyNotes    : Notes;
  formValues     : FormValues;
  pageOrder      : number[];   // display order → original page index
  groups         : GroupDef[];
  links          : Links;
  redactionZones : RedactionZones;
  cropBoxes      : CropBoxes;
};

export type HistoryIconType =
  | "text" | "addText" | "deleteText"
  | "rotate" | "image" | "deleteImage"
  | "deletePage" | "restorePage" | "format";

export type HistoryMeta = {
  label    : string;
  timestamp: number;
  iconType : HistoryIconType;
};

type HistoryState = { snapshots: Snapshot[]; meta: HistoryMeta[]; index: number };

// Primitive actions that mutate the document (no undo/redo/meta actions)
type PrimitiveAction =
  | { type: "edit";        pageIdx: number; wordIdx: number; wordEdit: WordEdit }
  | { type: "addWord";     pageIdx: number; word: AddedWordItem }
  | { type: "editAdded";   pageIdx: number; id: string; word: AddedWordItem }
  | { type: "removeAdded"; pageIdx: number; id: string }
  | { type: "rotate";      pageIdx: number; delta: 90 | -90 | 180 }
  | { type: "addImage";    pageIdx: number; img: AddedImageItem }
  | { type: "editImage";   pageIdx: number; id: string; img: AddedImageItem }
  | { type: "removeImage"; pageIdx: number; id: string }
  | { type: "deletePage";   pageIdx: number }
  | { type: "restorePage";  pageIdx: number }
  | { type: "addShape";     pageIdx: number; shape: DrawnShape }
  | { type: "removeShape";  pageIdx: number; id: string }
  | { type: "addNote";      pageIdx: number; note: StickyNote }
  | { type: "editNote";     pageIdx: number; id: string; note: StickyNote }
  | { type: "removeNote";   pageIdx: number; id: string }
  | { type: "setFormValue";  pageIdx: number; fieldId: string; value: string }
  | { type: "setPageOrder"; order: number[] }
  | { type: "createGroup";  groupId: string; members: CellRef[] }
  | { type: "dissolveGroup"; groupId: string }
  | { type: "addLink";    pageIdx: number; link: LinkAnnotation }
  | { type: "editLink";   pageIdx: number; id: string; link: LinkAnnotation }
  | { type: "removeLink"; pageIdx: number; id: string }
  | { type: "editShape";          pageIdx: number; id: string; shape: DrawnShape }
  | { type: "addRedactionZone";   pageIdx: number; zone: RedactionZone }
  | { type: "removeRedactionZone"; pageIdx: number; id: string }
  | { type: "setCropBox";         pageIdx: number; box: CropBox | null };

type HistoryAction =
  | PrimitiveAction
  | { type: "batch";       label: string; iconType: HistoryIconType; subActions: PrimitiveAction[] }
  | { type: "deleteEntry"; entryIndex: number }
  | { type: "jumpTo";      targetIndex: number }
  | { type: "undo" }
  | { type: "redo" };

const MAX_HISTORY = 200;

function applySubAction(current: Snapshot, action: PrimitiveAction): Snapshot {
  switch (action.type) {
    case "edit":
      return { ...current, edits: { ...current.edits, [action.pageIdx]: { ...(current.edits[action.pageIdx] ?? {}), [action.wordIdx]: action.wordEdit } } };
    case "addWord":
      return { ...current, added: { ...current.added, [action.pageIdx]: [...(current.added[action.pageIdx] ?? []), action.word] } };
    case "editAdded":
      return { ...current, added: { ...current.added, [action.pageIdx]: (current.added[action.pageIdx] ?? []).map(w => w.id === action.id ? action.word : w) } };
    case "removeAdded":
      return { ...current, added: { ...current.added, [action.pageIdx]: (current.added[action.pageIdx] ?? []).filter(w => w.id !== action.id) } };
    case "rotate": {
      const cur = current.rotations[action.pageIdx] ?? 0;
      return { ...current, rotations: { ...current.rotations, [action.pageIdx]: ((cur + action.delta) % 360 + 360) % 360 } };
    }
    case "addImage":
      return { ...current, addedImages: { ...current.addedImages, [action.pageIdx]: [...(current.addedImages[action.pageIdx] ?? []), action.img] } };
    case "editImage":
      return { ...current, addedImages: { ...current.addedImages, [action.pageIdx]: (current.addedImages[action.pageIdx] ?? []).map(img => img.id === action.id ? action.img : img) } };
    case "removeImage":
      return { ...current, addedImages: { ...current.addedImages, [action.pageIdx]: (current.addedImages[action.pageIdx] ?? []).filter(img => img.id !== action.id) } };
    case "deletePage":
      return { ...current, deletedPages: current.deletedPages.includes(action.pageIdx) ? current.deletedPages : [...current.deletedPages, action.pageIdx] };
    case "restorePage":
      return { ...current, deletedPages: current.deletedPages.filter(p => p !== action.pageIdx) };
    case "addShape":
      return { ...current, drawings: { ...current.drawings, [action.pageIdx]: [...(current.drawings[action.pageIdx] ?? []), action.shape] } };
    case "removeShape":
      return { ...current, drawings: { ...current.drawings, [action.pageIdx]: (current.drawings[action.pageIdx] ?? []).filter(s => s.id !== action.id) } };
    case "addNote":
      return { ...current, stickyNotes: { ...current.stickyNotes, [action.pageIdx]: [...(current.stickyNotes[action.pageIdx] ?? []), action.note] } };
    case "editNote":
      return { ...current, stickyNotes: { ...current.stickyNotes, [action.pageIdx]: (current.stickyNotes[action.pageIdx] ?? []).map(n => n.id === action.id ? action.note : n) } };
    case "removeNote":
      return { ...current, stickyNotes: { ...current.stickyNotes, [action.pageIdx]: (current.stickyNotes[action.pageIdx] ?? []).filter(n => n.id !== action.id) } };
    case "setFormValue":
      return { ...current, formValues: { ...current.formValues, [action.pageIdx]: { ...(current.formValues[action.pageIdx] ?? {}), [action.fieldId]: action.value } } };
    case "setPageOrder":
      return { ...current, pageOrder: action.order };
    case "createGroup":
      return { ...current, groups: [...current.groups, { id: action.groupId, members: action.members }] };
    case "dissolveGroup":
      return { ...current, groups: current.groups.filter(g => g.id !== action.groupId) };
    case "addLink":
      return { ...current, links: { ...current.links, [action.pageIdx]: [...(current.links[action.pageIdx] ?? []), action.link] } };
    case "editLink":
      return { ...current, links: { ...current.links, [action.pageIdx]: (current.links[action.pageIdx] ?? []).map(l => l.id === action.id ? action.link : l) } };
    case "removeLink":
      return { ...current, links: { ...current.links, [action.pageIdx]: (current.links[action.pageIdx] ?? []).filter(l => l.id !== action.id) } };
    case "editShape": {
      const existing = current.drawings[action.pageIdx] ?? [];
      return { ...current, drawings: { ...current.drawings, [action.pageIdx]: existing.map(s => s.id === action.id ? action.shape : s) } };
    }
    case "addRedactionZone":
      return { ...current, redactionZones: { ...current.redactionZones, [action.pageIdx]: [...(current.redactionZones[action.pageIdx] ?? []), action.zone] } };
    case "removeRedactionZone":
      return { ...current, redactionZones: { ...current.redactionZones, [action.pageIdx]: (current.redactionZones[action.pageIdx] ?? []).filter(z => z.id !== action.id) } };
    case "setCropBox": {
      const boxes = { ...current.cropBoxes };
      if (action.box === null) delete boxes[action.pageIdx];
      else boxes[action.pageIdx] = action.box;
      return { ...current, cropBoxes: boxes };
    }
  }
}

function getMeta(action: PrimitiveAction): HistoryMeta {
  const ts = Date.now();
  const p = "pageIdx" in action ? action.pageIdx + 1 : 0;
  switch (action.type) {
    case "edit":       return { label: action.wordEdit.deleted ? `Deleted word — page ${p}` : `Edited text — page ${p}`,   iconType: action.wordEdit.deleted ? "deleteText" : "text", timestamp: ts };
    case "addWord":    return { label: `Added text — page ${p}`,     iconType: "addText",     timestamp: ts };
    case "editAdded":  return { label: `Updated text — page ${p}`,   iconType: "text",        timestamp: ts };
    case "removeAdded":return { label: `Removed text — page ${p}`,   iconType: "deleteText",  timestamp: ts };
    case "rotate":     return { label: `Rotated page ${p} (${action.delta > 0 ? "+" : ""}${action.delta}°)`, iconType: "rotate", timestamp: ts };
    case "addImage":    return { label: `Added image — page ${p}`,    iconType: "image",       timestamp: ts };
    case "editImage":   return { label: `Moved image — page ${p}`,    iconType: "image",       timestamp: ts };
    case "removeImage": return { label: `Removed image — page ${p}`,  iconType: "deleteImage", timestamp: ts };
    case "deletePage":  return { label: `Deleted page ${p}`,          iconType: "deletePage",  timestamp: ts };
    case "restorePage": return { label: `Restored page ${p}`,         iconType: "restorePage", timestamp: ts };
    case "addShape":    return { label: `Drew shape — page ${p}`,     iconType: "image",       timestamp: ts };
    case "removeShape": return { label: `Removed shape — page ${p}`,  iconType: "deleteImage", timestamp: ts };
    case "addNote":     return { label: `Added note — page ${p}`,     iconType: "addText",     timestamp: ts };
    case "editNote":    return { label: `Edited note — page ${p}`,    iconType: "text",        timestamp: ts };
    case "removeNote":  return { label: `Removed note — page ${p}`,   iconType: "deleteText",  timestamp: ts };
    case "setFormValue": return { label: `Filled field — page ${p}`,  iconType: "text",        timestamp: ts };
    case "setPageOrder":   return { label: "Reordered pages",     iconType: "rotate",      timestamp: ts };
    case "createGroup":   return { label: "Grouped elements",     iconType: "image",       timestamp: ts };
    case "dissolveGroup": return { label: "Ungrouped elements",   iconType: "image",       timestamp: ts };
    case "addLink":       return { label: `Added link — page ${p}`,   iconType: "addText",  timestamp: ts };
    case "editLink":      return { label: `Edited link — page ${p}`,  iconType: "text",     timestamp: ts };
    case "removeLink":    return { label: `Removed link — page ${p}`, iconType: "deleteText", timestamp: ts };
    case "editShape":          return { label: `Edited shape — page ${p}`,     iconType: "image",       timestamp: ts };
    case "addRedactionZone":   return { label: `Redacted area — page ${p}`,    iconType: "deleteText",  timestamp: ts };
    case "removeRedactionZone":return { label: `Removed redaction — page ${p}`,iconType: "text",        timestamp: ts };
    case "setCropBox":         return { label: `Cropped page ${p}`,             iconType: "rotate",      timestamp: ts };
  }
}

function pushSnapshot(state: HistoryState, next: Snapshot, meta: HistoryMeta): HistoryState {
  const start = Math.max(0, state.index - MAX_HISTORY + 1);
  const snaps = [...state.snapshots.slice(start, state.index + 1), next];
  const metas = [...state.meta.slice(start, state.index + 1), meta];
  return { snapshots: snaps, meta: metas, index: snaps.length - 1 };
}

function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  if (action.type === "undo")   return { ...state, index: Math.max(0, state.index - 1) };
  if (action.type === "redo")   return { ...state, index: Math.min(state.snapshots.length - 1, state.index + 1) };
  if (action.type === "jumpTo") return { ...state, index: Math.max(0, Math.min(state.snapshots.length - 1, action.targetIndex)) };

  if (action.type === "deleteEntry") {
    if (state.snapshots.length <= 1) return state;
    const i = action.entryIndex;
    const newSnaps = state.snapshots.filter((_, idx) => idx !== i);
    const newMeta  = state.meta.filter((_, idx) => idx !== i);
    const newIdx   = i <= state.index ? Math.max(0, state.index - 1) : state.index;
    return { snapshots: newSnaps, meta: newMeta, index: newIdx };
  }

  if (action.type === "batch") {
    let next = state.snapshots[state.index];
    for (const sub of action.subActions) next = applySubAction(next, sub);
    return pushSnapshot(state, next, { label: action.label, iconType: action.iconType, timestamp: Date.now() });
  }

  return pushSnapshot(state, applySubAction(state.snapshots[state.index], action), getMeta(action));
}

function buildFormatLabel(patch: FormatPatch): string {
  const parts: string[] = [];
  if (patch.bold          !== undefined) parts.push(patch.bold          ? "Bold"          : "Remove bold");
  if (patch.italic        !== undefined) parts.push(patch.italic        ? "Italic"        : "Remove italic");
  if (patch.underline     !== undefined) parts.push(patch.underline     ? "Underline"     : "Remove underline");
  if (patch.strikethrough !== undefined) parts.push(patch.strikethrough ? "Strikethrough" : "Remove strikethrough");
  if (patch.fontSize      !== undefined) parts.push(`Size ${patch.fontSize}pt`);
  if (patch.fontFamily    !== undefined) parts.push("Font family");
  if (patch.color         !== undefined) parts.push("Text color");
  if (patch.highlight     !== undefined) parts.push(patch.highlight ? "Highlight" : "Remove highlight");
  if (patch.textAlign     !== undefined) parts.push(`Align ${patch.textAlign}`);
  return parts.join(" · ") || "Format";
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cellRefsEqual(a: CellRef, b: CellRef): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "word"  && b.kind === "word")  return a.pageIdx === b.pageIdx && a.wordIdx === b.wordIdx;
  if (a.kind === "added" && b.kind === "added") return a.pageIdx === b.pageIdx && a.id === b.id;
  if (a.kind === "image" && b.kind === "image") return a.pageIdx === b.pageIdx && a.id === b.id;
  return false;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function EditorClient() {
  const router = useRouter();
  const [pages, setPages]         = useState<ApiPage[]>([]);
  const [status, setStatus]       = useState<Status>("idle");
  const [progress, setProgress]   = useState(0);
  const [errorMsg, setErrorMsg]   = useState("");
  const [downloading, setDownloading] = useState(false);
  const [zoom, setZoom]           = useState(1);
  const [floatingBarPos, setFloatingBarPos] = useState<{ x: number; y: number } | null>(null);
  const clipboardRef = useRef<Array<{ added?: AddedWordItem; image?: AddedImageItem; pageIdx: number }>>([]);
  const [selectedCells, setSelectedCells] = useState<CellRef[]>([]);
  const [addTextMode, setAddTextMode]     = useState(false);
  const [sidebarOpen, setSidebarOpen]     = useState(true);
  const [currentPage, setCurrentPage]     = useState(0);
  const [sigDialogOpen, setSigDialogOpen] = useState(false);
  const [imgPlacement, setImgPlacement]   = useState<{ dataUrl: string; aspectRatio: number } | null>(null);
  const [historyOpen,        setHistoryOpen]        = useState(false);
  const [layersOpen,         setLayersOpen]         = useState(false);
  const [showEditIndicators, setShowEditIndicators] = useState(false);
  const [drawTool,    setDrawTool]    = useState<DrawTool | null>(null);
  const [drawColor,   setDrawColor]   = useState("#ef4444");
  const [drawWidth,   setDrawWidth]   = useState(2);
  const [drawFill,    setDrawFill]    = useState<string | null>(null);
  const [drawOpacity, setDrawOpacity] = useState(1);
  const [pageFilter,  setPageFilter]  = useState<"original" | "color" | "grayscale" | "bw" | "highcontrast" | "sepia" | "warm" | "cool" | "invert">("original");
  const [darkMode,    setDarkMode]    = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("thepdf-dark") === "1" || document.documentElement.classList.contains("dark");
  });
  const [redactMode, setRedactMode] = useState(false);
  const [noteMode,   setNoteMode]   = useState(false);
  const [watermark,       setWatermark]       = useState<WatermarkConfig | null>(null);
  const [watermarkOpen,   setWatermarkOpen]   = useState(false);
  const [exportOptsOpen,  setExportOptsOpen]  = useState(false);
  const [rulerCursor,    setRulerCursor]    = useState<{ x: number; y: number } | undefined>();
  const [guides, setGuides] = useState<Array<{ id: string; orientation: "h" | "v"; scrollPx: number }>>([]);
  const [guideMenu, setGuideMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [bookmarks,          setBookmarks]          = useState<BookmarkEntry[]>([]);
  const [bookmarksOpen,      setBookmarksOpen]      = useState(false);
  const [bookmarkPlaceMode,  setBookmarkPlaceMode]  = useState(false);
  const [linkMode,           setLinkMode]           = useState(false);
  const [linkEditState,  setLinkEditState]  = useState<{
    mode   : "create" | "edit";
    pageIdx: number;
    id?    : string;
    x      : number; y: number; w: number; h: number;
  } | null>(null);
  const [cropMode,           setCropMode]           = useState(false);
  const [pageNumberConfig,   setPageNumberConfig]   = useState<PageNumberConfig | null>(null);
  const [pageNumbersOpen,    setPageNumbersOpen]    = useState(false);
  const [selectedShapeId, setSelectedShapeId] = useState<{ pageIdx: number; id: string } | null>(null);
  const selectedShapeIdRef = useRef<{ pageIdx: number; id: string } | null>(null);
  const [shapeBarPos, setShapeBarPos] = useState<{ x: number; y: number } | null>(null);

  const imageFileInputRef = useRef<HTMLInputElement>(null);

  // Find & replace
  const [findOpen,     setFindOpen]     = useState(false);
  const [findQuery,    setFindQuery]    = useState("");
  const [replaceQuery, setReplaceQuery] = useState("");
  const [findMatchIdx, setFindMatchIdx] = useState(0);

  const pdfNameRef  = useRef("document.pdf");
  const pdfFileRef  = useRef<File | null>(null);
  const fileHashRef = useRef<string>("");

  const [{ snapshots, meta: historyMeta, index }, dispatch] = useReducer(historyReducer, {
    snapshots: [{ edits: {}, added: {}, addedImages: {}, rotations: {}, deletedPages: [], drawings: {}, stickyNotes: {}, formValues: {}, pageOrder: [], groups: [], links: {}, redactionZones: {}, cropBoxes: {} }],
    meta     : [{ label: "Document opened", iconType: "text" as HistoryIconType, timestamp: Date.now() }],
    index    : 0,
  });
  const { edits, added, addedImages, rotations, deletedPages, drawings, stickyNotes, formValues, pageOrder: rawPageOrder, groups, links, redactionZones, cropBoxes } = snapshots[index];
  // Derive effective page order: init from pages.length if snapshot has none yet
  const pageOrder = rawPageOrder.length > 0 ? rawPageOrder : pages.map((_, i) => i);
  const canUndo = index > 0;
  const canRedo = index < snapshots.length - 1;

  // Stale-closure refs
  const pagesRef         = useRef(pages);
  const editsRef         = useRef(edits);
  const addedRef         = useRef(added);
  const addedImagesRef   = useRef(addedImages);
  const selectedCellsRef = useRef(selectedCells);
  const groupsRef        = useRef(groups);
  const rulerRafRef      = useRef<number>(0);
  const activeFormatRef  = useRef<ActiveFormat | null>(null);
  const currentPageRef   = useRef(0);
  const zoomRef          = useRef(zoom);
  const pageOrderRef     = useRef<number[]>([]);
  const bookmarksRef     = useRef<BookmarkEntry[]>([]);
  const linksRef         = useRef<Links>({});
  useEffect(() => { pagesRef.current = pages; },                 [pages]);
  useEffect(() => { editsRef.current = edits; },                 [edits]);
  useEffect(() => { addedRef.current = added; },                 [added]);
  useEffect(() => { addedImagesRef.current = addedImages; },     [addedImages]);
  useEffect(() => { selectedCellsRef.current = selectedCells; }, [selectedCells]);
  useEffect(() => { groupsRef.current = groups; },               [groups]);
  useEffect(() => { currentPageRef.current = currentPage; },     [currentPage]);
  useEffect(() => { zoomRef.current = zoom; },                   [zoom]);
  useEffect(() => { pageOrderRef.current = pageOrder; },         [pageOrder]);
  useEffect(() => { bookmarksRef.current = bookmarks; },         [bookmarks]);
  useEffect(() => { linksRef.current = links; },                 [links]);
  useEffect(() => { selectedShapeIdRef.current = selectedShapeId; }, [selectedShapeId]);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    localStorage.setItem("thepdf-dark", darkMode ? "1" : "0");
  }, [darkMode]);

  const mainScrollRef = useRef<HTMLElement>(null);

  const startGuideDrag = (orientation: "h" | "v") => {
    const draft = document.createElement("div");
    draft.style.cssText = `position:fixed;z-index:9999;pointer-events:none;background:#3b82f6;opacity:0.8;${
      orientation === "h" ? "left:0;right:0;height:1px;" : "top:0;bottom:0;width:1px;"
    }`;
    document.body.appendChild(draft);

    const onMove = (e: MouseEvent) => {
      if (orientation === "h") draft.style.top = `${e.clientY}px`;
      else                      draft.style.left = `${e.clientX}px`;
    };
    const onUp = (e: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
      document.body.removeChild(draft);
      const main = mainScrollRef.current;
      if (!main) return;
      const rect = main.getBoundingClientRect();
      if (orientation === "h") {
        if (e.clientY < rect.top || e.clientY > rect.bottom) return;
        setGuides(prev => [...prev, { id: nanoid(), orientation, scrollPx: e.clientY - rect.top + main.scrollTop }]);
      } else {
        if (e.clientX < rect.left || e.clientX > rect.right) return;
        setGuides(prev => [...prev, { id: nanoid(), orientation, scrollPx: e.clientX - rect.left + main.scrollLeft }]);
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
  };

  // Smooth Ctrl+wheel zoom — attach to window so it always fires even before pages load.
  // Zoom anchors to cursor position so content under cursor stays stationary.
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      const main = mainScrollRef.current;
      if (!main) return;
      // Only intercept when cursor is over the PDF scroll area.
      const rect = main.getBoundingClientRect();
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return;
      e.preventDefault();
      const factor = Math.pow(1.001, -e.deltaY);
      // Capture cursor position relative to scroll content before zoom.
      const cursorX = e.clientX - rect.left + main.scrollLeft;
      const cursorY = e.clientY - rect.top  + main.scrollTop;
      setZoom(z => {
        const newZ = Math.max(0.25, Math.min(4, z * factor));
        // After React re-renders with new zoom, adjust scroll so cursor point is stationary.
        requestAnimationFrame(() => {
          const m = mainScrollRef.current;
          if (!m) return;
          m.scrollLeft = cursorX * (newZ / z) - (e.clientX - rect.left);
          m.scrollTop  = cursorY * (newZ / z) - (e.clientY - rect.top);
        });
        return newZ;
      });
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, []);


  // ── Page tracking + virtualization window ────────────────────────────────

  const VIRT_BUFFER = 2; // render this many pages above/below the visible one
  const [visibleRange, setVisibleRange] = useState<[number, number]>([0, VIRT_BUFFER * 2]);

  useEffect(() => {
    if (pages.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        let bestIdx   = currentPageRef.current;
        let bestRatio = 0;
        for (const entry of entries) {
          const idx = Number((entry.target as HTMLElement).dataset.pageIdx);
          if (entry.intersectionRatio > bestRatio) {
            bestRatio = entry.intersectionRatio;
            bestIdx   = idx;
          }
        }
        setCurrentPage(bestIdx);
        setVisibleRange([
          Math.max(0, bestIdx - VIRT_BUFFER),
          Math.min(pages.length - 1, bestIdx + VIRT_BUFFER),
        ]);
      },
      { root: mainScrollRef.current, threshold: Array.from({ length: 11 }, (_, k) => k * 0.1) },
    );
    for (let i = 0; i < pages.length; i++) {
      const el = document.getElementById(`page-${i}`);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [pages.length]);

  const scrollToPage = useCallback((idx: number) => {
    const clamped = Math.max(0, Math.min(pagesRef.current.length - 1, idx));
    document.getElementById(`page-${clamped}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setCurrentPage(clamped);
  }, []);

  // ── Rotate page ────────────────────────────────────────────────────────────

  const handleRotate = useCallback((delta: 90 | -90) => {
    dispatch({ type: "rotate", pageIdx: currentPageRef.current, delta });
  }, []);

  // ── Image / signature placement ────────────────────────────────────────────

  const handlePlaceImageAt = useCallback((pageIdx: number, xPt: number, yPt: number) => {
    const placement = imgPlacement;
    if (!placement) return;
    const DEFAULT_WIDTH_PT = 150;
    const img: AddedImageItem = {
      id    : nanoid(),
      x     : xPt - DEFAULT_WIDTH_PT / 2,
      y     : yPt - (DEFAULT_WIDTH_PT / placement.aspectRatio) / 2,
      width : DEFAULT_WIDTH_PT,
      height: DEFAULT_WIDTH_PT / placement.aspectRatio,
      dataUrl: placement.dataUrl,
    };
    dispatch({ type: "addImage", pageIdx, img });
    setSelectedCells([{ kind: "image", pageIdx, id: img.id }]);
    setImgPlacement(null);
  }, [imgPlacement]);

  const handleInsertImageFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (!dataUrl) return;
      const img = new Image();
      img.onload = () => {
        setImgPlacement({ dataUrl, aspectRatio: img.naturalWidth / img.naturalHeight });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }, []);

  // ── File drag-drop ────────────────────────────────────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if ([...e.dataTransfer.types].includes("Files")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (file.type.startsWith("image/")) handleInsertImageFile(file);
  }, [handleInsertImageFile]);

  // ── Find matches ───────────────────────────────────────────────────────────

  const findMatches = useMemo(() => {
    if (!findQuery.trim()) return [];
    const q = findQuery.toLowerCase();
    const out: Array<{ pageIdx: number; wordIdx: number }> = [];
    for (let p = 0; p < pages.length; p++) {
      const words = pages[p]?.words ?? [];
      for (let w = 0; w < words.length; w++) {
        if (edits[p]?.[w]?.deleted) continue;
        const text = (edits[p]?.[w]?.text ?? words[w].text ?? "").toLowerCase();
        if (text.includes(q)) out.push({ pageIdx: p, wordIdx: w });
      }
    }
    return out;
  }, [findQuery, pages, edits]);

  const safeMatchIdx = findMatches.length > 0 ? Math.min(findMatchIdx, findMatches.length - 1) : 0;

  // Reset match index when query changes
  useEffect(() => { setFindMatchIdx(0); }, [findQuery]);

  // Auto-scroll to the page containing the current search match
  useEffect(() => {
    if (findMatches.length === 0 || !findOpen) return;
    const idx   = Math.min(findMatchIdx, findMatches.length - 1);
    const match = findMatches[idx];
    if (!match) return;
    const displayIdx = pageOrderRef.current.indexOf(match.pageIdx);
    if (displayIdx < 0) return;
    document.getElementById(`page-${displayIdx}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [findMatchIdx, findMatches, findOpen]);

  const findHighlightsByPage = useMemo(() => {
    const result: Record<number, Set<number>> = {};
    for (const m of findMatches) {
      if (!result[m.pageIdx]) result[m.pageIdx] = new Set();
      result[m.pageIdx].add(m.wordIdx);
    }
    return result;
  }, [findMatches]);

  // ── Active format ──────────────────────────────────────────────────────────

  const activeFormat = useMemo((): ActiveFormat | null => {
    const last = selectedCells[selectedCells.length - 1];
    if (!last) return null;
    if (last.kind === "word") {
      const { pageIdx, wordIdx } = last;
      const word = pages[pageIdx]?.words[wordIdx];
      if (!word) return null;
      const edit = edits[pageIdx]?.[wordIdx];
      return {
        color:         edit?.color         ?? word.color      ?? 0,
        fontFamily:    edit?.fontFamily    ?? word.font_family ?? "Arial, Helvetica, sans-serif",
        fontSize:      edit?.fontSize      ?? word.font_size   ?? 12,
        bold:          edit?.bold          ?? word.bold        ?? false,
        italic:        edit?.italic        ?? word.italic      ?? false,
        underline:     edit?.underline     ?? false,
        strikethrough: edit?.strikethrough ?? false,
        highlight:     edit?.highlight     ?? null,
        textAlign:     "left",
        rotation:      0,
        opacity:       edit?.opacity       ?? 1,
        isAddedWord:   false,
      };
    } else if (last.kind === "added") {
      const { pageIdx, id } = last;
      const item = (added[pageIdx] ?? []).find(w => w.id === id);
      if (!item) return null;
      return {
        color:         item.color,
        fontFamily:    item.fontFamily,
        fontSize:      item.fontSize,
        bold:          item.bold,
        italic:        item.italic,
        underline:     item.underline     ?? false,
        strikethrough: item.strikethrough ?? false,
        highlight:     null,
        textAlign:     item.textAlign     ?? "left",
        rotation:      item.rotation      ?? 0,
        lineHeight:    item.lineHeight    ?? 1.3,
        listType:      item.listType      ?? "none",
        opacity:       item.opacity       ?? 1,
        isAddedWord:   true,
      };
    } else {
      // image — no text format
      return null;
    }
  }, [selectedCells, pages, edits, added]);

  useEffect(() => { activeFormatRef.current = activeFormat; }, [activeFormat]);

  // Floating inline toolbar — recompute after selection changes (must be after activeFormat declaration)
  useLayoutEffect(() => {
    if (selectedCells.length === 0 || !activeFormat) { setFloatingBarPos(null); return; }
    const id = requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>("[data-inline-selected]");
      if (!el) { setFloatingBarPos(null); return; }
      const rect = el.getBoundingClientRect();
      setFloatingBarPos({ x: rect.left + rect.width / 2, y: Math.max(60, rect.top - 2) });
    });
    return () => cancelAnimationFrame(id);
  }, [selectedCells, activeFormat]);

  // Shape format bar — recompute position when selected shape changes
  useLayoutEffect(() => {
    if (!selectedShapeId) { setShapeBarPos(null); return; }
    const id = requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>("[data-shape-anchor]");
      if (!el) { setShapeBarPos(null); return; }
      const rect = el.getBoundingClientRect();
      setShapeBarPos({ x: rect.left, y: Math.max(60, rect.top - 2) });
    });
    return () => cancelAnimationFrame(id);
  }, [selectedShapeId, drawings]);

  // ── Selection maps (must be before early returns — Rules of Hooks) ─────────
  const { selWordsByPage, selAddedByPage, selImagesByPage } = useMemo(() => {
    const words  = new Map<number, Set<number>>();
    const addedM = new Map<number, Set<string>>();
    const images = new Map<number, Set<string>>();
    for (const cell of selectedCells) {
      if (cell.kind === "word") {
        if (!words.has(cell.pageIdx))  words.set(cell.pageIdx,  new Set());
        words.get(cell.pageIdx)!.add(cell.wordIdx);
      } else if (cell.kind === "added") {
        if (!addedM.has(cell.pageIdx))  addedM.set(cell.pageIdx,  new Set());
        addedM.get(cell.pageIdx)!.add(cell.id);
      } else {
        if (!images.has(cell.pageIdx)) images.set(cell.pageIdx, new Set());
        images.get(cell.pageIdx)!.add(cell.id);
      }
    }
    return { selWordsByPage: words, selAddedByPage: addedM, selImagesByPage: images };
  }, [selectedCells]);
  const deletedSet = useMemo(() => new Set(deletedPages), [deletedPages]);

  // ── Group helpers ──────────────────────────────────────────────────────────

  // Returns all cells that should be selected when `ref` is clicked (expands to group if applicable)
  const expandToGroup = useCallback((ref: CellRef): CellRef[] => {
    const group = groupsRef.current.find(g => g.members.some(m => cellRefsEqual(m, ref)));
    return group ? group.members : [ref];
  }, []);

  // ── Selection handlers ─────────────────────────────────────────────────────

  const handleSelect = useCallback((pageIdx: number, wordIdx: number, shiftKey: boolean) => {
    const ref: CellRef = { kind: "word", pageIdx, wordIdx };
    setSelectedCells((prev) => {
      if (shiftKey) {
        const exists = prev.some(c => cellRefsEqual(c, ref));
        return exists ? prev.filter(c => !cellRefsEqual(c, ref)) : [...prev, ref];
      }
      return expandToGroup(ref);
    });
  }, [expandToGroup]);

  const handleSelectAdded = useCallback((pageIdx: number, id: string, shiftKey: boolean) => {
    const ref: CellRef = { kind: "added", pageIdx, id };
    setSelectedCells((prev) => {
      if (shiftKey) {
        const exists = prev.some(c => cellRefsEqual(c, ref));
        return exists ? prev.filter(c => !cellRefsEqual(c, ref)) : [...prev, ref];
      }
      return expandToGroup(ref);
    });
  }, [expandToGroup]);

  const handleSelectImage = useCallback((pageIdx: number, id: string, shiftKey: boolean) => {
    const ref: CellRef = { kind: "image", pageIdx, id };
    setSelectedCells((prev) => {
      if (shiftKey) {
        const exists = prev.some(c => cellRefsEqual(c, ref));
        return exists ? prev.filter(c => !cellRefsEqual(c, ref)) : [...prev, ref];
      }
      return expandToGroup(ref);
    });
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedCells([]);
  }, []);

  // Unified ref selector — used by LayersPanel
  const handleSelectRef = useCallback((ref: CellRef, add: boolean) => {
    if (ref.kind === "word")  handleSelect(ref.pageIdx, ref.wordIdx, add);
    if (ref.kind === "added") handleSelectAdded(ref.pageIdx, ref.id, add);
    if (ref.kind === "image") handleSelectImage(ref.pageIdx, ref.id, add);
  }, [handleSelect, handleSelectAdded, handleSelectImage]);

  const handleSelectGroupById = useCallback((groupId: string) => {
    const group = groupsRef.current.find(g => g.id === groupId);
    if (group) setSelectedCells(group.members);
  }, []);

  // ── Format change ──────────────────────────────────────────────────────────

  const applyFormat = useCallback((patch: FormatPatch) => {
    const cells = selectedCellsRef.current;
    const pages = pagesRef.current;
    const edits = editsRef.current;
    const added = addedRef.current;

    const subActions: PrimitiveAction[] = [];
    for (const cell of cells) {
      if (cell.kind === "word") {
        const { pageIdx, wordIdx } = cell;
        const word = pages[pageIdx]?.words[wordIdx];
        if (!word) continue;
        const cur = edits[pageIdx]?.[wordIdx];
        subActions.push({
          type: "edit", pageIdx, wordIdx,
          wordEdit: {
            text:          cur?.text          ?? word.text,
            color:         patch.color         !== undefined ? patch.color         : (cur?.color      ?? word.color),
            fontFamily:    patch.fontFamily    !== undefined ? patch.fontFamily    : (cur?.fontFamily ?? word.font_family),
            fontSize:      patch.fontSize      !== undefined ? patch.fontSize      : (cur?.fontSize   ?? word.font_size),
            bold:          patch.bold          !== undefined ? patch.bold          : (cur?.bold       ?? word.bold),
            italic:        patch.italic        !== undefined ? patch.italic        : (cur?.italic     ?? word.italic),
            underline:     patch.underline     !== undefined ? patch.underline     : cur?.underline,
            strikethrough: patch.strikethrough !== undefined ? patch.strikethrough : cur?.strikethrough,
            highlight:     patch.highlight     !== undefined ? patch.highlight     : cur?.highlight,
            opacity:       patch.opacity       !== undefined ? patch.opacity       : cur?.opacity,
            dx:            cur?.dx,
            dy:            cur?.dy,
          },
        });
      } else if (cell.kind === "added") {
        const { pageIdx, id } = cell;
        const item = (added[pageIdx] ?? []).find(w => w.id === id);
        if (!item) continue;
        subActions.push({
          type: "editAdded", pageIdx, id,
          word: {
            ...item,
            color:         patch.color         !== undefined ? patch.color         : item.color,
            fontFamily:    patch.fontFamily    !== undefined ? patch.fontFamily    : item.fontFamily,
            fontSize:      patch.fontSize      !== undefined ? patch.fontSize      : item.fontSize,
            bold:          patch.bold          !== undefined ? patch.bold          : item.bold,
            italic:        patch.italic        !== undefined ? patch.italic        : item.italic,
            underline:     patch.underline     !== undefined ? patch.underline     : item.underline,
            strikethrough: patch.strikethrough !== undefined ? patch.strikethrough : item.strikethrough,
            textAlign:     patch.textAlign     !== undefined ? patch.textAlign     : item.textAlign,
            rotation:      patch.rotation      !== undefined ? patch.rotation      : item.rotation,
            lineHeight:    patch.lineHeight    !== undefined ? patch.lineHeight    : item.lineHeight,
            listType:      patch.listType      !== undefined ? patch.listType      : item.listType,
            opacity:       patch.opacity       !== undefined ? patch.opacity       : item.opacity,
          },
        });
      }
    }
    if (subActions.length === 0) return;
    dispatch({ type: "batch", label: buildFormatLabel(patch), iconType: "format", subActions });
  }, []);

  // ── Delete selected ────────────────────────────────────────────────────────

  const handleDeleteSelected = useCallback(() => {
    const cells = selectedCellsRef.current;
    const pages = pagesRef.current;
    const edits = editsRef.current;

    const subActions: PrimitiveAction[] = [];
    for (const cell of cells) {
      if (cell.kind === "word") {
        const { pageIdx, wordIdx } = cell;
        const word = pages[pageIdx]?.words[wordIdx];
        if (!word) continue;
        const cur = edits[pageIdx]?.[wordIdx];
        subActions.push({
          type: "edit", pageIdx, wordIdx,
          wordEdit: { text: cur?.text ?? word.text, color: cur?.color, fontFamily: cur?.fontFamily, fontSize: cur?.fontSize, bold: cur?.bold, italic: cur?.italic, underline: cur?.underline, strikethrough: cur?.strikethrough, dx: cur?.dx, dy: cur?.dy, deleted: true },
        });
      } else if (cell.kind === "added") {
        subActions.push({ type: "removeAdded", pageIdx: cell.pageIdx, id: cell.id });
      } else {
        subActions.push({ type: "removeImage", pageIdx: cell.pageIdx, id: cell.id });
      }
    }
    if (subActions.length === 1) {
      dispatch(subActions[0] as HistoryAction);
    } else if (subActions.length > 1) {
      dispatch({ type: "batch", label: `Deleted ${subActions.length} items`, iconType: "deleteText", subActions });
    }
    setSelectedCells([]);
  }, []);

  // ── Mode management ───────────────────────────────────────────────────────

  const clearAllModes = useCallback(() => {
    setAddTextMode(false);
    setDrawTool(null);
    setRedactMode(false);
    setNoteMode(false);
    setImgPlacement(null);
    setLinkMode(false);
    setBookmarkPlaceMode(false);
    setCropMode(false);
  }, []);

  const handleDrawToolChange = useCallback((tool: DrawTool | null) => {
    clearAllModes();
    setDrawTool(tool);
  }, [clearAllModes]);

  const handleRedactToggle = useCallback(() => {
    const next = !redactMode;
    clearAllModes();
    setRedactMode(next);
  }, [redactMode, clearAllModes]);

  const handleNoteToggle = useCallback(() => {
    const next = !noteMode;
    clearAllModes();
    setNoteMode(next);
  }, [noteMode, clearAllModes]);

  const handleAddBlankPage = useCallback((afterDisplayIdx: number) => {
    const newOrigIdx = pagesRef.current.length;
    const ref = pagesRef.current[0];
    const blankPage: ApiPage = {
      page_num : newOrigIdx,
      width    : ref?.width  ?? 595,
      height   : ref?.height ?? 842,
      image_url: "",
      words    : [],
    };
    setPages(prev => [...prev, blankPage]);
    const order = pageOrderRef.current;
    const newOrder = [...order];
    newOrder.splice(afterDisplayIdx + 1, 0, newOrigIdx);
    dispatch({ type: "setPageOrder", order: newOrder });
  }, []);

  const handleDuplicatePage = useCallback((afterDisplayIdx: number) => {
    const origIdx = pageOrderRef.current[afterDisplayIdx];
    if (origIdx === undefined) return;
    const srcPage = pagesRef.current[origIdx];
    if (!srcPage) return;

    const newOrigIdx = pagesRef.current.length;
    setPages(prev => [...prev, { ...srcPage, page_num: newOrigIdx }]);

    const subActions: PrimitiveAction[] = [];

    for (const [wordIdxStr, wordEdit] of Object.entries(editsRef.current[origIdx] ?? {})) {
      subActions.push({ type: "edit", pageIdx: newOrigIdx, wordIdx: Number(wordIdxStr), wordEdit });
    }
    for (const w of (addedRef.current[origIdx] ?? [])) {
      subActions.push({ type: "addWord", pageIdx: newOrigIdx, word: { ...w, id: nanoid() } });
    }
    for (const img of (addedImagesRef.current[origIdx] ?? [])) {
      subActions.push({ type: "addImage", pageIdx: newOrigIdx, img: { ...img, id: nanoid() } });
    }

    const newOrder = [...pageOrderRef.current];
    newOrder.splice(afterDisplayIdx + 1, 0, newOrigIdx);
    subActions.push({ type: "setPageOrder", order: newOrder });

    dispatch({ type: "batch", label: "Duplicate page", iconType: "text", subActions });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRedactWord = useCallback((pageIdx: number, wordIdx: number) => {
    const word = pagesRef.current[pageIdx]?.words[wordIdx];
    if (!word) return;
    const cur = editsRef.current[pageIdx]?.[wordIdx];
    const isRedacted = cur?.redacted ?? false;
    dispatch({
      type: "edit", pageIdx, wordIdx,
      wordEdit: { text: cur?.text ?? word.text, color: cur?.color, fontFamily: cur?.fontFamily, fontSize: cur?.fontSize, bold: cur?.bold, italic: cur?.italic, dx: cur?.dx, dy: cur?.dy, redacted: !isRedacted },
    });
  }, []);

  const handleAddNote = useCallback((pageIdx: number, xPt: number, yPt: number) => {
    const note: StickyNote = { id: nanoid(), x: xPt, y: yPt, text: "", color: "#fef08a" };
    dispatch({ type: "addNote", pageIdx, note });
  }, []);

  // ── Group / Ungroup ────────────────────────────────────────────────────────

  const handleBoxSelect = useCallback((pageIdx: number, refs: CellRef[]) => {
    // Expand any refs that belong to groups
    const result = new Map<string, CellRef>();
    for (const ref of refs) {
      const key = ref.kind === "word" ? `w-${ref.pageIdx}-${ref.wordIdx}` : `${ref.kind}-${ref.pageIdx}-${ref.id}`;
      result.set(key, ref);
      const group = groupsRef.current.find(g => g.members.some(m => cellRefsEqual(m, ref)));
      if (group) {
        for (const m of group.members) {
          const mk = m.kind === "word" ? `w-${m.pageIdx}-${m.wordIdx}` : `${m.kind}-${m.pageIdx}-${m.id}`;
          result.set(mk, m);
        }
      }
    }
    setSelectedCells(Array.from(result.values()));
  }, []);

  const handleGroup = useCallback(() => {
    const cells = selectedCellsRef.current;
    if (cells.length < 2) return;
    dispatch({ type: "createGroup", groupId: nanoid(), members: cells });
  }, []);

  const handleUngroup = useCallback(() => {
    const cells = selectedCellsRef.current;
    const group = groupsRef.current.find(g =>
      g.members.length === cells.length &&
      g.members.every(m => cells.some(c => cellRefsEqual(c, m)))
    );
    if (group) dispatch({ type: "dissolveGroup", groupId: group.id });
  }, []);

  const handleGroupDragEnd = useCallback((groupId: string, dx: number, dy: number) => {
    const group = groupsRef.current.find(g => g.id === groupId);
    if (!group) return;
    const subActions: PrimitiveAction[] = [];
    for (const member of group.members) {
      if (member.kind === "word") {
        const word = pagesRef.current[member.pageIdx]?.words[member.wordIdx];
        if (!word) continue;
        const cur = editsRef.current[member.pageIdx]?.[member.wordIdx];
        subActions.push({ type: "edit", pageIdx: member.pageIdx, wordIdx: member.wordIdx,
          wordEdit: { text: cur?.text ?? word.text, color: cur?.color, fontFamily: cur?.fontFamily, fontSize: cur?.fontSize, bold: cur?.bold, italic: cur?.italic, deleted: cur?.deleted, dx: (cur?.dx ?? 0) + dx, dy: (cur?.dy ?? 0) + dy } });
      } else if (member.kind === "added") {
        const item = (addedRef.current[member.pageIdx] ?? []).find(w => w.id === member.id);
        if (!item) continue;
        subActions.push({ type: "editAdded", pageIdx: member.pageIdx, id: member.id, word: { ...item, dx: (item.dx ?? 0) + dx, dy: (item.dy ?? 0) + dy } });
      } else if (member.kind === "image") {
        const img = (addedImagesRef.current[member.pageIdx] ?? []).find(i => i.id === member.id);
        if (!img) continue;
        subActions.push({ type: "editImage", pageIdx: member.pageIdx, id: member.id, img: { ...img, dx: (img.dx ?? 0) + dx, dy: (img.dy ?? 0) + dy } });
      }
    }
    if (subActions.length > 0) dispatch({ type: "batch", label: "Move group", iconType: "text", subActions });
  }, []);

  // ── Links ─────────────────────────────────────────────────────────────────

  const handleLinkCreate = useCallback((pageIdx: number, x: number, y: number, w: number, h: number) => {
    setLinkEditState({ mode: "create", pageIdx, x, y, w, h });
  }, []);

  const handleLinkClick = useCallback((pageIdx: number, id: string) => {
    const link = (links[pageIdx] ?? []).find(l => l.id === id);
    if (!link) return;
    setLinkEditState({ mode: "edit", pageIdx, id, x: link.x, y: link.y, w: link.w, h: link.h });
  }, [links]);

  const handleLinkConfirm = useCallback((data: Omit<LinkAnnotation, "id">) => {
    if (!linkEditState) return;
    if (linkEditState.mode === "create") {
      const link: LinkAnnotation = { id: nanoid(), ...data, x: linkEditState.x, y: linkEditState.y, w: linkEditState.w, h: linkEditState.h };
      dispatch({ type: "addLink", pageIdx: linkEditState.pageIdx, link });
    } else if (linkEditState.id) {
      const link: LinkAnnotation = { id: linkEditState.id, ...data, x: linkEditState.x, y: linkEditState.y, w: linkEditState.w, h: linkEditState.h };
      dispatch({ type: "editLink", pageIdx: linkEditState.pageIdx, id: linkEditState.id, link });
    }
    setLinkEditState(null);
  }, [linkEditState]);

  const handleLinkDelete = useCallback(() => {
    if (!linkEditState?.id) return;
    dispatch({ type: "removeLink", pageIdx: linkEditState.pageIdx, id: linkEditState.id });
    setLinkEditState(null);
  }, [linkEditState]);

  // ── Bookmarks ──────────────────────────────────────────────────────────────

  // Navigate to bookmark: convert original pageIdx → display index, then scroll to Y if anchored
  const scrollToBookmark = useCallback((bm: BookmarkEntry) => {
    const order = pageOrderRef.current;
    const displayIdx = order.indexOf(bm.pageIdx);
    if (displayIdx < 0) return;
    const pageEl = document.getElementById(`page-${displayIdx}`);
    if (!pageEl) return;
    setCurrentPage(displayIdx);

    const mainEl = mainScrollRef.current;
    if (!mainEl) return;

    if (bm.y !== undefined) {
      const page = pagesRef.current[bm.pageIdx];
      if (!page) return;
      const baseW = Math.min(900, typeof window !== "undefined" ? window.innerWidth - 64 : 900);
      const scale = (baseW * zoomRef.current) / page.width;
      const pageRect = pageEl.getBoundingClientRect();
      const mainRect = mainEl.getBoundingClientRect();
      const pageTopInScroll = pageRect.top - mainRect.top + mainEl.scrollTop;
      mainEl.scrollTo({ top: Math.max(0, pageTopInScroll + bm.y * scale - mainEl.clientHeight / 3), behavior: "smooth" });
    } else {
      pageEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const handleBookmarkAdd = useCallback((title: string, pageIdx: number, level: number) => {
    setBookmarks(prev => [...prev, { id: nanoid(), title, pageIdx, level }]);
  }, []);

  const handlePlaceBookmark = useCallback((pageIdx: number, xPt: number, yPt: number) => {
    setBookmarkPlaceMode(false);
    const title = `Anchor — page ${pageIdx + 1}`;
    setBookmarks(prev => [...prev, { id: nanoid(), title, pageIdx, level: 0, x: xPt, y: yPt }]);
  }, []);

  const handleBookmarkRename = useCallback((id: string, title: string) => {
    setBookmarks(prev => prev.map(b => b.id === id ? { ...b, title } : b));
  }, []);

  const handleBookmarkDelete = useCallback((id: string) => {
    setBookmarks(prev => prev.filter(b => b.id !== id));
  }, []);

  const handleBookmarkIndent = useCallback((id: string, delta: 1 | -1) => {
    setBookmarks(prev => prev.map(b => b.id === id ? { ...b, level: Math.max(0, Math.min(3, b.level + delta)) } : b));
  }, []);

  const handleBookmarkMoveUp = useCallback((id: string) => {
    setBookmarks(prev => {
      const idx = prev.findIndex(b => b.id === id);
      if (idx <= 0) return prev;
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }, []);

  const handleBookmarkMoveDown = useCallback((id: string) => {
    setBookmarks(prev => {
      const idx = prev.findIndex(b => b.id === id);
      if (idx < 0 || idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  }, []);

  // ── Add word ───────────────────────────────────────────────────────────────

  const handleAddWord = useCallback((pageIdx: number, xPt: number, yPt: number) => {
    const fmt = activeFormatRef.current;
    const word: AddedWordItem = {
      id:         nanoid(),
      x:          xPt,
      y:          yPt,
      text:       "",
      fontSize:   fmt?.fontSize   ?? 12,
      fontFamily: fmt?.fontFamily ?? "Arial, Helvetica, sans-serif",
      bold:       fmt?.bold       ?? false,
      italic:     fmt?.italic     ?? false,
      color:      fmt?.color      ?? 0,
    };
    dispatch({ type: "addWord", pageIdx, word });
    setSelectedCells([{ kind: "added", pageIdx, id: word.id }]);
    setAddTextMode(false);
  }, []);

  // ── Find & Replace ─────────────────────────────────────────────────────────

  const handleReplace = useCallback(() => {
    if (findMatches.length === 0) return;
    const { pageIdx, wordIdx } = findMatches[safeMatchIdx];
    const word = pagesRef.current[pageIdx]?.words[wordIdx];
    if (!word) return;
    const cur     = editsRef.current[pageIdx]?.[wordIdx];
    const curText = cur?.text ?? word.text;
    const newText = curText.replace(new RegExp(escapeRegex(findQuery), "gi"), replaceQuery);
    dispatch({
      type: "edit", pageIdx, wordIdx,
      wordEdit: { text: newText, color: cur?.color, fontFamily: cur?.fontFamily, fontSize: cur?.fontSize, bold: cur?.bold, italic: cur?.italic, dx: cur?.dx, dy: cur?.dy },
    });
    setFindMatchIdx(i => (findMatches.length > 1 ? Math.min(i + 1, findMatches.length - 2) : 0));
  }, [findMatches, safeMatchIdx, findQuery, replaceQuery]);

  const handleReplaceAll = useCallback(() => {
    if (findMatches.length === 0) return;
    for (const { pageIdx, wordIdx } of findMatches) {
      const word = pagesRef.current[pageIdx]?.words[wordIdx];
      if (!word) continue;
      const cur     = editsRef.current[pageIdx]?.[wordIdx];
      const curText = cur?.text ?? word.text;
      const newText = curText.replace(new RegExp(escapeRegex(findQuery), "gi"), replaceQuery);
      dispatch({
        type: "edit", pageIdx, wordIdx,
        wordEdit: { text: newText, color: cur?.color, fontFamily: cur?.fontFamily, fontSize: cur?.fontSize, bold: cur?.bold, italic: cur?.italic, dx: cur?.dx, dy: cur?.dy },
      });
    }
    setFindMatchIdx(0);
  }, [findMatches, findQuery, replaceQuery]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const activeEl = document.activeElement as HTMLElement | null;
      const tag = activeEl?.tagName ?? "";
      // A text-type input where text can be selected (not color/range/checkbox)
      const inTextInput = tag === "INPUT" &&
        ["text", "number", "search", "email", "url"].includes((activeEl as HTMLInputElement).type ?? "text");
      const inTextarea  = tag === "TEXTAREA";
      // Context where native text editing should take priority over element shortcuts
      const inEditCtx   = inTextInput || inTextarea;
      // True only when the user has text highlighted in the focused element
      const hasTextSel  = inEditCtx && (() => {
        const el = activeEl as HTMLInputElement | HTMLTextAreaElement;
        return (el.selectionStart ?? 0) !== (el.selectionEnd ?? 0);
      })();

      if (ctrl && e.key === "z" && !e.shiftKey) { e.preventDefault(); dispatch({ type: "undo" }); }
      if (ctrl && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); dispatch({ type: "redo" }); }
      if (ctrl && (e.key === "=" || e.key === "+")) { e.preventDefault(); setZoom(z => Math.min(4, z * 1.15)); }
      if (ctrl && e.key === "-") { e.preventDefault(); setZoom(z => Math.max(0.25, z / 1.15)); }
      if (ctrl && e.key === "0") { e.preventDefault(); setZoom(1); }
      if (ctrl && e.key === "h" && !e.shiftKey && !inEditCtx) { e.preventDefault(); setFindOpen(o => !o); }
      if (ctrl && e.shiftKey && e.key === "H") { e.preventDefault(); setHistoryOpen(o => !o); }
      if (ctrl && e.key === "g" && !e.shiftKey && !inEditCtx) { e.preventDefault(); handleGroup(); }
      if (ctrl && e.shiftKey && e.key === "G" && !inEditCtx) { e.preventDefault(); handleUngroup(); }
      if (ctrl && e.key === "k" && !inEditCtx) { e.preventDefault(); clearAllModes(); setLinkMode(m => !m); }
      if (e.key === "Escape") { clearAllModes(); setFindOpen(false); setSelectedCells([]); setSelectedShapeId(null); }

      // Ctrl+A — select all added elements (blocked when actively editing text)
      if (ctrl && e.key === "a" && !inEditCtx) {
        e.preventDefault();
        const allCells: CellRef[] = [];
        for (const origIdx of pageOrderRef.current) {
          for (const item of (addedRef.current[origIdx] ?? []))
            allCells.push({ kind: "added", pageIdx: origIdx, id: item.id });
          for (const img of (addedImagesRef.current[origIdx] ?? []))
            allCells.push({ kind: "image", pageIdx: origIdx, id: img.id });
        }
        setSelectedCells(allCells);
      }

      // Ctrl+C — copy selected elements (added words, images, or original PDF words).
      // Not blocked by SELECT/color/range focus — only blocked when text is highlighted in an input.
      if (ctrl && e.key === "c" && !hasTextSel && selectedCellsRef.current.length > 0) {
        e.preventDefault();
        const copied: typeof clipboardRef.current = [];
        for (const cell of selectedCellsRef.current) {
          if (cell.kind === "added") {
            const item = (addedRef.current[cell.pageIdx] ?? []).find(w => w.id === cell.id);
            if (item) copied.push({ added: item, pageIdx: cell.pageIdx });
          } else if (cell.kind === "image") {
            const img = (addedImagesRef.current[cell.pageIdx] ?? []).find(i => i.id === cell.id);
            if (img) copied.push({ image: img, pageIdx: cell.pageIdx });
          } else if (cell.kind === "word") {
            // Convert original PDF word to an AddedWordItem so it can be pasted/moved freely
            const page = pagesRef.current[cell.pageIdx];
            const word = page?.words[cell.wordIdx];
            if (!word) continue;
            const edit = editsRef.current[cell.pageIdx]?.[cell.wordIdx];
            const asAdded: AddedWordItem = {
              id        : nanoid(),
              x         : word.box[0] + (edit?.dx ?? 0),
              y         : (word.baseline_y ?? word.box[3]) + (edit?.dy ?? 0),
              text      : edit?.text ?? word.text,
              fontSize  : edit?.fontSize ?? word.font_size,
              fontFamily: edit?.fontFamily ?? word.font_family ?? "Arial, sans-serif",
              bold      : edit?.bold      ?? word.bold      ?? false,
              italic    : edit?.italic    ?? word.italic    ?? false,
              underline : edit?.underline ?? false,
              strikethrough: edit?.strikethrough ?? false,
              color     : edit?.color ?? word.color ?? 0,
            };
            copied.push({ added: asAdded, pageIdx: cell.pageIdx });
          }
        }
        clipboardRef.current = copied;
      }

      // Ctrl+V — paste elements (only blocked when actively typing in a text editor)
      if (ctrl && e.key === "v" && !inEditCtx) {
        const items = clipboardRef.current;
        if (items.length === 0) return;
        e.preventDefault();
        const targetPage = pageOrderRef.current[currentPageRef.current] ?? 0;
        const subActions: PrimitiveAction[] = [];
        for (const entry of items) {
          if (entry.added)
            subActions.push({ type: "addWord", pageIdx: targetPage, word: { ...entry.added, id: nanoid(), x: entry.added.x + 15, y: entry.added.y + 15 } });
          else if (entry.image)
            subActions.push({ type: "addImage", pageIdx: targetPage, img: { ...entry.image, id: nanoid(), x: (entry.image.x ?? 0) + 15, y: (entry.image.y ?? 0) + 15 } });
        }
        if (subActions.length > 0) dispatch({ type: "batch", label: "Paste", iconType: "addText", subActions });
      }

      if ((e.key === "Delete" || e.key === "Backspace") && selectedShapeIdRef.current && !inEditCtx) {
        e.preventDefault();
        dispatch({ type: "removeShape", pageIdx: selectedShapeIdRef.current.pageIdx, id: selectedShapeIdRef.current.id });
        setSelectedShapeId(null);
        return;
      }

      if ((e.key === "Delete" || e.key === "Backspace") && selectedCellsRef.current.length > 0 && !inEditCtx) {
        e.preventDefault();
        handleDeleteSelected();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleDeleteSelected]);

  // ── Upload on mount ────────────────────────────────────────────────────────

  useEffect(() => {
    const file = getPdf();
    const name = sessionStorage.getItem("pdf_name") ?? "document.pdf";
    if (!file) { router.replace("/"); return; }
    pdfFileRef.current = file;
    pdfNameRef.current = name;

    const run = async () => {
      try {
        setStatus("uploading");
        const upload = await uploadPdf(file);
        fileHashRef.current = upload.file_hash;
        if (upload.status === "done" && upload.pages) {
          setPages(upload.pages); setStatus("done");
          fetchOutline(upload.file_hash).then(bms => { if (bms.length > 0) setBookmarks(bms); });
          return;
        }
        setStatus("processing");
        const result = await waitForJob(upload.job_id!, (pct) => setProgress(pct));
        setPages(result);
        setStatus("done");
        fetchOutline(upload.file_hash).then(bms => { if (bms.length > 0) setBookmarks(bms); });
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : String(e));
        setStatus("error");
      }
    };
    run();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Export ─────────────────────────────────────────────────────────────────

  const performDownload = useCallback(async (opts: ExportOptions) => {
    if (!fileHashRef.current || pages.length === 0) return;
    setDownloading(true);
    try {
      const drawnShapesList = Object.entries(drawings).flatMap(([p, shapes]) => shapes.map(s => ({ ...s, pageIdx: Number(p) })));
      const stickyNotesList = Object.entries(stickyNotes).flatMap(([p, notes]) => notes.map(n => ({ ...n, pageIdx: Number(p) })));
      // Read from refs so we always export the latest links and bookmarks regardless of closure staleness
      const linksList = Object.entries(linksRef.current).flatMap(([p, ls]) => ls.map(l => ({ ...l, pageIdx: Number(p) })));
      console.log("[DIAG export] bookmarks sending:", JSON.stringify(bookmarksRef.current), "links:", linksList.length);
      const bytes = await exportPdfWithEdits(
        fileHashRef.current, edits, added, rotations, addedImages, deletedPages,
        drawnShapesList, stickyNotesList, formValues,
        pageOrder, watermark, opts, linksList, bookmarksRef.current,
      );
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = pdfNameRef.current.replace(/\.pdf$/i, "") + "_edited.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Export failed: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setDownloading(false);
    }
  }, [pages, edits, added, rotations, addedImages, deletedPages, pageOrder, watermark]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDownload = useCallback(() => {
    if (!fileHashRef.current || pages.length === 0) return;
    setExportOptsOpen(true);
  }, [pages]);

  // ── Loading / error screens ────────────────────────────────────────────────

  if (status === "idle" || status === "uploading" || status === "processing") {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <Loader2 className="w-10 h-10 animate-spin text-violet-500" />
          <p className="text-sm font-medium">
            {status === "uploading" ? "Uploading…" : `Analysing document${progress ? ` (${progress}%)` : "…"}`}
          </p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center space-y-4">
          <p className="text-destructive font-semibold">Processing failed</p>
          <p className="text-sm text-muted-foreground">{errorMsg}</p>
          <Button onClick={() => router.replace("/")} variant="outline">
            <ChevronLeft className="w-4 h-4 mr-1" /> Back
          </Button>
        </div>
      </div>
    );
  }

  const baseWidth    = typeof window !== "undefined" ? Math.min(900, window.innerWidth - 64) : 900;
  const displayWidth = baseWidth * zoom;
  const rulerScale   = pages.length > 0 ? displayWidth / pages[0].width : 1;


  // Group button states
  const selectedGroup = groups.find(g =>
    g.members.length === selectedCells.length &&
    g.members.every(m => selectedCells.some(c => cellRefsEqual(c, m)))
  );
  const canGroup   = selectedCells.length >= 2 && !selectedGroup;
  const canUngroup = !!selectedGroup;

  // ── Editor ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border/50 px-4 py-2 shrink-0 gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon" onClick={() => router.replace("/")}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <FileText className="w-4 h-4 text-violet-600 shrink-0" />
          <span className="text-sm font-medium truncate max-w-[220px]">{pdfNameRef.current}</span>
        </div>
        <Button
          size="sm"
          className="bg-gradient-to-r from-violet-600 to-blue-500 text-white border-0 hover:opacity-90 shrink-0"
          onClick={handleDownload}
          disabled={downloading}
        >
          {downloading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Download className="w-4 h-4 mr-1" />}
          Download PDF
        </Button>
      </header>

      {/* Toolbar */}
      <Toolbar
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={() => dispatch({ type: "undo" })}
        onRedo={() => dispatch({ type: "redo" })}
        zoom={zoom}
        onZoomChange={setZoom}
        activeFormat={activeFormat}
        onFormatChange={applyFormat}
        addTextMode={addTextMode}
        onAddTextToggle={() => { clearAllModes(); setAddTextMode(m => !m); }}
        hasSelection={selectedCells.length > 0}
        onDeleteSelected={handleDeleteSelected}
        onFindToggle={() => setFindOpen(o => !o)}
        sidebarOpen={sidebarOpen}
        onSidebarToggle={() => setSidebarOpen(o => !o)}
        onRotateLeft={() => handleRotate(-90)}
        onRotateRight={() => handleRotate(90)}
        onSignature={() => setSigDialogOpen(true)}
        onInsertImage={() => imageFileInputRef.current?.click()}
        historyOpen={historyOpen}
        onHistoryToggle={() => setHistoryOpen(o => !o)}
        showEditIndicators={showEditIndicators}
        onToggleEditIndicators={() => setShowEditIndicators(o => !o)}
        drawTool={drawTool}
        onDrawToolChange={handleDrawToolChange}
        drawColor={drawColor}
        onDrawColorChange={setDrawColor}
        drawWidth={drawWidth}
        onDrawWidthChange={setDrawWidth}
        drawFill={drawFill}
        onDrawFillChange={setDrawFill}
        drawOpacity={drawOpacity}
        onDrawOpacityChange={setDrawOpacity}
        redactMode={redactMode}
        onRedactToggle={handleRedactToggle}
        noteMode={noteMode}
        onNoteToggle={handleNoteToggle}
        hasWatermark={watermark !== null}
        onWatermarkToggle={() => setWatermarkOpen(true)}
        cropMode={cropMode}
        onCropToggle={() => { const next = !cropMode; clearAllModes(); setCropMode(next); }}
        hasPageNumbers={pageNumberConfig !== null}
        onPageNumbers={() => setPageNumbersOpen(true)}
        canGroup={canGroup}
        canUngroup={canUngroup}
        onGroup={handleGroup}
        onUngroup={handleUngroup}
        layersOpen={layersOpen}
        onLayersToggle={() => setLayersOpen(o => !o)}
        linkMode={linkMode}
        onLinkToggle={() => { clearAllModes(); setLinkMode(m => !m); }}
        bookmarksOpen={bookmarksOpen}
        onBookmarksToggle={() => setBookmarksOpen(o => !o)}
        darkMode={darkMode}
        onDarkModeToggle={() => setDarkMode(d => !d)}
        pageFilter={pageFilter}
        onPageFilterChange={setPageFilter}
      />

      {/* Middle: sidebar + ruler area + scroll area */}
      <div className="flex flex-1 overflow-hidden">
        {sidebarOpen && pages.length > 0 && (
          <PageThumbnailSidebar
            pages={pages}
            pageOrder={pageOrder}
            currentPage={currentPage}
            rotations={rotations}
            deletedPages={deletedPages}
            onPageClick={scrollToPage}
            onDeletePage={(origIdx) => dispatch({ type: "deletePage",  pageIdx: origIdx })}
            onRestorePage={(origIdx) => dispatch({ type: "restorePage", pageIdx: origIdx })}
            onReorder={(order) => dispatch({ type: "setPageOrder", order })}
            onAddBlankPage={handleAddBlankPage}
            onDuplicatePage={handleDuplicatePage}
          />
        )}

        {/* Rulers + pages */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* H ruler row */}
          <div className="flex shrink-0" style={{ height: RULER_SIZE }}>
            <div style={{ width: RULER_SIZE, height: RULER_SIZE, background: "#252525", borderRight: "1px solid #444", borderBottom: "1px solid #444", flexShrink: 0 }} />
            <div style={{ flex: 1, overflow: "hidden", height: RULER_SIZE }}>
              <Ruler orientation="h" totalPts={2000} scale={rulerScale} cursorPt={rulerCursor?.x} onMouseDown={() => startGuideDrag("h")} />
            </div>
          </div>

          {/* V ruler + scroll area */}
          <div className="flex flex-1 overflow-hidden">
            <div style={{ width: RULER_SIZE, flexShrink: 0, overflow: "hidden" }}>
              <Ruler orientation="v" totalPts={5000} scale={rulerScale} cursorPt={rulerCursor?.y} onMouseDown={() => startGuideDrag("v")} />
            </div>

        {/* Pages */}
        <main
          ref={mainScrollRef as React.RefObject<HTMLDivElement>}
          className="flex-1 overflow-auto bg-zinc-200 dark:bg-zinc-800 relative"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onMouseMove={(e) => {
            if (rulerRafRef.current) return;
            const cx = e.clientX, cy = e.clientY;
            const rect = e.currentTarget.getBoundingClientRect();
            rulerRafRef.current = requestAnimationFrame(() => {
              rulerRafRef.current = 0;
              setRulerCursor({ x: (cx - rect.left) / rulerScale, y: (cy - rect.top) / rulerScale });
            });
          }}
          onMouseLeave={() => setRulerCursor(undefined)}
          onClick={() => setGuideMenu(null)}
        >
          {/* Guide lines */}
          {guides.map(g => (
            <div
              key={g.id}
              onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setGuideMenu({ id: g.id, x: e.clientX, y: e.clientY }); }}
              style={{
                position    : "absolute",
                background  : "#3b82f6",
                opacity     : 0.65,
                zIndex      : 50,
                pointerEvents: "auto",
                cursor      : g.orientation === "h" ? "ns-resize" : "ew-resize",
                ...(g.orientation === "h"
                  ? { top: g.scrollPx - 0.5, left: 0, right: 0, height: 2 }
                  : { left: g.scrollPx - 0.5, top: 0, bottom: 0, width: 2 }),
              }}
            />
          ))}
          <div className="flex flex-col items-center gap-8 py-8 px-4">
            {(() => {
              const visiblePageOrder = pageOrder.filter(i => !deletedSet.has(i));
              return pageOrder.map((origIdx, displayIdx) => {
                const page = pages[origIdx];
                if (!page || deletedSet.has(origIdx)) return null;
                const visibleDisplayIdx = visiblePageOrder.indexOf(origIdx);
              const inWindow = displayIdx >= visibleRange[0] && displayIdx <= visibleRange[1];
              const placeholderH = Math.round(page.height * displayWidth / page.width);
              if (!inWindow) {
                return (
                  <div key={origIdx} id={`page-${displayIdx}`} data-page-idx={displayIdx}
                    style={{ width: displayWidth, height: placeholderH, background: "#fff", borderRadius: 2 }} />
                );
              }
              return (
                <div key={origIdx} id={`page-${displayIdx}`} data-page-idx={displayIdx}>
                  <PageOverlay
                    page={page}
                    displayWidth={displayWidth}
                    edits={edits[origIdx] ?? {}}
                    addedWords={added[origIdx] ?? []}
                    onEdit={(wordIdx, wordEdit) => dispatch({ type: "edit", pageIdx: origIdx, wordIdx, wordEdit })}
                    onSelect={(wordIdx, shiftKey) => handleSelect(origIdx, wordIdx, shiftKey)}
                    onClearSelection={handleClearSelection}
                    onAddWord={(xPt, yPt) => handleAddWord(origIdx, xPt, yPt)}
                    onEditAdded={(id, word) => dispatch({ type: "editAdded", pageIdx: origIdx, id, word })}
                    onSelectAdded={(id, shiftKey) => handleSelectAdded(origIdx, id, shiftKey)}
                    onRemoveAdded={(id) => dispatch({ type: "removeAdded", pageIdx: origIdx, id })}
                    selectedWordIdxs={selWordsByPage.get(origIdx) ?? new Set()}
                    selectedAddedIds={selAddedByPage.get(origIdx) ?? new Set()}
                    addTextMode={addTextMode}
                    findHighlights={findHighlightsByPage[origIdx] ?? new Set()}
                    findCurrentHighlight={
                      findMatches[safeMatchIdx]?.pageIdx === origIdx
                        ? findMatches[safeMatchIdx].wordIdx
                        : null
                    }
                    rotation={rotations[origIdx] ?? 0}
                    addedImages={addedImages[origIdx] ?? []}
                    onEditImage={(id, img) => dispatch({ type: "editImage", pageIdx: origIdx, id, img })}
                    onSelectImage={(id, shiftKey) => handleSelectImage(origIdx, id, shiftKey)}
                    onRemoveImage={(id) => dispatch({ type: "removeImage", pageIdx: origIdx, id })}
                    selectedImageIds={selImagesByPage.get(origIdx) ?? new Set()}
                    onPlaceImage={imgPlacement ? (xPt, yPt) => handlePlaceImageAt(origIdx, xPt, yPt) : undefined}
                    showEditIndicators={showEditIndicators}
                    drawings={drawings[origIdx] ?? []}
                    onAddShape={(shape) => {
                      dispatch({ type: "addShape", pageIdx: origIdx, shape });
                      setDrawTool(null);
                      setSelectedShapeId({ pageIdx: origIdx, id: shape.id });
                    }}
                    drawTool={drawTool}
                    drawColor={drawColor}
                    drawWidth={drawWidth}
                    drawFill={drawFill}
                    drawOpacity={drawOpacity}
                    selectedShapeId={selectedShapeId?.pageIdx === origIdx ? selectedShapeId.id : null}
                    onSelectShape={(id) => setSelectedShapeId(id ? { pageIdx: origIdx, id } : null)}
                    onEditShape={(shape) => dispatch({ type: "editShape", pageIdx: origIdx, id: shape.id, shape })}
                    onDeleteShape={(id) => { dispatch({ type: "removeShape", pageIdx: origIdx, id }); setSelectedShapeId(null); }}
                    stickyNotes={stickyNotes[origIdx] ?? []}
                    onAddNote={(xPt, yPt) => handleAddNote(origIdx, xPt, yPt)}
                    onEditNote={(id, note) => dispatch({ type: "editNote", pageIdx: origIdx, id, note })}
                    onRemoveNote={(id) => dispatch({ type: "removeNote", pageIdx: origIdx, id })}
                    noteMode={noteMode}
                    formFields={page.fields ?? []}
                    formValues={formValues[origIdx] ?? {}}
                    onFormValue={(fieldId, value) => dispatch({ type: "setFormValue", pageIdx: origIdx, fieldId, value })}
                    redactMode={redactMode}
                    onRedact={(wordIdx) => handleRedactWord(origIdx, wordIdx)}
                    groups={groups}
                    onGroupDragEnd={handleGroupDragEnd}
                    pageIdx={origIdx}
                    onBoxSelect={(refs) => handleBoxSelect(origIdx, refs)}
                    links={links[origIdx] ?? []}
                    linkMode={linkMode}
                    onLinkCreate={(x, y, w, h) => handleLinkCreate(origIdx, x, y, w, h)}
                    onLinkClick={(id) => handleLinkClick(origIdx, id)}
                    onPageJump={scrollToPage}
                    bookmarkAnchors={bookmarks
                      .filter(b => b.pageIdx === origIdx && b.y !== undefined)
                      .map(b => ({ id: b.id, title: b.title, y: b.y! }))}
                    bookmarkPlaceMode={bookmarkPlaceMode}
                    onPlaceBookmark={(xPt, yPt) => handlePlaceBookmark(origIdx, xPt, yPt)}
                    pageFilter={pageFilter}
                    watermark={watermark}
                    redactionZones={redactionZones[origIdx] ?? []}
                    onAddRedactionZone={(zone) => dispatch({ type: "addRedactionZone", pageIdx: origIdx, zone })}
                    onRemoveRedactionZone={(id) => dispatch({ type: "removeRedactionZone", pageIdx: origIdx, id })}
                    cropBox={cropBoxes[origIdx] ?? null}
                    cropMode={cropMode}
                    onSetCropBox={(box) => dispatch({ type: "setCropBox", pageIdx: origIdx, box })}
                    pageNumberConfig={pageNumberConfig}
                    displayPageIndex={visibleDisplayIdx}
                    totalPageCount={visiblePageOrder.length}
                  />
                </div>
              );
              });
            })()}
          </div>
        </main>
          </div>{/* V ruler + scroll area row */}
        </div>{/* Rulers + pages column */}

        {/* Bookmarks panel — right side */}
        {bookmarksOpen && pages.length > 0 && (
          <BookmarksPanel
            bookmarks={bookmarks}
            currentOrigPageIdx={pageOrder[currentPage] ?? 0}
            pageCount={pages.length}
            onNavigate={scrollToBookmark}
            onAdd={handleBookmarkAdd}
            onStartPlace={() => { clearAllModes(); setBookmarkPlaceMode(true); }}
            onRename={handleBookmarkRename}
            onDelete={handleBookmarkDelete}
            onIndent={handleBookmarkIndent}
            onMoveUp={handleBookmarkMoveUp}
            onMoveDown={handleBookmarkMoveDown}
            onClose={() => setBookmarksOpen(false)}
            bookmarkPlaceMode={bookmarkPlaceMode}
          />
        )}

        {/* Layers panel — right side */}
        {layersOpen && pages.length > 0 && (
          <LayersPanel
            page={pages[pageOrder[currentPage]] ?? null}
            pageIdx={pageOrder[currentPage] ?? 0}
            edits={edits[pageOrder[currentPage]] ?? {}}
            addedWords={added[pageOrder[currentPage]] ?? []}
            addedImages={addedImages[pageOrder[currentPage]] ?? []}
            drawings={drawings[pageOrder[currentPage]] ?? []}
            stickyNotes={stickyNotes[pageOrder[currentPage]] ?? []}
            groups={groups}
            selectedCells={selectedCells}
            onSelectRef={handleSelectRef}
            onSelectGroup={handleSelectGroupById}
            onClose={() => setLayersOpen(false)}
          />
        )}

        {/* History panel — right side */}
        {historyOpen && (
          <HistoryPanel
            meta={historyMeta}
            currentIndex={index}
            onJumpTo={(i) => dispatch({ type: "jumpTo", targetIndex: i })}
            onDelete={(i) => dispatch({ type: "deleteEntry", entryIndex: i })}
            onClose={() => setHistoryOpen(false)}
          />
        )}
      </div>

      {/* Page navigation pill */}
      {pages.length > 1 && (
        <div
          style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", zIndex: 150 }}
          className="flex items-center gap-1 bg-background border border-border/60 shadow-xl rounded-full px-2 py-1 select-none"
        >
          <Button
            variant="ghost" size="icon"
            className="h-7 w-7 rounded-full"
            disabled={currentPage === 0}
            onClick={() => scrollToPage(currentPage - 1)}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>
          <input
            className="w-8 text-center text-xs bg-transparent border-none outline-none tabular-nums"
            value={currentPage + 1}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10) - 1;
              if (!isNaN(n)) scrollToPage(n);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const n = parseInt((e.target as HTMLInputElement).value, 10) - 1;
                if (!isNaN(n)) scrollToPage(n);
              }
            }}
          />
          <span className="text-xs text-muted-foreground pr-1">/ {pages.length}</span>
          <Button
            variant="ghost" size="icon"
            className="h-7 w-7 rounded-full"
            disabled={currentPage === pages.length - 1}
            onClick={() => scrollToPage(currentPage + 1)}
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      {/* Find & Replace panel */}
      {findOpen && (
        <FindReplace
          findQuery={findQuery}
          replaceQuery={replaceQuery}
          matchCount={findMatches.length}
          currentIdx={safeMatchIdx}
          onFindChange={setFindQuery}
          onReplaceChange={setReplaceQuery}
          onPrev={() => setFindMatchIdx(i => (i > 0 ? i - 1 : Math.max(0, findMatches.length - 1)))}
          onNext={() => setFindMatchIdx(i => (findMatches.length > 0 ? (i + 1) % findMatches.length : 0))}
          onReplace={handleReplace}
          onReplaceAll={handleReplaceAll}
          onClose={() => setFindOpen(false)}
        />
      )}

      {/* Signature dialog */}
      <SignatureDialog
        open={sigDialogOpen}
        onClose={() => setSigDialogOpen(false)}
        onPlace={(dataUrl, aspectRatio) => setImgPlacement({ dataUrl, aspectRatio })}
      />

      {/* Watermark dialog */}
      {watermarkOpen && (
        <WatermarkDialog
          current={watermark}
          onSave={setWatermark}
          onClose={() => setWatermarkOpen(false)}
        />
      )}

      {/* Page numbers dialog */}
      {pageNumbersOpen && (
        <PageNumbersDialog
          current={pageNumberConfig}
          totalPages={pageOrder.filter(i => !deletedSet.has(i)).length}
          onSave={setPageNumberConfig}
          onClose={() => setPageNumbersOpen(false)}
        />
      )}

      {/* Guide context menu */}
      {guideMenu && (
        <div
          style={{ position: "fixed", top: guideMenu.y, left: guideMenu.x, zIndex: 9999 }}
          className="bg-background border border-border rounded shadow-xl py-1 text-sm min-w-[140px]"
          onMouseLeave={() => setGuideMenu(null)}
        >
          <button
            className="px-3 py-1.5 hover:bg-accent w-full text-left text-destructive"
            onClick={() => { setGuides(prev => prev.filter(g => g.id !== guideMenu.id)); setGuideMenu(null); }}
          >
            Delete guide
          </button>
        </div>
      )}

      {/* Export options dialog */}
      {exportOptsOpen && (
        <ExportOptionsDialog
          pageCount={pageOrder.filter(i => !deletedSet.has(i)).length}
          onExport={performDownload}
          onClose={() => setExportOptsOpen(false)}
        />
      )}

      {/* Link dialog */}
      {linkEditState && (
        <LinkDialog
          mode={linkEditState.mode}
          initial={linkEditState.mode === "edit" && linkEditState.id
            ? (links[linkEditState.pageIdx] ?? []).find(l => l.id === linkEditState.id)
            : undefined
          }
          pageCount={pages.length}
          onConfirm={handleLinkConfirm}
          onDelete={linkEditState.mode === "edit" ? handleLinkDelete : undefined}
          onClose={() => setLinkEditState(null)}
        />
      )}

      {/* Image placement banner */}
      {imgPlacement && (
        <div
          style={{ position: "fixed", top: 60, left: "50%", transform: "translateX(-50%)", zIndex: 300 }}
          className="flex items-center gap-3 bg-violet-600 text-white text-sm px-4 py-2 rounded-full shadow-lg"
        >
          <span>Click anywhere on a page to place</span>
          <button
            onClick={() => setImgPlacement(null)}
            className="text-white/80 hover:text-white text-xs underline"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Hidden file input for image insertion */}
      <input
        ref={imageFileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleInsertImageFile(file);
          e.target.value = "";
        }}
      />

      {/* Inline floating format bar */}
      {floatingBarPos && activeFormat && selectedCells.length > 0 && (
        <InlineFormatBar
          x={floatingBarPos.x}
          y={floatingBarPos.y}
          activeFormat={activeFormat}
          onFormatChange={applyFormat}
          onDelete={handleDeleteSelected}
        />
      )}

      {/* Shape format bar */}
      {shapeBarPos && selectedShapeId && (() => {
        const shape = (drawings[selectedShapeId.pageIdx] ?? []).find(s => s.id === selectedShapeId.id);
        if (!shape) return null;
        return (
          <ShapeFormatBar
            x={shapeBarPos.x}
            y={shapeBarPos.y}
            shape={shape}
            onEdit={(s) => dispatch({ type: "editShape", pageIdx: selectedShapeId.pageIdx, id: s.id, shape: s })}
            onDelete={() => {
              dispatch({ type: "removeShape", pageIdx: selectedShapeId.pageIdx, id: selectedShapeId.id });
              setSelectedShapeId(null);
            }}
          />
        );
      })()}
    </div>
  );
}
