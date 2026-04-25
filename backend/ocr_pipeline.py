"""
PaddleOCR 3.x wrapper — CPU-only, singleton worker, lazy-loaded.
Normalises bounding boxes from image pixels → PDF point space.
"""

from __future__ import annotations
import os

os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")

_ocr = None


def _get_ocr():
    global _ocr
    if _ocr is None:
        from paddleocr import PaddleOCR
        _ocr = PaddleOCR(
            lang="en",
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
        )
    return _ocr


def run_ocr(
    image_path: str,
    pdf_w: float,
    pdf_h: float,
    img_w: int,
    img_h: int,
) -> list:
    """
    Run PaddleOCR on a page image and return words in PDF coordinate space.

    PaddleOCR 3.x returns per-result dicts with:
      dt_polys   : list of 4-point polygons [[x,y], ...]
      rec_texts  : list of recognised strings
      rec_scores : list of confidence floats
    """
    ocr = _get_ocr()
    results = list(ocr.predict(image_path))
    if not results:
        return []

    scale_x = pdf_w / img_w
    scale_y = pdf_h / img_h

    words = []
    for page_res in results:
        polys  = page_res.get("dt_polys",   [])
        texts  = page_res.get("rec_texts",  [])
        scores = page_res.get("rec_scores", [])

        for poly, text, conf in zip(polys, texts, scores):
            text = str(text).strip()
            if not text or float(conf) < 0.3:
                continue

            xs = [p[0] for p in poly]
            ys = [p[1] for p in poly]
            img_x0, img_y0 = min(xs), min(ys)
            img_x1, img_y1 = max(xs), max(ys)

            x0 = img_x0 * scale_x
            y0 = img_y0 * scale_y
            x1 = img_x1 * scale_x
            y1 = img_y1 * scale_y
            h  = y1 - y0

            tokens  = text.split()
            if not tokens:
                continue
            token_w = (x1 - x0) / len(tokens)
            for j, token in enumerate(tokens):
                tx0 = x0 + j * token_w
                tx1 = tx0 + token_w
                words.append({
                    "text"      : token,
                    "box"       : [round(tx0, 2), round(y0, 2), round(tx1, 2), round(y1, 2)],
                    "font_size" : round(h * 0.75, 1),
                    "font_family": "Arial, sans-serif",
                    "bold"      : False,
                    "italic"    : False,
                    "color"     : 0,
                    "baseline_y": round(y1, 2),
                    "confidence": round(float(conf), 3),
                    "source"    : "ocr",
                })

    return words
