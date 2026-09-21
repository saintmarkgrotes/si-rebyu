"""Server-side upload checks. The browser checks are only a convenience; these are the real ones."""
import io
import zipfile

from services.errors import DocumentError

MAX_UPLOAD_BYTES = 20 * 1024 * 1024
MAX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024  # guards against zip bombs (DOCX/PPTX are zip files)
MAX_ZIP_ENTRIES = 10_000

_MIME = {
    "pdf": {"application/pdf"},
    "docx": {"application/vnd.openxmlformats-officedocument.wordprocessingml.document"},
    "pptx": {"application/vnd.openxmlformats-officedocument.presentationml.presentation"},
}
_REQUIRED_ZIP_ENTRY = {"docx": "word/document.xml", "pptx": "ppt/presentation.xml"}
_GENERIC_MIME = "application/octet-stream"


def validate_upload(filename: str, data: bytes, content_type: str | None = None) -> str:
    """Return the file type ("pdf" | "docx" | "pptx") or raise DocumentError."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in _MIME:
        raise DocumentError("Only PDF, DOCX and PPTX files are supported.")

    if not data:
        raise DocumentError("The file is empty.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise DocumentError(f"The file is too large. The limit is {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.")

    if content_type:
        base = content_type.split(";")[0].strip().lower()
        if base not in _MIME[ext] and base != _GENERIC_MIME:
            raise DocumentError("The file's type doesn't match its extension.")

    # Check the actual bytes, not the name: a renamed program must not get through.
    if ext == "pdf":
        if b"%PDF-" not in data[:1024]:
            raise DocumentError("This file is not a valid PDF.")
    else:
        _check_zip_office_file(data, ext)
    return ext


def _check_zip_office_file(data: bytes, ext: str) -> None:
    bad = DocumentError(f"This file is not a valid {ext.upper()} document.")
    if not zipfile.is_zipfile(io.BytesIO(data)):
        raise bad
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            infos = z.infolist()
            if len(infos) > MAX_ZIP_ENTRIES:
                raise DocumentError("This document is too complex to process.")
            if sum(i.file_size for i in infos) > MAX_UNCOMPRESSED_BYTES:
                raise DocumentError("This document is too large once unpacked.")
            if _REQUIRED_ZIP_ENTRY[ext] not in {i.filename for i in infos}:
                raise bad
    except zipfile.BadZipFile:
        raise bad
