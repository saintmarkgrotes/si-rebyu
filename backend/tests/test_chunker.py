import re

import pytest

from models.documents import ExtractedDocument, Segment
from services.chunker import MAX_CHARS, chunk_document, looks_like_heading

_MARKER = re.compile(r"^\[(Page \d+|Slide \d+|Section: .*)\]$", re.M)


def _words(text: str) -> list[str]:
    return sorted(re.findall(r"\w+", _MARKER.sub("", text)))


def _para(n: int, size: int = 1500) -> str:
    sentence = f"Sentence {n} describes an important networking idea in reasonable detail. "
    return (sentence * (size // len(sentence) + 1))[:size].rstrip()


def _pdf_doc(pages: int, size: int = 1500) -> ExtractedDocument:
    segs = [Segment(_para(n, size), {"type": "pdf", "page": n}) for n in range(1, pages + 1)]
    return ExtractedDocument("pdf", segs, pages)


def test_small_document_is_one_chunk_with_marker():
    chunks = chunk_document(_pdf_doc(1, 500))
    assert len(chunks) == 1
    assert chunks[0].text.startswith("[Page 1]\n")
    assert chunks[0].sources == [{"type": "pdf", "page": 1}]


def test_large_document_splits_in_order_and_keeps_all_content():
    doc = _pdf_doc(30)
    chunks = chunk_document(doc)
    assert len(chunks) > 1
    assert all(c.char_count <= MAX_CHARS for c in chunks)
    assert [c.index for c in chunks] == list(range(len(chunks)))
    pages = [s["page"] for c in chunks for s in c.sources]
    assert pages == sorted(set(pages)) == list(range(1, 31))
    assert _words("\n\n".join(c.text for c in chunks)) == _words("\n\n".join(s.text for s in doc.segments))


def test_breaks_at_docx_headings():
    segs = []
    for n in range(1, 7):
        src = {"type": "docx", "section": f"Sec {n}"}
        segs.append(Segment(f"Sec {n}", src, is_heading=True))
        segs.append(Segment(_para(n, 3000), src))
    chunks = chunk_document(ExtractedDocument("docx", segs, None))
    assert len(chunks) > 1
    for c in chunks:
        assert c.text.split("\n")[1].startswith("Sec ")  # marker line, then the heading itself
        assert c.heading and c.heading.startswith("Sec ")


def test_slides_are_never_split():
    segs = [Segment(f"Slide title {n}\n" + _para(n, 1200), {"type": "pptx", "slide": n}) for n in range(1, 21)]
    chunks = chunk_document(ExtractedDocument("pptx", segs, 20))
    assert len(chunks) > 1
    text = "\n".join(c.text for c in chunks)
    for n in range(1, 21):
        assert text.count(f"[Slide {n}]") == 1


def test_oversized_paragraph_is_split_without_losing_words():
    big = " ".join(f"Sentence {i} is here." for i in range(3000))
    doc = ExtractedDocument("docx", [Segment(big, {"type": "docx", "section": None})], None)
    chunks = chunk_document(doc)
    assert len(chunks) > 1
    assert all(c.char_count <= MAX_CHARS for c in chunks)
    assert _words("\n\n".join(c.text for c in chunks)) == _words(big)


def test_pdf_headings_are_detected_inside_pages():
    text = "Introduction to VLANs\nA VLAN is a logical network on a switch.\nTrunking\nTrunks carry many VLANs."
    chunks = chunk_document(ExtractedDocument("pdf", [Segment(text, {"type": "pdf", "page": 5})], 5))
    assert chunks[0].heading == "Introduction to VLANs"


def test_empty_document_has_no_chunks():
    assert chunk_document(ExtractedDocument("pdf", [], 0)) == []


@pytest.mark.parametrize(
    "line,expected",
    [
        ("Introduction to VLANs", True),
        ("NATIVE VLAN", True),
        ("2.3 Trunking Protocols", True),
        ("A VLAN is a logical network on a switch.", False),
        ("- Access ports carry one VLAN", False),
        ("Which standard defines tagging?", False),
        ("the router forwards packets", False),
        ("42", False),
    ],
)
def test_looks_like_heading(line, expected):
    assert looks_like_heading(line) is expected


def test_document_that_fits_in_one_request_stays_one_chunk():
    segs = []
    for n in range(1, 5):
        src = {"type": "docx", "section": f"Sec {n}"}
        segs.append(Segment(f"Sec {n}", src, is_heading=True))
        segs.append(Segment(_para(n, 2000), src))
    chunks = chunk_document(ExtractedDocument("docx", segs, None))
    assert len(chunks) == 1
    assert len(chunks[0].sources) == 4
