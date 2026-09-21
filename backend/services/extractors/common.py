import re
from collections import Counter
from math import ceil

from services.errors import DocumentError

MAX_PAGES = 400
MIN_TOTAL_CHARS = 100

_PAGE_NUM = re.compile(r"^(page\s*)?\d{1,3}(\s*(/|of)\s*\d{1,3})?$", re.I)


def _norm(line: str) -> str:
    return re.sub(r"\d+", "#", line.strip().lower())


def _edge_indexes(lines: list[str], edge: int = 2) -> set[int]:
    """Indexes of the first/last few non-empty lines, always leaving at least one middle line."""
    idx = [i for i, ln in enumerate(lines) if ln.strip()]
    k = min(edge, (len(idx) - 1) // 2)
    return set(idx[:k] + idx[len(idx) - k :]) if k > 0 else set()


def strip_page_furniture(pages: list[str]) -> list[str]:
    """Remove page numbers and running headers/footers that repeat across pages."""
    split = [p.split("\n") for p in pages]
    counts: Counter[str] = Counter()
    for lines in split:
        counts.update({_norm(lines[i]) for i in _edge_indexes(lines)})
    threshold = max(3, ceil(0.5 * len(pages)))
    repeated = {k for k, c in counts.items() if k and c >= threshold and len(k) <= 120}

    cleaned = []
    for lines in split:
        drop = set()
        for i in _edge_indexes(lines):
            line = lines[i].strip()
            if _PAGE_NUM.match(line) or (len(pages) >= 4 and _norm(line) in repeated):
                drop.add(i)
        cleaned.append("\n".join(ln for i, ln in enumerate(lines) if i not in drop))
    return cleaned


def ensure_has_text(total_chars: int) -> None:
    if total_chars < MIN_TOTAL_CHARS:
        raise DocumentError(
            "No readable text was found. Scanned or image-only documents aren't supported yet."
        )
