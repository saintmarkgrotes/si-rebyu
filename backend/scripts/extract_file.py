"""Try the extraction pipeline on a real file.

Run from the backend folder:
    .venv\\Scripts\\python.exe scripts\\extract_file.py "C:\\path\\to\\file.pdf"
Add --full to print every chunk's complete text.
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.chunker import chunk_document  # noqa: E402
from services.errors import DocumentError  # noqa: E402
from services.extractors import extract_document  # noqa: E402
from services.file_validation import validate_upload  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract and chunk a PDF, DOCX or PPTX.")
    parser.add_argument("path")
    parser.add_argument("--full", action="store_true", help="print the complete text of every chunk")
    args = parser.parse_args()

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    path = Path(args.path)
    data = path.read_bytes()
    try:
        file_type = validate_upload(path.name, data)
        doc = extract_document(data, file_type)
    except DocumentError as err:
        print(f"REJECTED: {err}")
        return 1

    chunks = chunk_document(doc)
    total = sum(len(s.text) for s in doc.segments)
    print(f"File:      {path.name} ({file_type}, {len(data) / 1024:.0f} KB)")
    print(f"Pages/slides: {doc.page_count}")
    print(f"Segments:  {len(doc.segments)}   Characters: {total:,}")
    print(f"Chunks:    {len(chunks)}\n")
    for c in chunks:
        print(f"--- chunk {c.index + 1}/{len(chunks)}  {c.char_count:,} chars  heading: {c.heading!r}")
        print(f"    sources: {c.sources}")
        body = c.text if args.full else c.text[:300].replace("\n", " ⏎ ") + ("…" if c.char_count > 300 else "")
        print(f"    {body}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
