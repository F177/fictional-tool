"use client";

import type { FormField } from "@/lib/api";

interface Props {
  fields    : FormField[];
  scale     : number;
  formValues: Record<string, string>;
  onChange  : (fieldId: string, value: string) => void;
}

export default function FormFieldOverlay({ fields, scale, formValues, onChange }: Props) {
  return (
    <>
      {fields.map(field => {
        const [x0, y0, x1, y1] = field.box;
        const left = x0 * scale;
        const top  = y0 * scale;
        const w    = (x1 - x0) * scale;
        const h    = (y1 - y0) * scale;
        const val  = formValues[field.id] ?? field.value ?? "";
        const fs   = Math.max(8, Math.min(13, h * 0.58));

        const base: React.CSSProperties = {
          position  : "absolute",
          left, top, width: w, height: h,
          fontSize  : fs,
          fontFamily: "Arial, sans-serif",
          background: "rgba(219,234,254,0.35)",
          border    : "1.5px solid rgba(59,130,246,0.45)",
          borderRadius: 2,
          outline   : "none",
          boxSizing : "border-box",
          padding   : "1px 3px",
          color     : "#000",
          zIndex    : 15,
          cursor    : "text",
        };

        if (field.type === "checkbox") {
          return (
            <input
              key={field.id}
              type="checkbox"
              checked={val === "true"}
              onChange={e => onChange(field.id, e.target.checked ? "true" : "false")}
              onClick={e => e.stopPropagation()}
              style={{
                position: "absolute",
                left    : left + w / 2 - 8,
                top     : top  + h / 2 - 8,
                width   : 16, height: 16,
                cursor  : "pointer",
                zIndex  : 15,
              }}
            />
          );
        }

        if (field.type === "dropdown") {
          return (
            <select
              key={field.id}
              value={val}
              onChange={e => { e.stopPropagation(); onChange(field.id, e.target.value); }}
              onClick={e => e.stopPropagation()}
              style={{ ...base, cursor: "pointer", paddingRight: 4 }}
            >
              <option value="" />
              {(field.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          );
        }

        if (field.type === "multiline") {
          return (
            <textarea
              key={field.id}
              defaultValue={val}
              onBlur={e => onChange(field.id, e.target.value)}
              onClick={e => e.stopPropagation()}
              style={{ ...base, resize: "none", lineHeight: 1.3 }}
            />
          );
        }

        // text / radio default → text input
        return (
          <input
            key={field.id}
            type="text"
            defaultValue={val}
            onBlur={e => onChange(field.id, e.target.value)}
            onClick={e => e.stopPropagation()}
            style={base}
          />
        );
      })}
    </>
  );
}
