import io

from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE_TYPE

from models.documents import ExtractedDocument, Segment
from services.cleaner import clean_text
from services.errors import DocumentError
from services.extractors.common import MAX_PAGES, ensure_has_text


def _shape_lines(shape, skip_id=None) -> list[str]:
    if skip_id is not None and getattr(shape, "shape_id", None) == skip_id:
        return []
    if shape.shape_type == MSO_SHAPE_TYPE.GROUP:
        lines: list[str] = []
        for sub in shape.shapes:
            lines.extend(_shape_lines(sub, skip_id))
        return lines
    lines = []
    if getattr(shape, "has_table", False) and shape.has_table:
        for row in shape.table.rows:
            cells = [" ".join(c.text.split()) for c in row.cells]
            cells = [c for c in cells if c]
            if cells:
                lines.append(" | ".join(cells))
    elif getattr(shape, "has_text_frame", False) and shape.has_text_frame:
        for para in shape.text_frame.paragraphs:
            text = "".join(run.text for run in para.runs).strip() or para.text.strip()
            if text:
                lines.append(f"- {text}" if para.level > 0 else text)
    return lines


def _reading_order(shape) -> tuple[int, int]:
    return (getattr(shape, "top", 0) or 0, getattr(shape, "left", 0) or 0)


def extract_pptx(data: bytes) -> ExtractedDocument:
    try:
        prs = Presentation(io.BytesIO(data))
    except Exception:
        raise DocumentError("This PowerPoint file could not be opened. It may be damaged.")

    slide_count = len(prs.slides)
    if slide_count > MAX_PAGES:
        raise DocumentError(f"This presentation has {slide_count} slides. The limit is {MAX_PAGES}.")

    segments: list[Segment] = []
    for number, slide in enumerate(prs.slides, start=1):
        lines: list[str] = []
        title_shape = slide.shapes.title
        skip_id = None
        if title_shape is not None and title_shape.has_text_frame and title_shape.text_frame.text.strip():
            lines.append(title_shape.text_frame.text.strip())
            skip_id = title_shape.shape_id
        for shape in sorted(slide.shapes, key=_reading_order):
            lines.extend(_shape_lines(shape, skip_id))
        if slide.has_notes_slide:
            notes = slide.notes_slide.notes_text_frame.text.strip() if slide.notes_slide.notes_text_frame else ""
            if notes:
                lines.append(f"Speaker notes: {notes}")
        text = clean_text("\n".join(lines))
        if text:
            segments.append(Segment(text=text, source={"type": "pptx", "slide": number}))

    ensure_has_text(sum(len(s.text) for s in segments))
    return ExtractedDocument(file_type="pptx", segments=segments, page_count=slide_count)
