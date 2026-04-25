"use client";

import { useRef, useState } from "react";
import { MessageSquare, X } from "lucide-react";
import type { StickyNote } from "@/lib/api";

interface Props {
  notes   : StickyNote[];
  scale   : number;
  onEdit  : (id: string, note: StickyNote) => void;
  onRemove: (id: string) => void;
}

const NOTE_COLORS = ["#fef08a", "#bbf7d0", "#bfdbfe", "#fecaca", "#e9d5ff"];

interface ItemProps {
  note    : StickyNote;
  scale   : number;
  onEdit  : (id: string, note: StickyNote) => void;
  onRemove: (id: string) => void;
}

function StickyNoteItem({ note, scale, onEdit, onRemove }: ItemProps) {
  const [isOpen, setIsOpen] = useState(false);
  const outerRef = useRef<HTMLDivElement>(null);

  const lx = note.x * scale;
  const ty = note.y * scale;

  const handleIconMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;

    const onMove = (ev: MouseEvent) => {
      const ddx = ev.clientX - startX;
      const ddy = ev.clientY - startY;
      if (!moved && Math.hypot(ddx, ddy) > 4) moved = true;
      if (moved && outerRef.current) {
        outerRef.current.style.left = `${lx + ddx}px`;
        outerRef.current.style.top  = `${ty + ddy}px`;
      }
    };

    const onUp = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
      if (moved) {
        const ddx = (ev.clientX - startX) / scale;
        const ddy = (ev.clientY - startY) / scale;
        onEdit(note.id, { ...note, x: note.x + ddx, y: note.y + ddy });
      } else {
        setIsOpen(prev => !prev);
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
  };

  return (
    <div
      ref={outerRef}
      style={{ position: "absolute", left: lx, top: ty, zIndex: 15 }}
      onClick={e => e.stopPropagation()}
    >
      {/* Icon / drag handle */}
      <button
        onMouseDown={handleIconMouseDown}
        title={note.text ? note.text : "Click to edit, drag to move"}
        style={{
          width: 22, height: 22,
          background: note.color,
          border: "1px solid rgba(0,0,0,0.20)",
          borderRadius: 3,
          cursor: "grab",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 1px 4px rgba(0,0,0,0.18)",
          padding: 0,
        }}
      >
        <MessageSquare style={{ width: 11, height: 11, color: "#555" }} />
      </button>

      {/* Popup editor */}
      {isOpen && (
        <div style={{
          position: "absolute", left: 26, top: 0,
          width: 200,
          background: note.color,
          border: "1px solid rgba(0,0,0,0.18)",
          borderRadius: 6,
          padding: "6px 8px",
          boxShadow: "0 4px 16px rgba(0,0,0,0.14)",
          zIndex: 200,
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            {/* Color swatches */}
            <div style={{ display: "flex", gap: 3 }}>
              {NOTE_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => onEdit(note.id, { ...note, color: c })}
                  style={{
                    width: 12, height: 12, borderRadius: "50%", background: c,
                    border: c === note.color ? "2px solid #555" : "1px solid rgba(0,0,0,0.2)",
                    padding: 0, cursor: "pointer",
                  }}
                />
              ))}
            </div>
            <button
              onClick={() => { onRemove(note.id); setIsOpen(false); }}
              style={{ padding: 0, background: "none", border: "none", cursor: "pointer", color: "#666", display: "flex" }}
              title="Delete note"
            >
              <X style={{ width: 12, height: 12 }} />
            </button>
          </div>
          <textarea
            key={note.id + note.text}
            defaultValue={note.text}
            rows={4}
            autoFocus
            placeholder="Add a note…"
            onBlur={e => onEdit(note.id, { ...note, text: e.target.value })}
            style={{
              width: "100%", resize: "none",
              background: "transparent",
              border: "none", outline: "none",
              fontSize: 12, fontFamily: "inherit",
              color: "#333", lineHeight: 1.4,
              boxSizing: "border-box",
            }}
          />
        </div>
      )}
    </div>
  );
}

export default function StickyNoteOverlay({ notes, scale, onEdit, onRemove }: Props) {
  return (
    <>
      {notes.map(note => (
        <StickyNoteItem
          key={note.id}
          note={note}
          scale={scale}
          onEdit={onEdit}
          onRemove={onRemove}
        />
      ))}
    </>
  );
}
