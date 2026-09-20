"""Split an extracted document into chunks sized for one AI request.

Chunks break at headings, slide changes and paragraph boundaries where possible, and each
chunk carries [Page N] / [Slide N] / [Section: X] marker lines so generated questions can
cite their source.
"""
import re
from dataclasses import dataclass

from models.documents import Chunk, ExtractedDocument

# Each chunk costs one AI request, and free-tier request quotas are tight, so chunks are generous.
TARGET_CHARS = 8000  # ~2,000 tokens: flush at the next paragraph once a chunk reaches this
MAX_CHARS = 12000  # hard ceiling for a chunk
MIN_CHARS = 4000  # don't start a new chunk at a heading until the current one has this much

_SMALL_WORDS = {"a", "an", "the", "of", "and", "or", "in", "on", "to", "for", "vs", "with", "by", "at", "is", "as"}
_NUMBERED = re.compile(r"^\d+(\.\d+)*[.)]?\s+\S")
_BULLET = re.compile(r"^[•\-*▪◦‣–]\s")


def looks_like_heading(line: str) -> bool:
    """Heuristic for PDFs, which have no real heading information."""
    s = line.strip()
    if not 3 <= len(s) <= 80 or s[-1] in ".,;:!?" or _BULLET.match(s):
        return False
    words = s.split()
    if len(words) > 10 or not any(c.isalpha() for c in s):
        return False
    if s.isupper():
        return True
    if _NUMBERED.match(s):
        return True
    significant = [w for w in words if w.lower().strip("()") not in _SMALL_WORDS]
    if not significant or len(words) > 8:
        return False
    return sum(1 for w in significant if w[0].isupper()) / len(significant) >= 0.8


@dataclass
class _Unit:
    text: str
    source: dict
    is_heading: bool
    is_break: bool  # a good place to start a new chunk


def _split_pdf_text(text: str):
    for para in re.split(r"\n\s*\n", text):
        buf: list[str] = []
        for line in (ln.strip() for ln in para.split("\n")):
            if not line:
                continue
            if looks_like_heading(line):
                if buf:
                    yield "\n".join(buf), False
                    buf = []
                yield line, True
            else:
                buf.append(line)
        if buf:
            yield "\n".join(buf), False


def _units(doc: ExtractedDocument) -> list[_Unit]:
    units: list[_Unit] = []
    for seg in doc.segments:
        kind = seg.source.get("type")
        if seg.is_heading:
            pieces = [(seg.text.strip(), True)]
        elif kind == "pdf":
            pieces = list(_split_pdf_text(seg.text))
        else:
            pieces = [(seg.text.strip(), False)]
        for text, heading in pieces:
            if text:
                units.append(_Unit(text, seg.source, heading, heading or kind == "pptx"))
    return units


def _split_text(text: str, limit: int) -> list[str]:
    """Split oversized text at sentence ends (or spaces as a last resort)."""
    out: list[str] = []
    cur = ""
    for sentence in re.split(r"(?<=[.!?])\s+", text):
        while len(sentence) > limit:
            cut = sentence.rfind(" ", 0, limit)
            cut = cut if cut > 0 else limit
            if cur:
                out.append(cur)
                cur = ""
            out.append(sentence[:cut])
            sentence = sentence[cut:].lstrip()
        if cur and len(cur) + 1 + len(sentence) > limit:
            out.append(cur)
            cur = sentence
        else:
            cur = f"{cur} {sentence}" if cur else sentence
    if cur:
        out.append(cur)
    return out


def _expand_long(units: list[_Unit], max_chars: int, target: int) -> list[_Unit]:
    result: list[_Unit] = []
    for u in units:
        if len(u.text) <= max_chars:
            result.append(u)
            continue
        for i, part in enumerate(_split_text(u.text, target)):
            result.append(_Unit(part, u.source, u.is_heading and i == 0, u.is_break and i == 0))
    return result


def _label(source: dict) -> str | None:
    kind = source.get("type")
    if kind == "pdf":
        return f"[Page {source['page']}]"
    if kind == "pptx":
        return f"[Slide {source['slide']}]"
    if kind == "docx" and source.get("section"):
        return f"[Section: {source['section']}]"
    return None


def chunk_document(
    doc: ExtractedDocument,
    target: int = TARGET_CHARS,
    max_chars: int = MAX_CHARS,
    min_chars: int = MIN_CHARS,
) -> list[Chunk]:
    units = _expand_long(_units(doc), max_chars, target)
    # A document that fits in one request stays in one chunk: fewer requests, and the AI sees all of it.
    fits_in_one = sum(len(u.text) + 40 for u in units) <= max_chars

    chunks: list[Chunk] = []
    parts: list[str] = []
    length = 0
    sources: list[dict] = []
    last_label: str | None = None
    chunk_heading: str | None = None
    heading_locked = False
    carried_heading: str | None = None

    def piece(unit: _Unit) -> str:
        label = _label(unit.source)
        return f"{label}\n{unit.text}" if label and label != last_label else unit.text

    def flush() -> None:
        nonlocal parts, length, sources, last_label, chunk_heading, heading_locked
        if parts:
            chunks.append(Chunk(len(chunks), "\n\n".join(parts), sources, chunk_heading))
        parts, length, sources = [], 0, []
        last_label, chunk_heading, heading_locked = None, None, False

    for u in units:
        if parts:
            size = length + 2 + len(piece(u))
            soft_break = not fits_in_one and ((length >= min_chars and u.is_break) or length >= target)
            if size > max_chars or soft_break:
                flush()
        if not parts:
            chunk_heading = carried_heading
        text = piece(u)
        length += len(text) + (2 if parts else 0)
        parts.append(text)
        last_label = _label(u.source) or last_label
        if u.source not in sources:
            sources.append(u.source)
        if u.is_heading:
            carried_heading = u.text
            if not heading_locked:
                chunk_heading, heading_locked = u.text, True
    flush()

    # fold a tiny final chunk into the one before it
    if len(chunks) >= 2 and chunks[-1].char_count < min_chars // 2:
        prev, last = chunks[-2], chunks[-1]
        if prev.char_count + 2 + last.char_count <= max_chars:
            prev.text = f"{prev.text}\n\n{last.text}"
            prev.sources += [s for s in last.sources if s not in prev.sources]
            chunks.pop()
    return chunks
