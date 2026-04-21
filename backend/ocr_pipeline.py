"""
PaddleOCR wrapper — CPU-only, singleton worker, lazy-loaded.
Normalises bounding boxes from image pixels → PDF point space.
"""

from __future__ import annotations

_ocr = None


def _get_ocr():
    global _ocr
    if _ocr is None:
        from paddleocr import PaddleOCR
        _ocr = PaddleOCR(
            use_angle_cls=True,
            lang="en",
            use_gpu=False,
            show_log=False,
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

    PaddleOCR returns line-level boxes:
      [ [[x1,y1],[x2,y1],[x2,y2],[x1,y2]],  (text, confidence) ]
    We split each line into individual tokens and distribute the box width evenly.
    """
    ocr = _get_ocr()
    result = ocr.ocr(image_path, cls=True)

    if not result or not result[0]:
        return []

    scale_x = pdf_w / img_w
    scale_y = pdf_h / img_h

    words = []
    for line in result[0]:
        box_pts, (text, conf) = line
        text = text.strip()
        if not text or conf < 0.3:
            continue

        xs = [p[0] for p in box_pts]
        ys = [p[1] for p in box_pts]
        img_x0, img_y0 = min(xs), min(ys)
        img_x1, img_y1 = max(xs), max(ys)

        # Convert to PDF space
        x0 = img_x0 * scale_x
        y0 = img_y0 * scale_y
        x1 = img_x1 * scale_x
        y1 = img_y1 * scale_y
        h = y1 - y0

        # Split line into individual word tokens, distributing width evenly
        tokens = text.split()
        if not tokens:
            continue
        token_w = (x1 - x0) / len(tokens)
        for j, token in enumerate(tokens):
            tx0 = x0 + j * token_w
            tx1 = tx0 + token_w
            words.append({
                "text": token,
                "box": [round(tx0, 2), round(y0, 2), round(tx1, 2), round(y1, 2)],
                "font_size": round(h * 0.75, 1),
                "font_family": "Arial, sans-serif",
                "bold": False,
                "italic": False,
                "color": 0,
                "baseline_y": round(y1, 2),
                "confidence": round(float(conf), 3),
                "source": "ocr",
            })

    return words
