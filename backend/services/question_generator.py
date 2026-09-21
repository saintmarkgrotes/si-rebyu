"""chunks -> AI -> validated flashcards and questions.

Requests are spread evenly across the document, kept small enough to fit the model's output limit,
run one at a time through the shared rate-limited client, and merged with de-duplication.
"""
import math
from collections import Counter
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field

from models.ai_output import FlashcardOut, GenerationOptions, GenerationResult, QuestionOut
from models.documents import Chunk
from services.ai.client import AIClient
from services.ai.json_utils import parse_json_lenient
from services.ai.prompts import SYSTEM_PROMPT, build_user_prompt
from services.errors import AIBlockedError, AIConfigError, AIError, AIQuotaError, GenerationError
from services.validator import Deduper, validate_batch

MAX_ITEMS_PER_CALL = 20  # keeps each reply comfortably inside the output-token limit
BUFFER = 1.2  # ask for 20% extra to cover items the validator rejects
_RETRY_NOTE = "Your previous reply could not be used. Reply with valid JSON only, exactly in the shape shown."

ProgressCallback = Callable[[int, int], Awaitable[None]]


@dataclass
class Request:
    chunk: Chunk
    flashcards: int = 0
    questions: dict[str, int] = field(default_factory=dict)

    @property
    def total(self) -> int:
        return self.flashcards + sum(self.questions.values())


def spread(total: int, weights: list[int]) -> list[int]:
    """Split `total` across weights: shares add up exactly and are spread evenly through the document."""
    whole = sum(weights) or 1
    out, prev, cumulative = [], 0, 0
    for w in weights:
        cumulative += w
        current = math.floor(total * cumulative / whole + 0.5)
        out.append(current - prev)
        prev = current
    return out


def split_types(total: int, types: list[str]) -> dict[str, int]:
    base, extra = divmod(total, len(types))
    return {t: base + (1 if i < extra else 0) for i, t in enumerate(types)}


def plan_requests(chunks: list[Chunk], options: GenerationOptions) -> list[Request]:
    weights = [c.char_count for c in chunks]
    flash = spread(options.flashcards, weights)
    per_type = {t: spread(n, weights) for t, n in split_types(options.questions, options.question_types).items()} \
        if options.questions else {}

    requests: list[Request] = []
    for i, chunk in enumerate(chunks):
        wanted = [("flashcards", flash[i])] + [(t, per_type[t][i]) for t in per_type]
        current = Request(chunk)
        for kind, n in wanted:
            while n > 0:
                take = min(n, MAX_ITEMS_PER_CALL - current.total)
                if kind == "flashcards":
                    current.flashcards += take
                else:
                    current.questions[kind] = current.questions.get(kind, 0) + take
                n -= take
                if current.total >= MAX_ITEMS_PER_CALL:
                    requests.append(current)
                    current = Request(chunk)
        if current.total:
            requests.append(current)
    return requests


def _ask(n: int) -> int:
    return n + math.ceil(n * (BUFFER - 1)) if n else 0


@dataclass
class _Outcome:
    flashcards: list[FlashcardOut] = field(default_factory=list)
    questions: list[QuestionOut] = field(default_factory=list)
    rejected: int = 0
    reasons: list[str] = field(default_factory=list)
    failed: bool = False
    calls: int = 0


async def _run_request(req, options, client, known_topics, avoid) -> _Outcome:
    out = _Outcome()
    ask_counts = {t: _ask(n) for t, n in req.questions.items()}
    allowed = set(req.questions)
    retry_note = None
    for _attempt in range(2):
        prompt = build_user_prompt(
            req.chunk, _ask(req.flashcards), ask_counts, options.difficulty,
            options.topics, known_topics, avoid, retry_note,
        )
        out.calls += 1
        try:
            raw = await client.generate_json(SYSTEM_PROMPT, prompt)
        except (AIQuotaError, AIConfigError):
            raise
        except AIBlockedError:
            break
        except AIError:
            out.failed = True
            return out
        try:
            data = parse_json_lenient(raw)
        except ValueError:
            retry_note = _RETRY_NOTE
            continue
        batch = validate_batch(data, req.chunk, allowed, options.topics or None)
        out.flashcards, out.questions, out.rejected = batch.flashcards, batch.questions, len(batch.rejected)
        out.reasons = list(batch.rejected)
        if batch.flashcards or batch.questions or batch.rejected:
            return out
        retry_note = _RETRY_NOTE  # a valid but completely empty reply: try once more
    out.failed = not (out.flashcards or out.questions)
    return out


