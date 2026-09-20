from services.cleaner import clean_text


def test_joins_words_split_by_hyphen_at_line_break():
    assert clean_text("The net-\nwork is up") == "The network is up"


def test_joins_wrapped_sentences_but_not_new_sentences():
    text = "A VLAN is a logical\nnetwork on a switch.\nRouters connect networks."
    assert clean_text(text) == "A VLAN is a logical network on a switch.\nRouters connect networks."


def test_keeps_bullets_separate():
    assert clean_text("Topics\n- one\n- two") == "Topics\n- one\n- two"


def test_fixes_ligatures_and_keeps_superscripts():
    assert clean_text("ﬁrst ﬂoor x²") == "first floor x²"


def test_removes_control_chars_and_collapses_blank_lines():
    assert clean_text("a\x00b\n\n\n\n\nc") == "ab\n\nc"


def test_collapses_spaces_and_nbsp():
    assert clean_text("a   b\u00a0c\t d") == "a b c d"
