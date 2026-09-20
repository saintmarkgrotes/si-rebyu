"""Never trust AI output: every item is checked, normalised or rejected before it can be saved."""
import hashlib
import random
import re
from dataclasses import dataclass, field

from pydantic import ValidationError

from models.ai_output import FlashcardOut, QuestionOut
from models.documents import Chunk

_DIFFICULTIES = {"easy", "medium", "hard"}
_TYPE_ALIASES = {
    "multiple choice": "multiple_choice", "multiple-choice": "multiple_choice", "mcq": "multiple_choice",
    "mc": "multiple_choice", "true/false": "true_false", "true false": "true_false",
    "true-false": "true_false", "tf": "true_false", "short answer": "short_answer",
    "short-answer": "short_answer", "identify": "identification",
}
_LETTER_PREFIX = re.compile(r"^\(?([A-Da-d])[.)]\s+")
_SINGLE_LETTER = re.compile(r"^\(?([A-Da-d])[.)]?$")
_TF_PREFIX = re.compile(r"^\s*true\s*(or|/)\s*false\s*[:\-]\s*", re.I)
_META_REFERENCE = re.compile(
    r"\b(according to|based on|in|from) (the|this|that) (given |provided |above |following )?"
    r"(text|passage|document|material|excerpt|slide|page|reading|notes)\b",
    re.I,
)
_EXPLANATION_OPTIONAL = {"identification", "short_answer"}
_NONE_OF_ABOVE = re.compile(r"\b(all|none) of the (above|these)\b", re.I)


@dataclass
class ValidatedBatch:
    flashcards: list[FlashcardOut] = field(default_factory=list)
    questions: list[QuestionOut] = field(default_factory=list)
    rejected: list[str] = field(default_factory=list)


def _text(value, max_len: int) -> str | None:
    if not isinstance(value, str):
        return None
    s = " ".join(value.split())
    return s if s and len(s) <= max_len else None


def _stems(text: str) -> set[str]:
    """Rough word roots (first 5 letters of words with 4+ characters), so 'routers' matches 'router'."""
    return {w[:5] for w in re.findall(r"[a-z0-9]{4,}", text.lower())}


def _grounded(text: str, chunk_stems: set[str]) -> bool:
    """Cheap hallucination filter: most of the answer's wording must appear in the source chunk."""
    stems = _stems(text)
    if len(stems) < 3:
        return True
    return sum(1 for s in stems if s in chunk_stems) / len(stems) >= 0.4


def _difficulty(value) -> str:
    v = value.strip().lower() if isinstance(value, str) else ""
    return v if v in _DIFFICULTIES else "medium"


def _topic(value, allowed: dict[str, str] | None) -> str | None:
    t = _text(value, 80) or "General"
    if allowed is None:
        return t
    return allowed.get(t.lower())


def _resolve_source(value, chunk: Chunk) -> dict:
    """Keep the AI's source only if it really is in this chunk; otherwise fall back to the chunk's range."""
    if not chunk.sources:
        return {}
    kind = chunk.sources[0].get("type")
    claimed = value if isinstance(value, dict) else {}

    if kind in ("pdf", "pptx"):
        key = "page" if kind == "pdf" else "slide"
        numbers = sorted({s[key] for s in chunk.sources if key in s})
        try:
            n = int(claimed.get(key))
        except (TypeError, ValueError):
            n = None
        if n in numbers:
            return {"type": kind, key: n}
        if len(numbers) == 1:
            return {"type": kind, key: numbers[0]}
        return {"type": kind, f"{key}_start": numbers[0], f"{key}_end": numbers[-1]}

    sections = [s["section"] for s in chunk.sources if s.get("section")]
    claimed_section = claimed.get("section")
    if isinstance(claimed_section, str):
        for s in sections:
            if s.lower() == claimed_section.strip().lower():
                return {"type": kind, "section": s}
    return {"type": kind, "section": sections[0]} if sections else {"type": kind}


def _norm_type(value) -> str:
    t = value.strip().lower() if isinstance(value, str) else ""
    return _TYPE_ALIASES.get(t, t.replace(" ", "_").replace("-", "_"))


def _validate_choices(item: dict, correct_raw: str, question: str) -> tuple[list[str], str] | str:
    """Return (shuffled choices, correct answer text) or a rejection reason."""
    raw = item.get("choices")
    if not isinstance(raw, list) or len(raw) != 4:
        return "needs exactly 4 choices"
    choices = [_text(c, 300) for c in raw]
    if any(c is None for c in choices):
        return "has an empty or oversized choice"
    lettered = all(_LETTER_PREFIX.match(c) for c in choices)
    if lettered:
        choices = [_LETTER_PREFIX.sub("", c) for c in choices]
    if len({c.casefold() for c in choices}) != 4:
        return "has duplicate choices"
    if any(_NONE_OF_ABOVE.search(c) for c in choices):
        return "uses 'all/none of the above'"

    answer = correct_raw
    letter = _SINGLE_LETTER.match(answer)
    if letter:
        answer = choices[ord(letter.group(1).upper()) - ord("A")]
    else:
        answer = _LETTER_PREFIX.sub("", answer)
    match = next((c for c in choices if c.casefold() == answer.casefold()), None)
    if match is None:
        return "correct answer is not one of the choices"

    seed = int(hashlib.md5(question.encode("utf-8")).hexdigest(), 16)
    random.Random(seed).shuffle(choices)  # AI answers cluster in one position; shuffle, repeatably
    return choices, match


