"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor } from "@/lib/editor-context";
import { cn } from "@/lib/utils";

interface PagesSidebarProps {
  pdfPages: unknown[];
}

function PageThumbnail({
  pdfPage,
  pageIndex,
  isActive,
  onClick,
}: {
  pdfPage: unknown;
  pageIndex: number;
  isActive: boolean;
  onClick: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    if (!pdfPage || !canvasRef.current || rendered) return;
    const page = pdfPage as {
      getViewport: (opts: { scale: number }) => { width: number; height: number };
      render: (opts: unknown) => { promise: Promise<void>; cancel: () => void };
    };
    const THUMB_SCALE = 0.2;
    const viewport = page.getViewport({ scale: THUMB_SCALE });
    const canvas = canvasRef.current;
    const cssW = Math.floor(viewport.width);
    const cssH = Math.floor(viewport.height);
    canvas.width = cssW;
    canvas.height = cssH;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    const ctx = canvas.getContext("2d")!;
    const task = page.render({ canvasContext: ctx, viewport });
    task.promise.then(() => setRendered(true)).catch(() => {});
    return () => task.cancel();
  }, [pdfPage, rendered]);

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 p-2 rounded-lg w-full transition-all",
        isActive ? "bg-violet-100 dark:bg-violet-900/30 ring-1 ring-violet-400" : "hover:bg-muted"
      )}
    >
      <div className="border border-border/60 rounded overflow-hidden shadow-sm bg-white">
        <canvas ref={canvasRef} className="block max-w-full" />
      </div>
      <span className="text-xs text-muted-foreground font-medium">{pageIndex + 1}</span>
    </button>
  );
}

export default function PagesSidebar({ pdfPages }: PagesSidebarProps) {
  const editor = useEditor();

  return (
    <aside className="w-24 border-r border-border/60 bg-muted/20 overflow-y-auto flex flex-col gap-1 p-2 shrink-0">
      {pdfPages.map((page, i) => (
        <PageThumbnail
          key={i}
          pdfPage={page}
          pageIndex={i}
          isActive={editor.currentPage === i}
          onClick={() => editor.setCurrentPage(i)}
        />
      ))}
    </aside>
  );
}
