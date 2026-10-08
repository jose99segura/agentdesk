from agentdesk.evals.assertions import Outcome, check


def failed(expect, outcome):
    return [name for name, ok, _ in check(expect, outcome) if not ok]


def test_a_crashed_case_fails_on_completion_only():
    assert failed({"intent": "order_status"}, Outcome(error="boom")) == ["completed"]


def test_refund_limits_and_order():
    o = Outcome(refund={"order_id": "ORD-1", "amount_cents": 5000})
    assert failed({"refund": "any", "refund_order": "ORD-1", "refund_max_cents": 5000}, o) == []
    assert failed({"refund_max_cents": 4999}, o) == ["refund_max_cents"]
    assert failed({"refund": "none"}, o) == ["refund"]


def test_mentions_are_case_insensitive_both_ways():
    o = Outcome(reply="Your order ord-9 ships with TRK-1.")
    assert failed({"mentions": ["ORD-9", "trk-1"], "not_mentions": ["5000"]}, o) == []
    assert failed({"not_mentions": ["TRK-1"]}, o) == ["not_mentions:TRK-1"]


def test_flags_and_blocks():
    o = Outcome(reply="hello there friend", flags=["possible_prompt_injection"], blocked=["invented_order"])
    assert failed({"flags": ["possible_prompt_injection"], "blocked": ["invented_order"]}, o) == []
    negated = {"no_flags": ["possible_prompt_injection"], "not_blocked": ["invented_order"]}
    assert sorted(failed(negated, o)) == [
        "no_flag:possible_prompt_injection",
        "not_blocked:invented_order",
    ]


def test_reply_language_is_detected_from_the_reply():
    o = Outcome(reply="Hola Lucía, tu pedido está en camino. Gracias")
    assert failed({"reply_language": "es"}, o) == []
    assert failed({"reply_language": "fr"}, o) == ["reply_language"]
