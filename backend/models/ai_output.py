from typing import Literal

from pydantic import BaseModel, Field, model_validator

Difficulty = Literal["easy", "medium", "hard"]
QuestionType = Literal["multiple_choice", "true_false", "identification", "short_answer", "scenario"]


class FlashcardOut(BaseModel):
    question: str
    answer: str
    topic: str
    difficulty: Difficulty
    source: dict


class QuestionOut(BaseModel):
    type: QuestionType
    question: str
    choices: list[str] | None = None  # saved to questions.options in Phase 5
    correct_answer: str
    explanation: str = ""  # only identification and short_answer may leave this empty
    topic: str
    difficulty: Difficulty
    source: dict


class GenerationOptions(BaseModel):
    flashcards: int = Field(20, ge=0, le=50)
    questions: int = Field(20, ge=0, le=50)
    question_types: list[QuestionType] = Field(
        default_factory=lambda: ["multiple_choice", "true_false", "identification"]
    )
    difficulty: Literal["easy", "medium", "hard", "mixed"] = "mixed"
    topics: list[str] = Field(default_factory=list, max_length=30)  # empty = all topics

    @model_validator(mode="after")
    def _check(self):
        if self.flashcards + self.questions == 0:
            raise ValueError("Choose at least one flashcard or question.")
        if self.questions and not self.question_types:
            raise ValueError("Choose at least one question type.")
        self.question_types = list(dict.fromkeys(self.question_types))
        self.topics = [t.strip()[:80] for t in self.topics if t.strip()]
        return self


class GenerationResult(BaseModel):
    flashcards: list[FlashcardOut]
    questions: list[QuestionOut]
    warnings: list[str] = Field(default_factory=list)
    requests_made: int = 0
    requests_failed: int = 0
    items_rejected: int = 0
    duplicates_removed: int = 0
    rejection_reasons: dict[str, int] = Field(default_factory=dict)  # why items were dropped, with counts