def _select(pools: list[list], targets: list[int], total: int) -> list[tuple[int, int, object]]:
    """Take each request's share first (even coverage), then top up any shortfall from leftovers."""
    chosen, leftovers = [], []
    for idx, (pool, target) in enumerate(zip(pools, targets)):
        for seq, item in enumerate(pool):
            (chosen if seq < target else leftovers).append((idx, seq, item))
    missing = max(0, total - len(chosen))
    chosen += leftovers[:missing]
    return sorted(chosen, key=lambda t: (t[0], t[1]))[:total]


async def generate_study_materials(
    chunks: list[Chunk],
    options: GenerationOptions,
    client: AIClient,
    progress: ProgressCallback | None = None,
) -> GenerationResult:
    requests = plan_requests(chunks, options)
    if not requests:
        raise GenerationError("There is no readable content to generate from.")

    dedupe_cards, dedupe_questions = Deduper(), Deduper()
    known_topics: list[str] = []
    card_pools: list[list[FlashcardOut]] = []
    question_pools: dict[str, list[list[QuestionOut]]] = {t: [] for t in options.question_types}
    seen_texts: dict[int, list[str]] = {}
    calls = failed = rejected = duplicates = 0
    reasons: Counter[str] = Counter()

    for done, req in enumerate(requests, start=1):
        avoid = seen_texts.setdefault(req.chunk.index, [])
        try:
            outcome = await _run_request(req, options, client, known_topics, avoid)
        except AIQuotaError as err:
            raise GenerationError(str(err))
        except AIConfigError as err:
            raise GenerationError(f"AI is not set up correctly: {err}")
        calls += outcome.calls
        rejected += outcome.rejected
        reasons.update(outcome.reasons)
        failed += 1 if outcome.failed else 0

        cards = [c for c in outcome.flashcards if not dedupe_cards.seen_before(c.question)]
        card_pools.append(cards)
        for t in options.question_types:
            question_pools[t].append(
                [q for q in outcome.questions if q.type == t and not dedupe_questions.seen_before(q.question)]
                if t in req.questions else []
            )
        kept_questions = [q for t in options.question_types for q in question_pools[t][-1]]
        duplicates += (len(outcome.flashcards) - len(cards)) + (len(outcome.questions) - len(kept_questions))
        for item in [*cards, *kept_questions]:
            text = item.question
            avoid.append(text)
            if item.topic not in known_topics and len(known_topics) < 40:
                known_topics.append(item.topic)
        if progress:
            await progress(done, len(requests))

    if failed == len(requests):
        raise GenerationError("The AI service could not generate study material right now. Please try again.")

    flashcards = [
        item for _, _, item in _select(card_pools, [r.flashcards for r in requests], options.flashcards)
    ]
    questions: list[QuestionOut] = []
    for t, total in split_types(options.questions, options.question_types).items() if options.questions else []:
        targets = [r.questions.get(t, 0) for r in requests]
        questions += [item for _, _, item in _select(question_pools[t], targets, total)]

    if not flashcards and not questions:
        raise GenerationError(
            "No usable study items could be created from this document. "
            "It may have too little text, or its content may not suit the selected options."
        )

    warnings: list[str] = []
    if failed:
        warnings.append(f"{failed} of {len(requests)} parts of the document could not be processed.")
    if len(flashcards) < options.flashcards:
        warnings.append(f"Created {len(flashcards)} of {options.flashcards} flashcards; the material may not cover more.")
    if len(questions) < options.questions:
        warnings.append(f"Created {len(questions)} of {options.questions} questions; the material may not cover more.")

    return GenerationResult(
        flashcards=flashcards, questions=questions, warnings=warnings,
        requests_made=calls, requests_failed=failed, items_rejected=rejected,
        duplicates_removed=duplicates, rejection_reasons=dict(reasons.most_common()),
    )
