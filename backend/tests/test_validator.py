import copy

import pytest

from models.documents import Chunk
from services.validator import Deduper, validate_batch
from tests.fakes import make_chunk

CHUNK = make_chunk(pages=(4, 5))
ALL = {"multiple_choice", "true_false", "identification", "short_answer", "scenario"}


def mcq(**over):
    item = {
        "type": "multiple_choice", "question": "Which concept is described as alpha in switching?",
        "choices": ["alpha", "bravo", "charlie", "delta"], "correct_answer": "alpha",
        "explanation": "Concept alpha means something specific about switching.",
        "topic": "Switching", "difficulty": "easy", "source": {"page": 4},
    }
    item.update(over)
    return item


def one_question(item, allowed=ALL, chunk=CHUNK, topics=None):
    batch = validate_batch({"questions": [item]}, chunk, allowed, topics)
    return batch


def test_valid_mcq_is_accepted_and_correct_answer_kept_after_shuffle():
    b = one_question(mcq())
    assert not b.rejected
    q = b.questions[0]
    assert sorted(q.choices) == ["alpha", "bravo", "charlie", "delta"]
    assert q.correct_answer == "alpha" and q.correct_answer in q.choices
    assert q.source == {"type": "pdf", "page": 4}


def test_shuffle_is_repeatable():
    assert one_question(mcq()).questions[0].choices == one_question(mcq()).questions[0].choices


@pytest.mark.parametrize(
    "over,reason",
    [
        ({"choices": ["alpha", "bravo", "charlie"]}, "4 choices"),
        ({"choices": ["alpha", "alpha", "charlie", "delta"]}, "duplicate"),
        ({"choices": ["alpha", "bravo", "charlie", "None of the above"]}, "above"),
        ({"correct_answer": "zulu"}, "not one of the choices"),
        ({"correct_answer": ""}, "missing correct"),
        ({"explanation": ""}, "explanation"),
        ({"question": ""}, "question"),
        ({"question": "According to the text, which concept is alpha?"}, "refers"),
        ({"type": "essay"}, "not requested"),
        ({"choices": None}, "4 choices"),
    ],
)
def test_bad_mcq_is_rejected(over, reason):
    b = one_question(mcq(**over))
    assert not b.questions
    assert reason in b.rejected[0]


def test_letter_answers_are_mapped_to_choice_text():
    b = one_question(mcq(correct_answer="A"))
    assert b.questions[0].correct_answer == "alpha"
    b = one_question(mcq(choices=["A. alpha", "B. bravo", "C. charlie", "D. delta"], correct_answer="B. bravo"))
    assert b.questions[0].correct_answer == "bravo"
    assert "A. alpha" not in b.questions[0].choices


def test_true_false_normalised():
    base = {"type": "true_false", "question": "True or false: Concept alpha means something specific about switching.",
            "explanation": "Concept alpha means something specific about switching.", "topic": "T", "difficulty": "easy"}
    for given in (True, "true", "TRUE", "True"):
        q = one_question({**base, "correct_answer": given}).questions[0]
        assert q.correct_answer == "True"
        assert not q.question.lower().startswith("true or false")
        assert q.choices is None
    assert one_question({**base, "correct_answer": "maybe"}).rejected


def test_identification_and_short_answer_and_scenario():
    common = {"explanation": "Concept alpha means something specific about switching.", "topic": "T", "difficulty": "hard"}
    ident = {**common, "type": "identification", "question": "Which concept is alpha?", "correct_answer": "alpha"}
    short = {**common, "type": "short_answer", "question": "Explain alpha.", "correct_answer": "Concept alpha means something specific."}
    scen = {**common, "type": "scenario", "correct_answer": "alpha",
            "question": "A technician configures a switch and must apply the alpha idea. Which concept applies?"}
    b = validate_batch({"questions": [ident, short, scen]}, CHUNK, ALL)
    assert [q.type for q in b.questions] == ["identification", "short_answer", "scenario"]
    short_scenario = {**scen, "question": "Which one?"}
    assert validate_batch({"questions": [short_scenario]}, CHUNK, ALL).rejected


def test_scenario_with_choices_follows_mcq_rules():
    scen = mcq(type="scenario", question="A technician configures a switch and must pick the right concept to apply.")
    assert one_question(scen).questions
    assert one_question({**scen, "choices": ["alpha", "bravo"]}).rejected


def test_ungrounded_answer_is_rejected_as_hallucination():
    b = one_question(mcq(
        choices=["Kubernetes orchestration", "bravo", "charlie", "delta"],
        correct_answer="Kubernetes orchestration",
        explanation="Kubernetes orchestrates containerized workloads across distributed clusters.",
    ))
    assert not b.questions and "source text" in b.rejected[0]


