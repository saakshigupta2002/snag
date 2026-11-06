"""`snag auth login` / `snag auth status`: connect the CLI to your Snag.

Login is interactive (never take a token as a flag: it would leak into shell
history and the process list). It stores the endpoint + management token in the
XDG config, 0600. In a non-interactive context it points you at the env vars.
"""

import getpass
import sys

from . import output as out
from .api import ApiError, Client
from .config import Config, resolve


def _prompt(label: str, default: str = "") -> str:
    suffix = f" [{default}]" if default else ""
    try:
        val = input(f"{label}{suffix}: ").strip()
    except EOFError:
        return default
    return val or default


def login(no_input: bool) -> int:
    if no_input or not sys.stdin.isatty():
        out.error("interactive login needs a terminal.")
        out.hint("Set SNAG_ENDPOINT and SNAG_TOKEN instead, or run without --no-input.")
        return out.EXIT_USAGE

    existing = Config.load_file()
    print("Connect snag to your Snag deployment.\n")
    endpoint = _prompt("Ingest / API URL", existing.endpoint or "http://localhost:8787").rstrip("/")
    token = getpass.getpass("Management token (SNAG_API_TOKEN, blank if none): ").strip() or None
    app_url = _prompt("Your app's URL (for `snag explore`)", existing.app_url or "http://localhost:3000")

    cfg = Config()
    cfg.endpoint, cfg.token, cfg.app_url = endpoint, token, app_url

    # Verify + offer to pick a default project.
    try:
        Client(cfg).health()
    except ApiError as exc:
        out.error(f"could not reach {endpoint} ({exc}).")
        return out.EXIT_UPSTREAM
    try:
        projects = Client(cfg).projects() or []
    except ApiError:
        projects = []
    if isinstance(projects, list) and projects:
        print("\nProjects:")
        for i, p in enumerate(projects, 1):
            print(f"  {i}. {p.get('name')}  {out.dim(p.get('id', ''))}")
        pick = _prompt("Default project number (blank to skip)")
        if pick.isdigit() and 1 <= int(pick) <= len(projects):
            cfg.project = projects[int(pick) - 1].get("id")

    path = cfg.save()
    print(f"\n{out.green('OK')} saved to {path}")
    return out.EXIT_OK


def status() -> int:
    cfg = resolve()
    if not cfg.endpoint:
        out.error("not configured: run `snag auth login`.")
        return out.EXIT_USAGE
    try:
        Client(cfg).health()
        reachable = out.green("reachable")
    except ApiError as exc:
        reachable = out.red(f"unreachable ({exc})")
    out.kv([
        ("endpoint", cfg.endpoint),
        ("token", "set" if cfg.token else out.dim("none (open server)")),
        ("project", cfg.project or out.dim("none")),
        ("app url", cfg.app_url or out.dim("unset")),
        ("status", reachable),
    ])
    return out.EXIT_OK
