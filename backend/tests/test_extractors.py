import pytest

from services.errors import DocumentError
from services.extractors import extract_document
from tests.helpers import make_blank_pdf, make_docx, make_pdf, make_pptx


def _pages(doc):
    return [s.source["page"] for s in doc.segments]


def test_pdf_text_and_page_numbers():
    pdf = make_pdf([[f"Page body number {n} explains VLAN tagging in detail with enough words."] for n in range(1, 4)])
    doc = extract_document(pdf, "pdf")
    assert doc.page_count == 3
    assert _pages(doc) == [1, 2, 3]
    assert "number 2 explains VLAN" in doc.segments[1].text
    assert all(s.source["type"] == "pdf" for s in doc.segments)


def test_pdf_strips_repeated_headers_and_page_numbers():
    pages = [[f"Unique content for page {n} about routing and switching concepts."] for n in range(1, 7)]
    doc = extract_document(make_pdf(pages, header="Computer Networking Module", page_numbers=True), "pdf")
    joined = "\n".join(s.text for s in doc.segments)
    assert "Computer Networking Module" not in joined
    assert "Page 3" not in joined
    assert "Unique content for page 3" in joined


def test_scanned_pdf_gives_clear_error():
    with pytest.raises(DocumentError, match="No readable text"):
        extract_document(make_blank_pdf(), "pdf")


def test_corrupt_files_give_document_errors():
    for kind in ("pdf", "docx", "pptx"):
        with pytest.raises(DocumentError):
            extract_document(b"%PDF-1.4 garbage" if kind == "pdf" else b"PK\x03\x04junk", kind)


def test_docx_headings_sections_lists_and_tables():
    doc = extract_document(make_docx(), "docx")
    assert doc.page_count is None
    headings = [s.text for s in doc.segments if s.is_heading]
    assert headings == ["Networking Basics", "VLANs"]
    vlan_body = next(s for s in doc.segments if s.text.startswith("A VLAN is"))
    assert vlan_body.source == {"type": "docx", "section": "VLANs"}
    assert any(s.text == "- Access ports carry one VLAN" for s in doc.segments)
    table = next(s for s in doc.segments if "DHCP" in s.text)
    assert table.text == "Protocol | Purpose\nDHCP | Assigns IP addresses"


def test_pptx_slides_titles_tables_and_notes():
    doc = extract_document(make_pptx(), "pptx")
    assert doc.page_count == 2
    s1, s2 = doc.segments
    assert s1.source == {"type": "pptx", "slide": 1}
    assert s1.text.splitlines()[0] == "What is a VLAN?"
    assert "Separates broadcast domains" in s1.text
    assert "Speaker notes: Mention 802.1Q tagging here." in s1.text
    assert s2.source == {"type": "pptx", "slide": 2}
    assert "DHCP | Assigns IP addresses" in s2.text


def test_unknown_type_is_rejected():
    with pytest.raises(DocumentError):
        extract_document(b"x", "exe")
