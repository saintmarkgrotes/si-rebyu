import pytest

from services.ai.json_utils import parse_json_lenient


def test_plain_json():
    assert parse_json_lenient('{"a": 1}') == {"a": 1}


def test_strips_markdown_fences_and_chatter():
    assert parse_json_lenient('Sure!\n```json\n{"a": [1, 2]}\n```\nHope that helps') == {"a": [1, 2]}


def test_ignores_trailing_text_after_object():
    assert parse_json_lenient('{"a": 1} and some notes') == {"a": 1}


def test_trailing_commas_are_fixed():
    assert parse_json_lenient('{"a": [1, 2,], "b": 3,}') == {"a": [1, 2], "b": 3}


def test_truncated_reply_keeps_complete_items():
    text = '{"flashcards": [{"question": "a", "answer": "b"}, {"question": "c", "answer": "half wri'
    assert parse_json_lenient(text) == {"flashcards": [{"question": "a", "answer": "b"}]}


def test_truncated_in_second_list_keeps_first_list_and_complete_items():
    text = '{"flashcards": [{"question": "a"}], "questions": [{"question": "q1"}, {"question": "q2", "choi'
    assert parse_json_lenient(text) == {"flashcards": [{"question": "a"}], "questions": [{"question": "q1"}]}


def test_braces_inside_strings_do_not_confuse_repair():
    text = '{"flashcards": [{"question": "what is {x}?", "answer": "a ] b"}, {"question": "cut'
    assert parse_json_lenient(text)["flashcards"][0]["answer"] == "a ] b"


@pytest.mark.parametrize("text", ["", "no json here", "{broken"])
def test_unrecoverable_raises(text):
    with pytest.raises(ValueError):
        parse_json_lenient(text)
