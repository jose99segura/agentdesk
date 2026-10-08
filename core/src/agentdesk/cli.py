import argparse
import logging


def main() -> None:
    parser = argparse.ArgumentParser(prog="agentdesk")
    sub = parser.add_subparsers(dest="command", required=True)
    api = sub.add_parser("api", help="run the HTTP API")
    api.add_argument("--host", default="127.0.0.1")
    api.add_argument("--port", type=int, default=8000)
    sub.add_parser("worker", help="run the job worker")
    sub.add_parser("telegram", help="run Telegram approvals and alerts")
    ev = sub.add_parser("eval", help="run the golden suite through the agents")
    ev.add_argument("--case", default=None, help="run a single case by id")
    ev.add_argument("--gate", action="store_true", help="exit 1 when the gate is closed (for CI)")
    ev.add_argument("--trigger", choices=["manual", "ci"], default="manual")
    sim = sub.add_parser("simulate", help="send synthetic customer tickets")
    sim.add_argument("--per-minute", type=float, default=6.0)
    sim.add_argument("--count", type=int, default=None)
    vs = sub.add_parser("voice-setup", help="create or update the ElevenLabs voice agent and its tools")
    vs.add_argument("--api-url", required=True, help="public API URL ElevenLabs will call")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    if args.command == "api":
        import uvicorn

        uvicorn.run("agentdesk.api:app", host=args.host, port=args.port)
    elif args.command == "worker":
        from .worker import main as worker_main

        worker_main()
    elif args.command == "telegram":
        from .telegram import main as telegram_main

        telegram_main()
    elif args.command == "voice-setup":
        from .voice_setup import setup

        setup(args.api_url)
    elif args.command == "eval":
        from .evals.runner import print_report, run_suite

        logging.getLogger("httpx").setLevel(logging.WARNING)
        report = run_suite(trigger=args.trigger, only=args.case)
        print_report(report)
        if args.gate and not report["gate_passed"]:
            raise SystemExit(1)
    elif args.command == "simulate":
        from .simulator import run

        run(args.per_minute, args.count)


if __name__ == "__main__":
    main()
