import io

from pypdf import PdfReader

from models.documents import ExtractedDocument, Segment
from services.cleaner import clean_text
from services.errors import DocumentError
from services.extractors.common import MAX_PAGES, ensure_has_text, strip_page_furniture


def extract_pdf(data: bytes) -> ExtractedDocument:
    try:
        reader = PdfReader(io.BytesIO(data))
        encrypted = reader.is_encrypted
        page_count = len(reader.pages) if not encrypted else 0
    except Exception:
        raise DocumentError("This PDF could not be opened. It may be damaged.")
    if encrypted:
        raise DocumentError("This PDF is password-protected. Remove the password and upload it again.")
    if page_count > MAX_PAGES:
        raise DocumentError(f"This PDF has {page_count} pages. The limit is {MAX_PAGES}.")

    raw = []
    for page in reader.pages:
        try:
            raw.append(page.extract_text() or "")
        except Exception:
            raw.append("")  # one bad page shouldn't sink the whole document

    segments = []
    for number, text in enumerate(strip_page_furniture(raw), start=1):
        text = clean_text(text)
        if text:
            segments.append(Segment(text=text, source={"type": "pdf", "page": number}))

    ensure_has_text(sum(len(s.text) for s in segments))
    return ExtractedDocument(file_type="pdf", segments=segments, page_count=page_count)