def test_source_falls_back_to_chunk_range_when_claim_is_wrong():
    assert one_question(mcq(source={"page": 99})).questions[0].source == {
        "type": "pdf", "page_start": 4, "page_end": 5}
    assert one_question(mcq(source="nonsense")).questions[0].source == {
        "type": "pdf", "page_start": 4, "page_end": 5}
    single = make_chunk(pages=(7,))
    assert one_question(mcq(source={"page": 99}), chunk=single).questions[0].source == {"type": "pdf", "page": 7}


def test_docx_source_uses_matching_section():
    text = "Concept alpha means something specific about switching. " * 3
    chunk = Chunk(0, text, [{"type": "docx", "section": "Trunking"}, {"type": "docx", "section": "VLANs"}], None)
    q = one_question(mcq(source={"section": "vlans"}), chunk=chunk).questions[0]
    assert q.source == {"type": "docx", "section": "VLANs"}
    q = one_question(mcq(source={"section": "Nope"}), chunk=chunk).questions[0]
    assert q.source == {"type": "docx", "section": "Trunking"}


def test_difficulty_and_topic_defaults():
    q = one_question(mcq(difficulty="EASY ")).questions[0]
    assert q.difficulty == "easy"
    q = one_question(mcq(difficulty="impossible", topic=None)).questions[0]
    assert (q.difficulty, q.topic) == ("medium", "General")


def test_topic_filter():
    assert one_question(mcq(topic="switching"), topics=["Switching"]).questions[0].topic == "Switching"
    b = one_question(mcq(topic="Cooking"), topics=["Switching"])
    assert not b.questions and "topic" in b.rejected[0]


def test_flashcards():
    good = {"question": "What does alpha mean?", "answer": "Concept alpha means something specific",
            "topic": "Switching", "difficulty": "easy", "source": {"page": 5}}
    b = validate_batch({"flashcards": [good, {**good, "answer": ""}, {**good, "question": "In the text, what is alpha?"},
                                       "junk"]}, CHUNK, ALL)
    assert len(b.flashcards) == 1 and len(b.rejected) == 3
    assert b.flashcards[0].source == {"type": "pdf", "page": 5}


def test_non_object_reply_and_missing_lists():
    assert validate_batch([1, 2], CHUNK, ALL).rejected
    b = validate_batch({}, CHUNK, ALL)
    assert not b.flashcards and not b.questions and not b.rejected


def test_input_is_not_mutated():
    item = mcq()
    snapshot = copy.deepcopy(item)
    one_question(item)
    assert item == snapshot


def test_deduper_exact_and_near_duplicates_but_not_similar_short_ones():
    d = Deduper()
    assert not d.seen_before("What is a VLAN?")
    assert d.seen_before("what is a vlan")  # exact after normalising
    assert not d.seen_before("What is a VLAN trunk?")  # short questions are only compared exactly
    assert not d.seen_before("Which standard defines VLAN tagging on Ethernet frames?")
    assert d.seen_before("Which standard defines the VLAN tagging on Ethernet frames?")  # near-duplicate
    assert not d.seen_before("Why do switches separate broadcast domains using VLANs?")


def test_identification_and_short_answer_may_omit_the_explanation():
    ident = {"type": "identification", "question": "Which concept is alpha in switching?", "correct_answer": "alpha",
             "topic": "Switching", "difficulty": "easy"}
    short = {"type": "short_answer", "question": "Explain what concept alpha means in switching.",
             "correct_answer": "Concept alpha means something specific about switching.", "topic": "Switching",
             "difficulty": "medium", "explanation": ""}
    b = validate_batch({"questions": [ident, short]}, CHUNK, ALL)
    assert not b.rejected
    assert [q.explanation for q in b.questions] == ["", ""]


def test_other_types_still_require_an_explanation():
    tf = {"type": "true_false", "question": "Concept alpha means something specific about switching.",
          "correct_answer": "True", "topic": "Switching", "difficulty": "easy"}
    b = validate_batch({"questions": [tf]}, CHUNK, ALL)
    assert not b.questions and "missing explanation" in b.rejected[0]


def test_ungrounded_identification_without_explanation_is_still_rejected():
    ident = {"type": "identification", "question": "Which container orchestration platform schedules Kubernetes workloads?",
             "correct_answer": "Kubernetes scheduler", "topic": "Switching", "difficulty": "easy"}
    b = validate_batch({"questions": [ident]}, CHUNK, ALL)
    assert not b.questions and "source text" in b.rejected[0]
