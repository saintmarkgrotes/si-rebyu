import json
import re

from models.documents import Chunk
from services.ai.base import AIProvider

WORDS = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel", "india", "juliet",
         "kilo", "lima", "mike", "november", "oscar", "papa", "quebec", "romeo", "sierra", "tango",
         "uniform", "victor", "whiskey", "xray", "yankee", "zulu"]


def make_chunk(index: int = 0, pages=(1, 2), extra: str = "") -> Chunk:
    body = " ".join(f"Concept {w} means something specific about switching." for w in WORDS)
    text = "\n\n".join(f"[Page {p}]\n{body}" for p in pages) + extra
    return Chunk(index=index, text=text, sources=[{"type": "pdf", "page": p} for p in pages], heading="Switching")


class FakeProvider(AIProvider):
    """Scripted replies: each call pops the next item (str, dict, or an Exception to raise)."""

    def __init__(self, replies=None):
        self.replies = list(replies or [])
        self.prompts: list[str] = []

    async def generate_json(self, system, prompt, max_output_tokens=8192):
        self.prompts.append(prompt)
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply if isinstance(reply, str) else json.dumps(reply)


class EchoProvider(AIProvider):
    """Reads the requested counts from the prompt and returns that many valid, distinct items."""

    def __init__(self):
        self.prompts: list[str] = []
        self._n = 0

    async def generate_json(self, system, prompt, max_output_tokens=8192):
        self.prompts.append(prompt)
        counts = {k: int(v) for k, v in re.findall(r"^- (\w+): (\d+)$", prompt, re.M)}
        pages = [int(p) for p in re.findall(r"\[Page (\d+)\]", prompt)] or [1]
        cards, questions = [], []
        for _ in range(counts.get("flashcards", 0)):
            w = self._word()
            cards.append({"question": f"What does {w} mean?", "answer": f"Concept {w} means something specific",
                          "topic": "Switching", "difficulty": "easy", "source": {"page": pages[0]}})
        for qtype in ("multiple_choice", "true_false", "identification", "short_answer", "scenario"):
            for _ in range(counts.get(qtype, 0)):
                w = self._word()
                base = {"type": qtype, "question": f"Which concept is described as {w} in switching?",
                        "correct_answer": w, "explanation": f"Concept {w} means something specific about switching.",
                        "topic": "Switching", "difficulty": "medium", "source": {"page": pages[-1]}}
                if qtype == "multiple_choice":
                    base["choices"] = [w, "wrong one", "wrong two", "wrong three"]
                elif qtype == "true_false":
                    base.update(question=f"Concept {w} means something specific about switching.", correct_answer="True")
                elif qtype == "scenario":
                    base["question"] = f"A technician is configuring a switch and must apply the idea of {w} correctly."
                questions.append(base)
        return json.dumps({"flashcards": cards, "questions": questions})

    def _word(self) -> str:
        self._n += 1
        return f"{WORDS[self._n % len(WORDS)]}{self._n}"
