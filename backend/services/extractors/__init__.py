from models.documents import ExtractedDocument
from services.errors import DocumentError
from services.extractors.docx_extractor import extract_docx
from services.extractors.pdf_extractor import extract_pdf
from services.extractors.pptx_extractor import extract_pptx

_EXTRACTORS = {"pdf": extract_pdf, "docx": extract_docx, "pptx": extract_pptx}


def extract_document(data: bytes, file_type: str) -> ExtractedDocument:
    """Extract text + source references from a PDF, DOCX or PPTX (already validated)."""
    try:
        extractor = _EXTRACTORS[file_type]
    except KeyError:
        raise DocumentError("Only PDF, DOCX and PPTX files are supported.")
    return extractor(data)
