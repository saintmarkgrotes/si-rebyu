import io
import zipfile

import pytest

from services import file_validation
from services.errors import DocumentError
from services.file_validation import validate_upload
from tests.helpers import make_docx, make_pdf, make_pptx


def test_accepts_valid_files():
    assert validate_upload("a.pdf", make_pdf([["hello"]])) == "pdf"
    assert validate_upload("A.DOCX", make_docx()) == "docx"
    assert validate_upload("s.pptx", make_pptx()) == "pptx"


@pytest.mark.parametrize("name", ["virus.exe", "notes.txt", "noextension", "old.doc", "old.ppt"])
def test_rejects_unsupported_extensions(name):
    with pytest.raises(DocumentError):
        validate_upload(name, b"whatever")


def test_rejects_program_renamed_to_pdf():
    with pytest.raises(DocumentError):
        validate_upload("report.pdf", b"MZ\x90\x00" + b"\x00" * 200)


def test_rejects_docx_renamed_to_pptx():
    with pytest.raises(DocumentError):
        validate_upload("deck.pptx", make_docx())


def test_rejects_non_zip_office_file():
    with pytest.raises(DocumentError):
        validate_upload("a.docx", b"not a zip file")


def test_rejects_empty_and_oversized(monkeypatch):
    with pytest.raises(DocumentError):
        validate_upload("a.pdf", b"")
    monkeypatch.setattr(file_validation, "MAX_UPLOAD_BYTES", 100)
    with pytest.raises(DocumentError):
        validate_upload("a.pdf", b"%PDF-" + b"x" * 500)


def test_mime_must_match_extension_but_octet_stream_is_ok():
    pdf = make_pdf([["hello"]])
    assert validate_upload("a.pdf", pdf, "application/pdf") == "pdf"
    assert validate_upload("a.pdf", pdf, "application/octet-stream") == "pdf"
    with pytest.raises(DocumentError):
        validate_upload("a.pdf", pdf, "image/png")


def test_rejects_zip_bomb(monkeypatch):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("word/document.xml", "0" * 10_000)
    monkeypatch.setattr(file_validation, "MAX_UNCOMPRESSED_BYTES", 1_000)
    with pytest.raises(DocumentError):
        validate_upload("a.docx", buf.getvalue())
