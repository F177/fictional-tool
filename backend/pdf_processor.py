"""
PDF processing pipeline.
- Text-based PDFs  → PyMuPDF word extraction with real font info
- Scanned PDFs     → PaddleOCR on rendered page images (CPU-only)
"""

import json
from pathlib import Path

import fitz  # PyMuPDF

PAGES_DIR = Path("pages_cache")
CACHE_DIR = Path("result_cache")
MIN_TEXT_CHARS = 20
RENDER_DPI = 150


def process_pdf(pdf_path: str, file_hash: str) -> list:
    job = _get_current_job()
    doc = fitz.open(pdf_path)
    total = len(doc)
    pages_data = []

    page_dir = PAGES_DIR / file_hash
    page_dir.mkdir(parents=True, exist_ok=True)

    for i in range(total):
        if job:
            job.meta["progress"] = int(i / total * 100)
            job.save_meta()

        page = doc[i]
        words  = _process_page(page, file_hash, i, page_dir)
        fields = _extract_form_fields(page)
        pages_data.append({
            "page_num" : i,
            "width"    : round(page.rect.width, 2),
            "height"   : round(page.rect.height, 2),
            "image_url": f"/api/pages/{file_hash}/{i}.png",
            "words"    : words,
            "fields"   : fields,
        })

    doc.close()
    cache_file = CACHE_DIR / f"{file_hash}.json"
    cache_file.write_text(json.dumps(pages_data), encoding="utf-8")
    return pages_data


def _process_page(page, file_hash: str, page_num: int, page_dir: Path) -> list:
    mat = fitz.Matrix(RENDER_DPI / 72, RENDER_DPI / 72)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    img_path = page_dir / f"{page_num}.png"
    pix.save(str(img_path))

    text = page.get_text("text").strip()
    if len(text) >= MIN_TEXT_CHARS:
        return _extract_text_words(page)

    from ocr_pipeline import run_ocr
    return run_ocr(
        str(img_path),
        pdf_w=page.rect.width,
        pdf_h=page.rect.height,
        img_w=pix.width,
        img_h=pix.height,
    )


def _extract_text_words(page) -> list:
    """
    Use get_text("words") for precise word bboxes, then match each word
    to its span from get_text("dict") to get real font name, size, and style.
    """
    # Build span font index from dict extraction
    span_fonts = []
    for block in page.get_text("dict", flags=0).get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                bbox = span.get("bbox")
                if not bbox:
                    continue
                flags = span.get("flags", 0)
                origin = span.get("origin", [0, 0])
                span_fonts.append({
                    "bbox": bbox,
                    "font": span.get("font", ""),
                    "size": float(span.get("size", 12)),
                    "bold": bool(flags & 2 ** 4),    # bit 4 = bold
                    "italic": bool(flags & 2 ** 1),  # bit 1 = italic
                    "color": span.get("color", 0),
                    "baseline_y": float(origin[1]),  # exact baseline coordinate
                })

    words = []
    for w in page.get_text("words"):
        x0, y0, x1, y1, text = w[0], w[1], w[2], w[3], w[4]
        text = text.strip()
        if not text:
            continue

        font = _find_span_for_word(span_fonts, x0, y0, x1, y1)
        h = y1 - y0
        # Use span's exact baseline; fall back to y1 (bottom of bbox ≈ baseline
        # for words without descenders).
        baseline_y = font["baseline_y"] if font and "baseline_y" in font else y1

        words.append({
            "text": text,
            "box": [round(x0, 2), round(y0, 2), round(x1, 2), round(y1, 2)],
            "font_size": round(font["size"] if font else h * 0.75, 1),
            "font_family": _css_font(font["font"] if font else ""),
            "bold": font["bold"] if font else False,
            "italic": font["italic"] if font else False,
            "color": font["color"] if font else 0,
            "confidence": 1.0,
            "source": "text",
            "baseline_y": round(baseline_y, 2),
        })
    return words


def _find_span_for_word(spans: list, wx0: float, wy0: float, wx1: float, wy1: float) -> dict | None:
    """Return the span with greatest bbox overlap with the word rect."""
    best, best_area = None, 0.0
    for s in spans:
        sx0, sy0, sx1, sy1 = s["bbox"]
        ox = max(0.0, min(wx1, sx1) - max(wx0, sx0))
        oy = max(0.0, min(wy1, sy1) - max(wy0, sy0))
        area = ox * oy
        if area > best_area:
            best_area = area
            best = s
    return best


def _css_font(pdf_font: str) -> str:
    n = pdf_font.lower()
    if any(x in n for x in ["helvetica", "arial"]):
        return "Arial, Helvetica, sans-serif"
    if any(x in n for x in ["times", "timesnewroman"]):
        return "Times New Roman, Times, serif"
    if "courier" in n:
        return "Courier New, Courier, monospace"
    if "calibri" in n:
        return "Calibri, Arial, sans-serif"
    if "georgia" in n:
        return "Georgia, serif"
    if "verdana" in n:
        return "Verdana, sans-serif"
    if "garamond" in n:
        return "Garamond, Georgia, serif"
    if "cambria" in n:
        return "Cambria, Georgia, serif"
    return "Arial, sans-serif"


def _extract_form_fields(page) -> list:
    fields = []
    try:
        for widget in (page.widgets() or []):
            ft_map = {
                fitz.PDF_WIDGET_TYPE_TEXT       : "text",
                fitz.PDF_WIDGET_TYPE_CHECKBOX   : "checkbox",
                fitz.PDF_WIDGET_TYPE_RADIOBUTTON: "radio",
                fitz.PDF_WIDGET_TYPE_COMBOBOX   : "dropdown",
                fitz.PDF_WIDGET_TYPE_LISTBOX    : "dropdown",
            }
            ft = ft_map.get(widget.field_type, "text")
            if widget.field_type == fitz.PDF_WIDGET_TYPE_MULTILINE:
                ft = "multiline"
            r = widget.rect
            entry: dict = {
                "id"  : widget.field_name or f"field_{len(fields)}",
                "name": widget.field_name or f"Field {len(fields) + 1}",
                "type": ft,
                "box" : [round(r.x0, 2), round(r.y0, 2), round(r.x1, 2), round(r.y1, 2)],
            }
            if ft == "dropdown":
                entry["options"] = list(widget.choice_values or [])
            fv = widget.field_value
            if fv is not None:
                if ft == "checkbox":
                    entry["value"] = "true" if fv in (True, "Yes", "On", "yes", "on") else "false"
                else:
                    entry["value"] = str(fv) if fv else ""
            fields.append(entry)
    except Exception:
        pass
    return fields


def _get_current_job():
    try:
        from rq import get_current_job
        return get_current_job()
    except Exception:
        return None
