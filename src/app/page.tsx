"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { storePdf } from "@/lib/pdf-store";
import { useDropzone } from "react-dropzone";
import {
  FileText,
  Upload,
  Pencil,
  Highlighter,
  Eraser,
  PenLine,
  Download,
  ChevronRight,
  Sparkles,
  Type,
  Shapes,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const FEATURES = [
  { icon: Type, title: "Add Text", desc: "Insert text anywhere on the page with custom font and size." },
  { icon: Highlighter, title: "Highlight", desc: "Highlight important passages with vibrant colors." },
  { icon: Pencil, title: "Draw", desc: "Freehand drawing and shape tools for annotations." },
  { icon: Eraser, title: "Erase", desc: "White-out or erase existing content from the PDF." },
  { icon: PenLine, title: "Sign", desc: "Draw or type your signature and place it anywhere." },
  { icon: Download, title: "Download", desc: "Export your edited PDF instantly — no watermark." },
];

export default function HomePage() {
  const router = useRouter();
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    (file: File) => {
      if (file.type !== "application/pdf") {
        setError("Please upload a valid PDF file.");
        return;
      }
      if (file.size > 50 * 1024 * 1024) {
        setError("File is too large. Maximum size is 50 MB.");
        return;
      }
      setError(null);
      storePdf(file);
      sessionStorage.setItem("pdf_name", file.name);
      router.push("/editor");
    },
    [router]
  );

  const { getRootProps, getInputProps } = useDropzone({
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
    onDrop: (accepted) => {
      setIsDragOver(false);
      if (accepted[0]) handleFile(accepted[0]);
    },
    onDragEnter: () => setIsDragOver(true),
    onDragLeave: () => setIsDragOver(false),
  });

  return (
    <main className="flex flex-col min-h-screen">
      {/* Nav */}
      <nav className="border-b border-border/50 px-6 py-4 flex items-center justify-between backdrop-blur-sm bg-background/80 sticky top-0 z-50">
        <div className="flex items-center gap-2 font-bold text-xl tracking-tight">
          <FileText className="text-violet-600 w-6 h-6" />
          <span>ThePDF</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground hidden sm:block">Free. No sign-up. No watermark.</span>
          <Button
            size="sm"
            className="bg-gradient-to-r from-violet-600 to-blue-500 text-white hover:opacity-90 border-0"
            onClick={() => (document.querySelector('input[type="file"]') as HTMLElement)?.click()}
          >
            Open PDF <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-4 py-20 text-center">
        <div className="inline-flex items-center gap-2 text-xs font-medium bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 rounded-full px-3 py-1 mb-6">
          <Sparkles className="w-3 h-3" />
          Runs entirely in your browser — your files never leave your device
        </div>
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-tight mb-4 max-w-3xl">
          Edit PDFs{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-blue-500">
            in seconds
          </span>
        </h1>
        <p className="text-muted-foreground text-lg sm:text-xl mb-12 max-w-xl">
          Add text, draw, highlight, sign and erase — all without uploading your files to any server.
        </p>

        {/* Drop zone */}
        <div
          {...getRootProps()}
          className={cn(
            "relative w-full max-w-2xl rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer",
            "flex flex-col items-center justify-center gap-4 p-12",
            isDragOver
              ? "border-violet-500 bg-violet-50 dark:bg-violet-950/20 scale-[1.02]"
              : "border-border hover:border-violet-400 hover:bg-muted/40"
          )}
        >
          <input {...getInputProps()} />
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center shadow-lg">
            <Upload className="w-8 h-8 text-white" />
          </div>
          <div>
            <p className="text-lg font-semibold">
              {isDragOver ? "Drop it!" : "Drop your PDF here"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">or click to browse — up to 50 MB</p>
          </div>
          {error && <p className="text-destructive text-sm font-medium">{error}</p>}
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          Works in Chrome, Firefox, Safari, and Edge.
        </p>
      </section>

      {/* Features */}
      <section className="border-t border-border/50 bg-muted/30 px-6 py-16">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-10">Everything you need to edit a PDF</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="bg-background rounded-xl border border-border/60 p-5 flex gap-4 hover:shadow-sm transition-shadow"
              >
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-100 to-blue-100 dark:from-violet-900/30 dark:to-blue-900/30 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">{title}</h3>
                  <p className="text-muted-foreground text-sm mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 px-6 py-4 text-center text-xs text-muted-foreground">
        <div className="flex items-center justify-center gap-1">
          <FileText className="w-3 h-3" />
          <span>ThePDF — Free, private, powerful.</span>
        </div>
      </footer>
    </main>
  );
}
