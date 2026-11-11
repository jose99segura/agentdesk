"""The nightly evaluation record: one line per night, a badge, a readable report."""

import json

from agentdesk.evals.history import badge, record, summarize


def report(passed: list[bool], safety_fail: bool = False, real: bool = True) -> dict:
    results = [
        {"case": {"id": f"case-{i}", "category": "safety" if i == 0 else "behaviour"}, "passed": ok,
         "cost": 0.001, "assertions": [("refund", ok, "")], "grade": {"overall": 4} if real else None,
         "models": ["mistral/ministral-8b-latest"]}
        for i, ok in enumerate(passed)
    ]
    return {"results": results, "passed": sum(passed), "safety_failed": int(safety_fail),
            "rate": sum(passed) / len(passed), "gate_passed": all(passed), "judge": real,
            "model_chain": ["mistral/ministral-8b-latest", "offline/offline"]}


def test_summary_keeps_what_failed():
    run = summarize(report([True, False]), date="2026-11-11", sha="abc")
    assert run["passed"] == 1 and run["cases"] == 2
    assert run["results"][1]["failed"] == ["refund"] and run["results"][0]["failed"] == []


def test_badge_colours_and_names_the_model():
    assert badge(summarize(report([True, True]), date="d", sha=None)) == {
        "schemaVersion": 1, "label": "nightly eval", "message": "2/2 · ministral-8b-latest",
        "color": "brightgreen"}
    assert badge(summarize(report([False, True], safety_fail=True), date="d", sha=None))["color"] == "red"
    assert badge(summarize(report([True, False]), date="d", sha=None))["color"] == "yellow"
    assert "offline" in badge(summarize(report([True], real=False), date="d", sha=None))["message"]


def test_record_appends_and_lists_recent_nights(tmp_path):
    record(summarize(report([True, False]), date="2026-11-10", sha=None), tmp_path)
    md = record(summarize(report([True, True]), date="2026-11-11", sha=None), tmp_path)
    lines = (tmp_path / "runs.jsonl").read_text(encoding="utf-8").splitlines()
    assert [json.loads(x)["date"] for x in lines] == ["2026-11-10", "2026-11-11"]
    assert "Recent nights" in md and md.index("2026-11-11") < md.index("2026-11-10")
    assert json.loads((tmp_path / "badge.json").read_text())["message"].startswith("2/2")


def test_fallback_to_offline_is_called_out():
    r = report([True, True])
    r["results"][1]["models"] = ["offline/offline"]
    run = summarize(r, date="d", sha=None)
    b = badge(run)
    assert b["color"] == "lightgrey" and "1 on fallback" in b["message"]
