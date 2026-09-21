"""Text cleanup applied to extracted text before chunking."""
import re
import unicodedata

_LIGATURES = {"ﬀ": "ff", "ﬁ": "fi", "ﬂ": "fl", "ﬃ": "ffi", "ﬄ": "ffl", "ﬅ": "st", "ﬆ": "st"}
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_BULLET_START = re.compile(r"^([•\-*▪◦‣–]|\d+[.)]|[a-zA-Z][.)])\s")
_TERMINAL = ".!?:;"


def clean_text(text: str) -> str:
    # NFC (not NFKC) so math like "x²" is preserved; ligatures are fixed explicitly.
    text = unicodedata.normalize("NFC", text)
    for lig, plain in _LIGATURES.items():
        text = text.replace(lig, plain)
    text = text.replace("\r\n", "\n").replace("\r", "\n").replace("\u00a0", " ").replace("\u00ad", "")
    text = _CONTROL.sub("", text)
    # words split by a hyphen at a line break: "net-\nwork" -> "network"
    text = re.sub(r"(\w)-\n(?=[a-z])", r"\1", text)

    lines = [re.sub(r"[ \t]+", " ", ln).strip() for ln in text.split("\n")]
    out: list[str] = []
    for ln in lines:
        if not ln:
            out.append("")
        elif out and out[-1] and _is_continuation(out[-1], ln):
            out[-1] = f"{out[-1]} {ln}"  # a sentence wrapped onto the next line
        else:
            out.append(ln)
    return re.sub(r"\n{3,}", "\n\n", "\n".join(out)).strip()


def _is_continuation(prev: str, nxt: str) -> bool:
    if prev[-1] in _TERMINAL or _BULLET_START.match(nxt):
        return False
    return nxt[0].islower()
