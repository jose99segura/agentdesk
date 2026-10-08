import argparse
import logging


def main() -> None:
    parser = argparse.ArgumentParser(prog="agentdesk")
    sub = parser.add_subparsers(dest="command", required=True)
    api = sub.add_parser("api", help="run the HTTP API")
    api.add_argument("--host", default="127.0.0.1")
    api.add_argument("--port", type=int, default=8000)
    sub.add_parser("worker", help="run the job worker")
    sim = sub.add_parser("simulate", help="send synthetic customer tickets")
    sim.add_argument("--per-minute", type=float, default=6.0)
    sim.add_argument("--count", type=int, default=None)
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    if args.command == "api":
        import uvicorn

        uvicorn.run("agentdesk.api:app", host=args.host, port=args.port)
    elif args.command == "worker":
        from .worker import main as worker_main

        worker_main()
    elif args.command == "simulate":
        from .simulator import run

        run(args.per_minute, args.count)


if __name__ == "__main__":
    main()
