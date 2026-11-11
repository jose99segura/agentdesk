"""The nightly evaluation's record, kept in the repository.

`agentdesk eval --json run.json` writes one run's summary; this module appends it to
`core/evals/history/runs.jsonl`, rewrites the README badge (`badge.json`, a shields.io
endpoint) and the latest report (`latest.md`), and can print the same report as a GitHub job
summary. The history is plain files on purpose: anyone reading the repo can see how the
agents scored on a real model, night after night, without access to a database.
"""

import argparse
import json
from pathlib import Path

KEEP_IN_TABLE = 14


def summarize(report: dict, *, date: str, sha: str | None) -> dict:
    """One run, small enough to keep a line per night forever."""
    return {
        "date": date,
        "sha": sha,
        "models": report.get("model_chain", []),
        "real_model": report["judge"],
        "cases": len(report["results"]),
        "passed": report["passed"],
        "safety_failed": report["safety_failed"],
        "rate": round(report["rate"], 4),
        "gate_passed": report["gate_passed"],
        "cost_usd": round(sum(r["cost"] for r in report["results"]), 6),
        "results": [
            {
                "id": r["case"]["id"],
                "category": r["case"]["category"],
                "passed": r["passed"],
                "failed": [name for name, ok, _ in r["assertions"] if not ok],
                "judge": (r["grade"] or {}).get("overall"),
                "answered_by": r.get("models", []),
            }
            for r in report["results"]
        ],
    }


def offline_cases(run: dict) -> int:
    """Cases the agents answered with the offline stand-in although a real model was configured
    (rate limits, outages): the platform kept working, but that case measured nothing real."""
    if not run["real_model"]:
        return 0
    return sum(1 for r in run["results"] if any(m.startswith("offline") for m in r.get("answered_by", [])))


def badge(run: dict) -> dict:
    model = (run["models"] or ["?"])[0].split("/")[-1] if run["real_model"] else "offline model"
    fell_back = offline_cases(run)
    color = ("brightgreen" if run["gate_passed"] else "red" if run["safety_failed"] else "yellow")
    if fell_back:
        color = "lightgrey"
    message = f"{run['passed']}/{run['cases']} · {model}"
    if fell_back:
        message += f" · {fell_back} on fallback"
    return {"schemaVersion": 1, "label": "nightly eval", "message": message, "color": color}


def report_md(run: dict, previous: list[dict]) -> str:
    gate = "open" if run["gate_passed"] else "closed"
    lines = [
        f"# Nightly evaluation · {run['date']}",
        "",
        f"**{run['passed']}/{run['cases']} passed** ({run['rate']:.0%}), "
        f"safety failures: {run['safety_failed']}, gate {gate}, "
        f"cost ${run['cost_usd']:.5f}, models: {', '.join(run['models']) or '?'}"
        + ("" if run["real_model"] else " (no model key: the deterministic offline model)"),
    ]
    if fell_back := offline_cases(run):
        lines += ["", f"> **{fell_back} case(s) fell back to the offline model** (rate limit or outage), "
                      "so they do not measure the real model."]
    lines += [
        "",
        "| Case | Category | Result | Judge | Answered by | Failed checks |",
        "|---|---|---|---|---|---|",
    ]
    for r in run["results"]:
        lines.append(f"| `{r['id']}` | {r['category']} | {'pass' if r['passed'] else '**fail**'} | "
                     f"{r['judge'] if r['judge'] is not None else '–'} | "
                     f"{', '.join(r.get('answered_by', [])) or '–'} | {', '.join(r['failed']) or '–'} |")
    if previous:
        lines += ["", "## Recent nights", "",
                  "| Date | Passed | Safety failures | Gate | Model |", "|---|---|---|---|---|"]
        for p in [run, *previous][:KEEP_IN_TABLE]:
            model = (p["models"] or ["?"])[0] if p["real_model"] else "offline"
            lines.append(f"| {p['date']} | {p['passed']}/{p['cases']} | {p['safety_failed']} | "
                         f"{'open' if p['gate_passed'] else 'closed'} | {model} |")
    return "\n".join(lines) + "\n"


def record(run: dict, folder: Path) -> str:
    folder.mkdir(parents=True, exist_ok=True)
    log = folder / "runs.jsonl"
    lines = log.read_text(encoding="utf-8").splitlines() if log.exists() else []
    previous = [json.loads(x) for x in lines if x.strip()]
    previous.reverse()  # newest first
    with log.open("a", encoding="utf-8") as f:
        f.write(json.dumps(run, ensure_ascii=False) + "\n")
    (folder / "badge.json").write_text(json.dumps(badge(run)) + "\n", encoding="utf-8")
    md = report_md(run, previous)
    (folder / "latest.md").write_text(md, encoding="utf-8")
    return md


def main() -> None:
    parser = argparse.ArgumentParser(description="Append a nightly evaluation run to the history.")
    parser.add_argument("run", type=Path, help="the summary written by `agentdesk eval --json`")
    parser.add_argument("--dir", type=Path, default=Path("evals/history"))
    parser.add_argument("--summary", type=Path, help="also write the report here (GITHUB_STEP_SUMMARY)")
    args = parser.parse_args()
    md = record(json.loads(args.run.read_text(encoding="utf-8")), args.dir)
    if args.summary:
        with args.summary.open("a", encoding="utf-8") as f:
            f.write(md)
    print(md)


if __name__ == "__main__":
    main()
