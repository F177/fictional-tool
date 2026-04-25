import base64
import hashlib
import json
import threading
from pathlib import Path
from typing import Any

import fitz
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel

from pdf_processor import process_pdf

UPLOAD_DIR = Path("uploads")
PAGES_DIR = Path("pages_cache")
CACHE_DIR = Path("result_cache")
UPLOAD_DIR.mkdir(exist_ok=True)
PAGES_DIR.mkdir(exist_ok=True)
CACHE_DIR.mkdir(exist_ok=True)

MAX_SIZE = 10 * 1024 * 1024  # 10 MB

# In-memory job tracker: job_id → {"status": ..., "pages": ..., "error": ...}
_jobs: dict[str, dict] = {}
_jobs_lock = threading.Lock()

app = FastAPI(title="ThePDF API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _run_job(job_id: str, pdf_path: str, file_hash: str):
    try:
        pages = process_pdf(pdf_path, file_hash)
        with _jobs_lock:
            _jobs[job_id] = {"status": "done", "pages": pages}
    except Exception as e:
        with _jobs_lock:
            _jobs[job_id] = {"status": "error", "message": str(e)}


@app.post("/api/upload")
async def upload(file: UploadFile = File(...)):
    if not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are accepted")

    data = await file.read()
    if len(data) > MAX_SIZE:
        raise HTTPException(400, "File exceeds the 10 MB limit")

    file_hash = hashlib.sha256(data).hexdigest()

    # File-based cache check
    cache_file = CACHE_DIR / f"{file_hash}.json"
    if cache_file.exists():
        pages = json.loads(cache_file.read_text(encoding="utf-8"))
        return {"file_hash": file_hash, "status": "done", "job_id": None, "pages": pages}

    # Save PDF
    pdf_path = UPLOAD_DIR / f"{file_hash}.pdf"
    if not pdf_path.exists():
        pdf_path.write_bytes(data)

    # Launch background thread
    job_id = file_hash  # simple: one job per hash
    with _jobs_lock:
        if job_id not in _jobs:
            _jobs[job_id] = {"status": "processing"}
            t = threading.Thread(target=_run_job, args=(job_id, str(pdf_path), file_hash), daemon=True)
            t.start()

    return {"file_hash": file_hash, "status": "queued", "job_id": job_id}


@app.get("/api/job/{job_id}")
async def job_status(job_id: str):
    with _jobs_lock:
        job = _jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job


def _pymupdf_font(css_family: str, bold: bool, italic: bool) -> str:
    f = (css_family or "").lower()
    if "courier" in f or "mono" in f:
        if bold and italic: return "cobi"
        if bold:            return "cobo"
        if italic:          return "coit"
        return "cour"
    if "times" in f or "roman" in f or ("serif" in f and "sans" not in f):
        if bold and italic: return "tibi"
        if bold:            return "tibo"
        if italic:          return "tiit"
        return "tiro"
    if bold and italic: return "hebi"
    if bold:            return "hebo"
    if italic:          return "heit"
    return "helv"


class ExportRequest(BaseModel):
    file_hash    : str
    edits        : dict[str, dict[str, Any]]
    added_words  : list[dict[str, Any]] = []
    rotations    : dict[str, int]        = {}
    added_images : list[dict[str, Any]] = []
    deleted_pages: list[int]             = []
    drawn_shapes : list[dict[str, Any]] = []
    sticky_notes : list[dict[str, Any]] = []
    form_values  : dict[str, dict[str, str]] = {}
    page_order   : list[int]            = []   # display order → original page index
    watermark    : dict[str, Any] | None = None
    password     : str                  = ""
    metadata     : dict[str, str]       = {}
    compress     : bool                 = True
    page_range   : str                  = ""   # "1-3,5" (1-indexed); "" = all
    links        : list[dict[str, Any]] = []
    bookmarks    : list[dict[str, Any]] = []


@app.post("/api/export")
async def export_pdf(req: ExportRequest):
    pdf_path   = UPLOAD_DIR / f"{req.file_hash}.pdf"
    cache_file = CACHE_DIR  / f"{req.file_hash}.json"

    if not pdf_path.exists():
        raise HTTPException(404, "Original PDF not found — please re-upload")
    if not cache_file.exists():
        raise HTTPException(404, "Page data not found — please re-upload")

    pages_data: list = json.loads(cache_file.read_text(encoding="utf-8"))
    doc = fitz.open(str(pdf_path))

    for page_idx_str, word_edits in req.edits.items():
        page_idx = int(page_idx_str)
        if page_idx >= len(doc):
            continue

        page       = doc[page_idx]
        page_words = pages_data[page_idx]["words"] if page_idx < len(pages_data) else []

        # Separate annotation-only edits from edits that change text/font/position
        text_items: list = []
        annot_items: list = []
        for word_idx_str, word_edit in word_edits.items():
            word_idx = int(word_idx_str)
            if word_idx >= len(page_words):
                continue
            word = page_words[word_idx]
            x0, y0, x1, y1 = word["box"]
            rect = fitz.Rect(x0, y0, x1, y1)

            orig_text    = word.get("text", "")
            edit_text    = (word_edit.get("text") or "").strip()
            has_text_chg = edit_text and edit_text != orig_text
            has_font_chg = any(word_edit.get(f) is not None for f in ("fontFamily", "fontSize", "bold", "italic"))
            has_pos_chg  = float(word_edit.get("dx") or 0) != 0 or float(word_edit.get("dy") or 0) != 0
            is_deleted   = bool(word_edit.get("deleted")) or bool(word_edit.get("redacted"))

            if has_text_chg or has_font_chg or has_pos_chg or is_deleted:
                text_items.append((word, word_edit, rect))
            else:
                annot_items.append((word, word_edit, rect))

        # 1. Stamp redaction annotations only for text-change items
        for _, word_edit_item, rect in text_items:
            fill_col = (0, 0, 0) if word_edit_item.get("redacted") else None
            page.add_redact_annot(rect, fill=fill_col)

        # 2. Apply: strip only text
        if text_items:
            page.apply_redactions(images=0, graphics=0)

        # 3. Insert new text
        for word, word_edit, _ in text_items:
            text = (word_edit.get("text") or "").strip()
            if not text:
                continue

            x0, y0, x1, y1 = word["box"]
            box_w      = x1 - x0
            baseline_y = word.get("baseline_y") or y1
            dx = float(word_edit.get("dx") or 0)
            dy = float(word_edit.get("dy") or 0)
            x0        += dx
            baseline_y += dy

            font_size  = float(word_edit.get("fontSize")  or word.get("font_size") or 12)
            color_int  = int(word_edit.get("color")       or word.get("color")     or 0)
            css_family = word_edit.get("fontFamily")      or word.get("font_family") or ""
            bold       = word_edit.get("bold")  if word_edit.get("bold")  is not None else word.get("bold",   False)
            italic     = word_edit.get("italic") if word_edit.get("italic") is not None else word.get("italic", False)

            fontname = _pymupdf_font(css_family, bold, italic)

            # Scale down font if new text is wider than the original box
            text_w = fitz.get_text_length(text, fontname=fontname, fontsize=font_size)
            if text_w > box_w > 0:
                font_size *= box_w / text_w

            r = ((color_int >> 16) & 0xFF) / 255
            g = ((color_int >>  8) & 0xFF) / 255
            b = ( color_int        & 0xFF) / 255

            page.insert_text(
                (x0, baseline_y),
                text,
                fontname=fontname,
                fontsize=font_size,
                color=(r, g, b),
            )

        # 4. PDF annotations (highlight, underline, strikethrough) on all edits
        for word, word_edit, _ in text_items + annot_items:
            x0, y0, x1, y1 = word["box"]
            dx = float(word_edit.get("dx") or 0)
            dy = float(word_edit.get("dy") or 0)
            arect = fitz.Rect(x0 + dx, y0 + dy, x1 + dx, y1 + dy)

            hl = word_edit.get("highlight")
            if hl:
                try:
                    hx = hl.lstrip("#")
                    hr = int(hx[0:2], 16) / 255
                    hg = int(hx[2:4], 16) / 255
                    hb = int(hx[4:6], 16) / 255
                    annot = page.add_highlight_annot(arect)
                    annot.set_colors(stroke=(hr, hg, hb))
                    annot.update()
                except Exception:
                    pass

            if word_edit.get("underline"):
                try:
                    annot = page.add_underline_annot(arect)
                    annot.update()
                except Exception:
                    pass

            if word_edit.get("strikethrough"):
                try:
                    annot = page.add_strikeout_annot(arect)
                    annot.update()
                except Exception:
                    pass

    # Insert brand-new text boxes added by the user (no redaction needed)
    for aw in req.added_words:
        page_idx = int(aw.get("pageIdx", 0))
        if page_idx >= len(doc):
            continue
        text = (aw.get("text") or "").strip()
        if not text:
            continue
        x          = float(aw.get("x", 0)) + float(aw.get("dx") or 0)
        y          = float(aw.get("y", 0)) + float(aw.get("dy") or 0)
        font_size  = float(aw.get("fontSize") or 12)
        color_int  = int(aw.get("color") or 0)
        css_family = aw.get("fontFamily") or ""
        bold       = bool(aw.get("bold",   False))
        italic     = bool(aw.get("italic", False))
        fontname   = _pymupdf_font(css_family, bold, italic)
        r = ((color_int >> 16) & 0xFF) / 255
        g = ((color_int >>  8) & 0xFF) / 255
        b = ( color_int        & 0xFF) / 255

        # Adjust x for text alignment
        text_align = aw.get("textAlign", "left")
        if text_align in ("center", "right"):
            tw = fitz.get_text_length(text, fontname=fontname, fontsize=font_size)
            x -= tw / 2 if text_align == "center" else tw

        doc[page_idx].insert_text((x, y), text, fontname=fontname, fontsize=font_size, color=(r, g, b))

        # Draw underline / strikethrough lines
        if aw.get("underline") or aw.get("strikethrough"):
            tw = fitz.get_text_length(text, fontname=fontname, fontsize=font_size)
            lw = max(0.5, font_size * 0.06)
            p  = doc[page_idx]
            if aw.get("underline"):
                p.draw_line(fitz.Point(x, y + font_size * 0.12), fitz.Point(x + tw, y + font_size * 0.12),
                            color=(r, g, b), width=lw)
            if aw.get("strikethrough"):
                p.draw_line(fitz.Point(x, y - font_size * 0.35), fitz.Point(x + tw, y - font_size * 0.35),
                            color=(r, g, b), width=lw)

    # Insert placed images / signatures (skip pages that will be deleted)
    deleted_set = set(req.deleted_pages)
    for img in req.added_images:
        page_idx = int(img.get("pageIdx", 0))
        if page_idx in deleted_set or page_idx >= len(doc):
            continue
        data_url = img.get("dataUrl", "")
        if not data_url or "," not in data_url:
            continue
        x = float(img.get("x", 0)) + float(img.get("dx") or 0)
        y = float(img.get("y", 0)) + float(img.get("dy") or 0)
        w = float(img.get("width",  80))
        h = float(img.get("height", 40))
        try:
            img_bytes = base64.b64decode(data_url.split(",")[1])
            doc[page_idx].insert_image(fitz.Rect(x, y, x + w, y + h), stream=img_bytes)
        except Exception:
            pass

    # Apply page rotations
    for page_idx_str, delta in req.rotations.items():
        page_idx = int(page_idx_str)
        if page_idx < len(doc) and delta and page_idx not in deleted_set:
            p = doc[page_idx]
            p.set_rotation((p.rotation + delta) % 360)

    # ── Form field values ──────────────────────────────────────────────────────
    for page_idx_str, field_vals in req.form_values.items():
        page_idx = int(page_idx_str)
        if page_idx in deleted_set or page_idx >= len(doc):
            continue
        page = doc[page_idx]
        for widget in (page.widgets() or []):
            fname = widget.field_name or ""
            if fname in field_vals:
                val = field_vals[fname]
                try:
                    if widget.field_type == fitz.PDF_WIDGET_TYPE_CHECKBOX:
                        widget.field_value = (val == "true")
                    else:
                        widget.field_value = val
                    widget.update()
                except Exception:
                    pass

    # ── Drawn shapes ───────────────────────────────────────────────────────────
    import math as _math
    for shape in req.drawn_shapes:
        page_idx = int(shape.get("pageIdx", 0))
        if page_idx in deleted_set or page_idx >= len(doc):
            continue
        page = doc[page_idx]
        tool = shape.get("tool", "")
        hex_col = (shape.get("color") or "#000000").lstrip("#")
        try:
            sr = int(hex_col[0:2], 16) / 255
            sg = int(hex_col[2:4], 16) / 255
            sb = int(hex_col[4:6], 16) / 255
        except Exception:
            sr, sg, sb = 0, 0, 0
        color = (sr, sg, sb)
        lw = float(shape.get("lineWidth", 2))
        fill_hex = shape.get("fill")
        fill_color = None
        if fill_hex:
            fh = fill_hex.lstrip("#")
            try:
                fill_color = (int(fh[0:2], 16) / 255, int(fh[2:4], 16) / 255, int(fh[4:6], 16) / 255)
            except Exception:
                fill_color = None

        try:
            if tool == "pen":
                pts = shape.get("points") or []
                if len(pts) >= 2:
                    sh = page.new_shape()
                    sh.draw_polyline([fitz.Point(p[0], p[1]) for p in pts])
                    sh.finish(color=color, width=lw, fill=None)
                    sh.commit()
            elif tool == "rect":
                x, y, w, h = float(shape.get("x", 0)), float(shape.get("y", 0)), float(shape.get("w", 0)), float(shape.get("h", 0))
                page.draw_rect(fitz.Rect(x, y, x + w, y + h), color=color, fill=fill_color, width=lw)
            elif tool == "circle":
                x, y, w, h = float(shape.get("x", 0)), float(shape.get("y", 0)), float(shape.get("w", 0)), float(shape.get("h", 0))
                page.draw_oval(fitz.Rect(x, y, x + w, y + h), color=color, fill=fill_color, width=lw)
            elif tool == "line":
                x1, y1 = float(shape.get("x1", 0)), float(shape.get("y1", 0))
                x2, y2 = float(shape.get("x2", 0)), float(shape.get("y2", 0))
                page.draw_line(fitz.Point(x1, y1), fitz.Point(x2, y2), color=color, width=lw)
            elif tool == "arrow":
                x1, y1 = float(shape.get("x1", 0)), float(shape.get("y1", 0))
                x2, y2 = float(shape.get("x2", 0)), float(shape.get("y2", 0))
                page.draw_line(fitz.Point(x1, y1), fitz.Point(x2, y2), color=color, width=lw)
                angle = _math.atan2(y2 - y1, x2 - x1)
                al, aw = max(lw * 3.5, 8), 0.45
                ah1 = fitz.Point(x2 - al * _math.cos(angle - aw), y2 - al * _math.sin(angle - aw))
                ah2 = fitz.Point(x2 - al * _math.cos(angle + aw), y2 - al * _math.sin(angle + aw))
                sh2 = page.new_shape()
                sh2.draw_polyline([fitz.Point(x2, y2), ah1, ah2, fitz.Point(x2, y2)])
                sh2.finish(color=color, fill=color, width=0)
                sh2.commit()
            elif tool == "triangle":
                x, y, w, h = float(shape.get("x", 0)), float(shape.get("y", 0)), float(shape.get("w", 0)), float(shape.get("h", 0))
                pts = [fitz.Point(x + w / 2, y), fitz.Point(x, y + h), fitz.Point(x + w, y + h), fitz.Point(x + w / 2, y)]
                sh = page.new_shape()
                sh.draw_polyline(pts)
                sh.finish(color=color, fill=fill_color, width=lw, closePath=True)
                sh.commit()
            elif tool == "diamond":
                x, y, w, h = float(shape.get("x", 0)), float(shape.get("y", 0)), float(shape.get("w", 0)), float(shape.get("h", 0))
                pts = [fitz.Point(x + w / 2, y), fitz.Point(x + w, y + h / 2), fitz.Point(x + w / 2, y + h), fitz.Point(x, y + h / 2), fitz.Point(x + w / 2, y)]
                sh = page.new_shape()
                sh.draw_polyline(pts)
                sh.finish(color=color, fill=fill_color, width=lw, closePath=True)
                sh.commit()
            elif tool == "star":
                x, y, w, h = float(shape.get("x", 0)), float(shape.get("y", 0)), float(shape.get("w", 0)), float(shape.get("h", 0))
                cx, cy = x + w / 2, y + h / 2
                outer_r = min(abs(w), abs(h)) / 2
                inner_r = outer_r * 0.4
                star_pts = []
                for i in range(10):
                    angle = (_math.pi / 5) * i - _math.pi / 2
                    r = outer_r if i % 2 == 0 else inner_r
                    star_pts.append(fitz.Point(cx + r * _math.cos(angle), cy + r * _math.sin(angle)))
                star_pts.append(star_pts[0])
                sh = page.new_shape()
                sh.draw_polyline(star_pts)
                sh.finish(color=color, fill=fill_color, width=lw, closePath=True)
                sh.commit()
        except Exception:
            pass

    # ── Sticky notes ───────────────────────────────────────────────────────────
    for note in req.sticky_notes:
        page_idx = int(note.get("pageIdx", 0))
        if page_idx in deleted_set or page_idx >= len(doc):
            continue
        text = (note.get("text") or "").strip()
        if not text:
            continue
        x = float(note.get("x", 0))
        y = float(note.get("y", 0))
        hex_col = (note.get("color") or "#fef08a").lstrip("#")
        try:
            nr = int(hex_col[0:2], 16) / 255
            ng = int(hex_col[2:4], 16) / 255
            nb = int(hex_col[4:6], 16) / 255
        except Exception:
            nr, ng, nb = 1, 0.94, 0.54
        try:
            annot = doc[page_idx].add_text_annot(fitz.Point(x, y), text, icon="Note")
            annot.set_colors(stroke=(nr, ng, nb), fill=(nr, ng, nb))
            annot.update()
        except Exception:
            pass

    # ── Link annotations ──────────────────────────────────────────────────────
    for link in req.links:
        page_idx = int(link.get("pageIdx", 0))
        if page_idx in deleted_set or page_idx >= len(doc):
            continue
        x  = float(link.get("x", 0))
        y  = float(link.get("y", 0))
        lw = float(link.get("w", 0))
        lh = float(link.get("h", 0))
        rect = fitz.Rect(x, y, x + lw, y + lh)
        url = link.get("url")
        page_target = link.get("pageTarget")
        try:
            if url:
                doc[page_idx].insert_link({"kind": fitz.LINK_URI, "from": rect, "uri": url})
            elif page_target is not None:
                doc[page_idx].insert_link({"kind": fitz.LINK_GOTO, "from": rect, "page": int(page_target)})
        except Exception:
            pass

    # ── Watermark ──────────────────────────────────────────────────────────────
    if req.watermark:
        wm       = req.watermark
        wm_text  = str(wm.get("text", "WATERMARK"))
        wm_size  = float(wm.get("fontSize", 72))
        wm_angle = int(wm.get("angle", 45))
        wm_opacity = float(wm.get("opacity", 0.25))
        hex_col = (wm.get("color") or "#808080").lstrip("#")
        try:
            wr = int(hex_col[0:2], 16) / 255
            wg = int(hex_col[2:4], 16) / 255
            wb = int(hex_col[4:6], 16) / 255
        except Exception:
            wr, wg, wb = 0.5, 0.5, 0.5
        # Blend color toward white to simulate opacity
        def blend(c: float) -> float:
            return c + (1.0 - c) * (1.0 - wm_opacity)
        wm_color = (blend(wr), blend(wg), blend(wb))
        tile = bool(wm.get("tile", False))
        for pi in range(len(doc)):
            if pi in deleted_set:
                continue
            p = doc[pi]
            if tile:
                step_x = wm_size * len(wm_text) * 0.55
                step_y = wm_size * 1.8
                x = 0.0
                while x < p.rect.width + step_x:
                    y = 0.0
                    while y < p.rect.height + step_y:
                        try:
                            p.insert_text(fitz.Point(x, y), wm_text, fontsize=wm_size,
                                          color=wm_color, rotate=wm_angle)
                        except Exception:
                            pass
                        y += step_y
                    x += step_x
            else:
                cx = p.rect.width  / 2
                cy = p.rect.height / 2
                try:
                    p.insert_text(fitz.Point(cx, cy), wm_text, fontsize=wm_size,
                                  color=wm_color, rotate=wm_angle)
                except Exception:
                    pass

    # ── Metadata ───────────────────────────────────────────────────────────────
    if req.metadata:
        meta = {k: str(v) for k, v in req.metadata.items() if v}
        if meta:
            try:
                doc.set_metadata(meta)
            except Exception:
                pass

    # ── Page ordering + deletion (replaces old delete_page loop) ───────────────
    def _parse_page_range(spec: str, total: int) -> list[int] | None:
        """Parse "1-3,5,7-9" → [0,1,2,4,6,7,8] (0-indexed). Returns None if spec empty."""
        spec = spec.strip()
        if not spec:
            return None
        result = []
        for part in spec.split(","):
            part = part.strip()
            if "-" in part:
                a, _, b = part.partition("-")
                try:
                    lo, hi = int(a.strip()), int(b.strip())
                    result.extend(range(max(0, lo - 1), min(total, hi)))
                except ValueError:
                    pass
            else:
                try:
                    result.append(int(part.strip()) - 1)
                except ValueError:
                    pass
        return [p for p in dict.fromkeys(result) if 0 <= p < total]  # unique, valid

    range_filter = _parse_page_range(req.page_range, len(doc))
    base_order   = req.page_order if req.page_order else list(range(len(doc)))
    final_order  = [p for p in base_order if p not in deleted_set and p < len(doc)]
    if range_filter is not None:
        # range_filter is in terms of display indices
        final_order = [final_order[i] for i in range_filter if i < len(final_order)]
    if final_order:
        doc.select(final_order)

    # ── Bookmarks / Outline (MUST be after doc.select — select() rebuilds page tree) ──
    if req.bookmarks:
        toc = []
        for bm in req.bookmarks:
            orig_page_idx = int(bm.get("pageIdx", 0))
            if orig_page_idx not in final_order:
                continue
            new_page_no = final_order.index(orig_page_idx) + 1
            level = int(bm.get("level", 0)) + 1
            title = str(bm.get("title", ""))
            y     = bm.get("y")
            entry = [level, title, new_page_no, float(y)] if y is not None else [level, title, new_page_no]
            toc.append(entry)
        if toc:
            try:
                doc.set_toc(toc)
            except Exception:
                pass

    # ── Compress + encryption ─────────────────────────────────────────────────
    save_kwargs: dict = {"garbage": 4, "deflate": True}
    if req.compress:
        save_kwargs["deflate_images"] = True
        save_kwargs["deflate_fonts"]  = True
    if req.password:
        save_kwargs["encryption"] = fitz.PDF_ENCRYPT_AES_256
        save_kwargs["owner_pw"]   = req.password
        save_kwargs["user_pw"]    = req.password
        save_kwargs["permissions"] = (
            fitz.PDF_PERM_PRINT | fitz.PDF_PERM_COPY | fitz.PDF_PERM_ANNOTATE
        )

    pdf_bytes = doc.tobytes(**save_kwargs)
    doc.close()
    return Response(content=pdf_bytes, media_type="application/pdf")


@app.get("/api/outline/{file_hash}")
async def get_outline(file_hash: str):
    pdf_path = UPLOAD_DIR / f"{file_hash}.pdf"
    if not pdf_path.exists():
        raise HTTPException(404, "PDF not found")
    doc = fitz.open(str(pdf_path))
    toc = doc.get_toc()  # [[level, title, page], ...]
    doc.close()
    return [{"level": level, "title": title, "page": page} for level, title, page in toc]


@app.get("/api/pages/{file_hash}/{page_num}.png")
async def get_page_image(file_hash: str, page_num: int):
    img_path = PAGES_DIR / file_hash / f"{page_num}.png"
    if not img_path.exists():
        raise HTTPException(404, "Page image not found")
    return FileResponse(str(img_path), media_type="image/png",
                        headers={"Cache-Control": "public, max-age=86400, immutable"})
