"use client";

import { useEffect, useRef } from "react";
import { X, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  findQuery      : string;
  replaceQuery   : string;
  matchCount     : number;
  currentIdx     : number;
  onFindChange   : (v: string) => void;
  onReplaceChange: (v: string) => void;
  onPrev         : () => void;
  onNext         : () => void;
  onReplace      : () => void;
  onReplaceAll   : () => void;
  onClose        : () => void;
}

export default function FindReplace({
  findQuery, replaceQuery, matchCount, currentIdx,
  onFindChange, onReplaceChange,
  onPrev, onNext, onReplace, onReplaceAll, onClose,
}: Props) {
  const findRef = useRef<HTMLInputElement>(null);

  useEffect(() => { findRef.current?.focus(); }, []);

  const label = matchCount === 0 ? "No results" : `${currentIdx + 1} / ${matchCount}`;

  const inputCls =
    "h-8 rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-violet-400 flex-1";

  return (
    <div
      style={{ position: "fixed", bottom: 24, right: 24, zIndex: 200, minWidth: 340 }}
      className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3 shadow-2xl"
    >
      {/* Row 1: find */}
      <div className="flex items-center gap-1.5">
        <input
          ref={findRef}
          value={findQuery}
          onChange={e => onFindChange(e.target.value)}
          placeholder="Find…"
          className={inputCls}
          onKeyDown={e => {
            if (e.key === "Enter") { e.shiftKey ? onPrev() : onNext(); }
            if (e.key === "Escape") onClose();
          }}
        />
        <span className="text-xs text-muted-foreground w-16 text-center shrink-0">{label}</span>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onPrev}  disabled={matchCount === 0} title="Previous (Shift+Enter)"><ChevronUp  className="w-3.5 h-3.5" /></Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onNext}  disabled={matchCount === 0} title="Next (Enter)"><ChevronDown className="w-3.5 h-3.5" /></Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose} title="Close (Esc)"><X className="w-3.5 h-3.5" /></Button>
      </div>

      {/* Row 2: replace */}
      <div className="flex items-center gap-1.5">
        <input
          value={replaceQuery}
          onChange={e => onReplaceChange(e.target.value)}
          placeholder="Replace with…"
          className={inputCls}
          onKeyDown={e => {
            if (e.key === "Enter") onReplace();
            if (e.key === "Escape") onClose();
          }}
        />
        <Button variant="outline" size="sm" className="h-7 text-xs px-2 shrink-0" onClick={onReplace}    disabled={matchCount === 0}>Replace</Button>
        <Button variant="outline" size="sm" className="h-7 text-xs px-2 shrink-0" onClick={onReplaceAll} disabled={matchCount === 0}>All</Button>
      </div>
    </div>
  );
}
