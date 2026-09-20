import io

from docx import Document
from docx.table import Table
from docx.text.paragraph import Paragraph

from models.documents import ExtractedDocument, Segment
from services.cleaner import clean_text
from services.errors import DocumentError
from services.extractors.common import ensure_has_text


def _style_name(paragraph: Paragraph) -> str:
    try:
        return paragraph.style.name or ""
    except Exception:
        return ""


def _table_lines(table: Table) -> list[str]:
    lines = []
    for row in table.rows:
        cells: list[str] = []
        for cell in row.cells:
            text = " ".join(cell.text.split())
            if text and (not cells or cells[-1] != text):  # merged cells repeat; keep one
                cells.append(text)
        if cells:
            lines.append(" | ".join(cells))
    return lines


def extract_docx(data: bytes) -> ExtractedDocument:
    try:
        doc = Document(io.BytesIO(data))
    except Exception:
        raise DocumentError("This Word document could not be opened. It may be damaged.")

    segments: list[Segment] = []
    section: str | None = None

    for child in doc.element.body.iterchildren():
        if child.tag.endswith("}p"):
            para = Paragraph(child, doc)
            text = clean_text(para.text)
            if not text:
                continue
            style = _style_name(para)
            if style == "Title" or style.startswith("Heading"):
                section = text
                segments.append(Segment(text, {"type": "docx", "section": section}, is_heading=True))
            else:
                if style.startswith("List"):
                    text = f"- {text}"
                segments.append(Segment(text, {"type": "docx", "section": section}))
        elif child.tag.endswith("}tbl"):
            lines = _table_lines(Table(child, doc))
            if lines:
                segments.append(Segment("\n".join(lines), {"type": "docx", "section": section}))

    ensure_has_text(sum(len(s.text) for s in segments))
    return ExtractedDocument(file_type="docx", segments=segments, page_count=None)
