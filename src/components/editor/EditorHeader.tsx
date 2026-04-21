"use client";

import { useEditor } from "@/lib/editor-context";
import { FileText, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function EditorHeader() {
  const editor = useEditor();

  return (
    <header className="h-12 border-b border-border/60 bg-background/80 backdrop-blur-sm flex items-center px-4 gap-4 shrink-0 z-10">
      <div className="flex items-center gap-2">
        <FileText className="w-4 h-4 text-violet-600 shrink-0" />
        <span className="text-sm font-medium truncate max-w-xs">{editor.pdfName}</span>
        <Badge variant="secondary" className="text-xs">
          {Math.round(editor.zoom * 100)}%
        </Badge>
      </div>

      <div className="flex-1" />

      {/* Page navigation */}
      {editor.totalPages > 0 && (
        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={() => editor.setCurrentPage(Math.max(0, editor.currentPage - 1))}
            disabled={editor.currentPage === 0}
            className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-muted-foreground text-xs">
            Page <span className="text-foreground font-medium">{editor.currentPage + 1}</span> of{" "}
            <span className="text-foreground font-medium">{editor.totalPages}</span>
          </span>
          <button
            onClick={() => editor.setCurrentPage(Math.min(editor.totalPages - 1, editor.currentPage + 1))}
            disabled={editor.currentPage === editor.totalPages - 1}
            className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </header>
  );
}
