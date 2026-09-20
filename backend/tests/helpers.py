"""Build small real PDF / DOCX / PPTX files for tests, so no binary fixtures need committing."""
import io

from docx import Document
from pptx import Presentation
from pptx.util import Inches
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas


def make_pdf(pages: list[list[str]], header: str | None = None, page_numbers: bool = False) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    for n, lines in enumerate(pages, start=1):
        if header:
            c.drawString(72, 760, header)
        y = 720
        for line in lines:
            c.drawString(72, y, line)
            y -= 16
        if page_numbers:
            c.drawString(300, 40, f"Page {n}")
        c.showPage()
    c.save()
    return buf.getvalue()


def make_blank_pdf(pages: int = 3) -> bytes:
    """Pages that contain only a drawn shape, like a scan: no extractable text."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    for _ in range(pages):
        c.rect(100, 100, 300, 300, fill=1)
        c.showPage()
    c.save()
    return buf.getvalue()


def make_docx() -> bytes:
    doc = Document()
    doc.add_heading("Networking Basics", level=1)
    doc.add_paragraph("A network connects computers so they can share data with each other.")
    doc.add_heading("VLANs", level=2)
    doc.add_paragraph("A VLAN is a logical network that separates traffic on the same switch.")
    doc.add_paragraph("Access ports carry one VLAN", style="List Bullet")
    table = doc.add_table(rows=2, cols=2)
    table.rows[0].cells[0].text = "Protocol"
    table.rows[0].cells[1].text = "Purpose"
    table.rows[1].cells[0].text = "DHCP"
    table.rows[1].cells[1].text = "Assigns IP addresses"
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def make_pptx() -> bytes:
    prs = Presentation()
    s1 = prs.slides.add_slide(prs.slide_layouts[1])
    s1.shapes.title.text = "What is a VLAN?"
    tf = s1.placeholders[1].text_frame
    tf.text = "A logical network on a switch"
    tf.add_paragraph().text = "Separates broadcast domains"
    s1.notes_slide.notes_text_frame.text = "Mention 802.1Q tagging here."
    s2 = prs.slides.add_slide(prs.slide_layouts[5])
    s2.shapes.title.text = "Protocols"
    table = s2.shapes.add_table(2, 2, Inches(1), Inches(2), Inches(6), Inches(1.5)).table
    table.cell(0, 0).text = "DHCP"
    table.cell(0, 1).text = "Assigns IP addresses"
    table.cell(1, 0).text = "DNS"
    table.cell(1, 1).text = "Resolves names"
    buf = io.BytesIO()
    prs.save(buf)
    return buf.getvalue()
