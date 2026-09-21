"""Run the whole pipeline on a real file: document -> chunks -> AI -> validated JSON.

    .venv\\Scripts\\python.exe scripts\\generate_from_file.py "C:\\path\\to\\file.pdf"
    .venv\\Scripts\\python.exe scripts\\generate_from_file.py "file.pdf" --flashcards 10 --questions 10 --out result.json

Uses your real Gemini quota (about one request per chunk, plus a few more for larger sets).
"""
import argparse
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from models.ai_output import GenerationOptions  # noqa: E402
from services.ai import get_ai_client  # noqa: E402
from services.chunker import chunk_document  # noqa: E402
from services.errors import AIError, DocumentError, GenerationError  # noqa: E402
from services.extractors import extract_document  # noqa: E402
from services.file_validation import validate_upload  # noqa: E402
from services.question_generator import generate_study_materials, plan_requests  # noqa: E402


async def run(args) -> int:
    path = Path(args.path)
    if not path.is_file():
        print(f"File not found: {path}")
        return 1
    data = path.read_bytes()
    try:
        file_type = validate_upload(path.name, data)
        chunks = chunk_document(extract_document(data, file_type))
        options = GenerationOptions(
            flashcards=args.flashcards,
            questions=args.questions,
            question_types=[t.strip() for t in args.types.split(",") if t.strip()],
            difficulty=args.difficulty,
        )
        requests = plan_requests(chunks, options)
        print(f"{path.name}: {len(chunks)} chunk(s) -> about {len(requests)} AI request(s). Working...")

        async def progress(done: int, total: int) -> None:
            print(f"  request {done}/{total} done")

        result = await generate_study_materials(chunks, options, get_ai_client(), progress)
    except (DocumentError, GenerationError, AIError, ValueError) as err:
        print(f"FAILED: {err}")
        return 1

    print(f"\nFlashcards: {len(result.flashcards)}   Questions: {len(result.questions)}")
    print(f"AI requests: {result.requests_made}   failed: {result.requests_failed}   rejected items: {result.items_rejected}")
    if result.duplicates_removed:
        print(f"Duplicates removed: {result.duplicates_removed}")
    for reason, count in result.rejection_reasons.items():
        print(f"Rejected ({count}): {reason}")
    for w in result.warnings:
        print(f"WARNING: {w}")
    for card in result.flashcards[:3]:
        print(f"\n[flashcard] {card.question}\n  -> {card.answer}\n  ({card.topic}, {card.difficulty}, {card.source})")
    for q in result.questions[:5]:
        print(f"\n[{q.type}] {q.question}")
        for c in q.choices or []:
            print(f"    {'*' if c == q.correct_answer else ' '} {c}")
        print(f"  answer: {q.correct_answer}\n  why: {q.explanation}\n  ({q.topic}, {q.difficulty}, {q.source})")
    if args.out:
        Path(args.out).write_text(json.dumps(result.model_dump(), indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"\nFull result saved to {args.out}")
    return 0


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("path")
    p.add_argument("--flashcards", type=int, default=10)
    p.add_argument("--questions", type=int, default=10)
    p.add_argument("--types", default="multiple_choice,true_false,identification")
    p.add_argument("--difficulty", default="mixed", choices=["easy", "medium", "hard", "mixed"])
    p.add_argument("--out", help="save the full JSON result to this file")
    args = p.parse_args()
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    return asyncio.run(run(args))


if __name__ == "__main__":
    raise SystemExit(main())
