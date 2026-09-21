"""Forgiving JSON parsing for model output."""
import json
import re

_TRAILING_COMMA = re.compile(r",\s*([}\]])")


def parse_json_lenient(text: str):
    """Parse a JSON object from model output, tolerating fences, chatter and truncation.

    Raises ValueError if nothing usable can be recovered.
    """
    s = (text or "").strip()
    s = re.sub(r"^```(?:json)?\s*", "", s, flags=re.I)
    s = re.sub(r"\s*```$", "", s)
    start = s.find("{")
    if start == -1:
        raise ValueError("The AI reply contained no JSON.")
    s = s[start:]

    decoder = json.JSONDecoder()
    for candidate in (s, _TRAILING_COMMA.sub(r"\1", s)):
        try:
            return decoder.raw_decode(candidate)[0]  # ignores any text after the object
        except json.JSONDecodeError:
            pass

    repaired = _close_truncated(s)
    if repaired:
        try:
            return json.loads(_TRAILING_COMMA.sub(r"\1", repaired))
        except json.JSONDecodeError:
            pass
    raise ValueError("The AI reply was not valid JSON.")


def _close_truncated(s: str) -> str | None:
    """Cut a cut-off reply back to its last complete list item and close the open brackets."""
    stack: list[str] = []
    in_string = escaped = False
    safe: tuple[int, list[str]] | None = None
    for i, ch in enumerate(s):
        if in_string:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch in "{[":
            stack.append(ch)
        elif ch in "}]":
            if not stack:
                break
            stack.pop()
            if len(stack) in (1, 2):  # a whole list item (or a whole list) just finished
                safe = (i + 1, list(stack))
    if not safe:
        return None
    end, open_stack = safe
    closers = "".join("}" if c == "{" else "]" for c in reversed(open_stack))
    return s[:end] + closers
