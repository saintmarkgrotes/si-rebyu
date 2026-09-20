from dataclasses import dataclass, field


@dataclass
class Segment:
    """A piece of extracted text plus where it came from."""

    text: str
    # {"type": "pdf", "page": 27} | {"type": "pptx", "slide": 12} | {"type": "docx", "section": "VLANs"}
    source: dict
    is_heading: bool = False


@dataclass
class ExtractedDocument:
    file_type: str  # "pdf" | "docx" | "pptx"
    segments: list[Segment]
    page_count: int | None  # pages (PDF) or slides (PPTX); None for DOCX (no fixed pages)


@dataclass
class Chunk:
    """A block of text sized for one AI request."""

    index: int
    # Includes [Page N] / [Slide N] / [Section: X] marker lines so the AI can cite where facts come from.
    text: str
    sources: list[dict] = field(default_factory=list)  # distinct source refs covered, in order
    heading: str | None = None

    @property
    def char_count(self) -> int:
        return len(self.text)