def _validate_question(item, chunk, chunk_stems, allowed_types, allowed_topics) -> QuestionOut | str:
    if not isinstance(item, dict):
        return "question is not an object"
    qtype = _norm_type(item.get("type"))
    if qtype not in allowed_types:
        return f"type '{qtype or '?'}' was not requested"

    question = _text(item.get("question"), 800)
    explanation = _text(item.get("explanation"), 800)
    if not question:
        return "missing question text"
    if not explanation or len(explanation) < 5:
        # Models sometimes skip these for the two short-answer types. Those items stay useful without one,
        # but every other type needs it: the explanation is what teaches after a wrong answer.
        if qtype not in _EXPLANATION_OPTIONAL:
            return "missing explanation"
        explanation = ""
    if _META_REFERENCE.search(question):
        return "question refers to 'the text' instead of standing alone"

    correct_value = item.get("correct_answer")
    if isinstance(correct_value, bool):
        correct_value = "True" if correct_value else "False"
    correct = _text(correct_value, 800)
    if not correct:
        return "missing correct answer"

    choices: list[str] | None = None
    if qtype == "multiple_choice" or (qtype == "scenario" and item.get("choices")):
        result = _validate_choices(item, correct, question)
        if isinstance(result, str):
            return result
        choices, correct = result
    elif qtype == "true_false":
        question = _TF_PREFIX.sub("", question)
        if correct.strip().lower() not in ("true", "false"):
            return "true/false answer must be True or False"
        correct = correct.strip().capitalize()
    elif qtype == "identification":
        if len(correct) > 200:
            return "identification answer is too long"
    elif qtype == "scenario" and len(question) < 30:
        return "scenario is too short"

    # Check the answer against the source. With no explanation to lean on, also check the question's wording.
    check = f"{correct} {explanation}"
    if qtype == "true_false" or not explanation:
        check += f" {question}"
    if not _grounded(check, chunk_stems):
        return "not supported by the source text"

    topic = _topic(item.get("topic"), allowed_topics)
    if topic is None:
        return "topic was not selected"
    try:
        return QuestionOut(
            type=qtype, question=question, choices=choices, correct_answer=correct,
            explanation=explanation, topic=topic, difficulty=_difficulty(item.get("difficulty")),
            source=_resolve_source(item.get("source"), chunk),
        )
    except ValidationError:
        return "did not match the expected format"


def _validate_flashcard(item, chunk, chunk_stems, allowed_topics) -> FlashcardOut | str:
    if not isinstance(item, dict):
        return "flashcard is not an object"
    question, answer = _text(item.get("question"), 400), _text(item.get("answer"), 800)
    if not question or not answer:
        return "flashcard missing question or answer"
    if _META_REFERENCE.search(question):
        return "flashcard refers to 'the text' instead of standing alone"
    if not _grounded(answer, chunk_stems):
        return "flashcard answer not supported by the source text"
    topic = _topic(item.get("topic"), allowed_topics)
    if topic is None:
        return "topic was not selected"
    try:
        return FlashcardOut(
            question=question, answer=answer, topic=topic, difficulty=_difficulty(item.get("difficulty")),
            source=_resolve_source(item.get("source"), chunk),
        )
    except ValidationError:
        return "did not match the expected format"


def validate_batch(
    data, chunk: Chunk, allowed_types: set[str], allowed_topics: list[str] | None = None
) -> ValidatedBatch:
    """Validate one AI reply against the chunk it was generated from."""
    batch = ValidatedBatch()
    if not isinstance(data, dict):
        batch.rejected.append("reply was not a JSON object")
        return batch
    stems = _stems(chunk.text)
    topics = {t.lower(): t for t in allowed_topics} if allowed_topics else None

    for item in data.get("flashcards") or []:
        result = _validate_flashcard(item, chunk, stems, topics)
        (batch.rejected.append(result) if isinstance(result, str) else batch.flashcards.append(result))
    for item in data.get("questions") or []:
        result = _validate_question(item, chunk, stems, allowed_types, topics)
        (batch.rejected.append(result) if isinstance(result, str) else batch.questions.append(result))
    return batch


class Deduper:
    """Drops repeated items, including near-identical rewordings, across all requests of a job."""

    def __init__(self) -> None:
        self._exact: set[str] = set()
        self._words: list[frozenset[str]] = []

    def seen_before(self, text: str) -> bool:
        words = re.findall(r"[a-z0-9]+", text.lower())
        key = " ".join(words)
        if key in self._exact:
            return True
        ws = frozenset(words)
        if len(ws) >= 5:
            for other in self._words:
                if len(other) >= 5 and len(ws & other) / len(ws | other) >= 0.85:
                    return True
        self._exact.add(key)
        self._words.append(ws)
        return False
