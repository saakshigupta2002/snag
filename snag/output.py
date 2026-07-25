"""Output: human-first on a terminal, machine-friendly with --json / --plain.

Rules (clig.dev): data goes to stdout, logs and errors to stderr; colour only
when stdout is a TTY and NO_COLOR is unset; ``--select`` projects JSON fields so
agents spend fewer tokens.
"""

import json
import os
import sys
from typing import Any, Iterable, Optional, Sequence

# Exit codes — scripts and agents branch on these.
EXIT_OK = 0
EXIT_ERROR = 1
EXIT_USAGE = 2
EXIT_NOT_FOUND = 3
EXIT_UPSTREAM = 4


def _use_color() -> bool:
    if os.environ.get("NO_COLOR"):
        return False
    if os.environ.get("TERM") == "dumb":
        return False
    if "--no-color" in sys.argv:
        return False
    return sys.stdout.isatty()


def _c(code: str, s: str) -> str:
    return f"\033[{code}m{s}\033[0m" if _use_color() else s


def dim(s: str) -> str:
    return _c("2", s)


def bold(s: str) -> str:
    return _c("1", s)


def red(s: str) -> str:
    return _c("31", s)


def green(s: str) -> str:
    return _c("32", s)


def yellow(s: str) -> str:
    return _c("33", s)


def error(msg: str) -> None:
    """A human error to stderr. Keep it short; lead with what to do next."""
    print(f"{red('error')}: {msg}", file=sys.stderr)


def hint(msg: str) -> None:
    print(dim(msg), file=sys.stderr)


def select_fields(obj: Any, fields: Optional[Sequence[str]]) -> Any:
    """Keep only ``fields`` from a dict (or each dict in a list)."""
    if not fields:
        return obj
    if isinstance(obj, list):
        return [select_fields(o, fields) for o in obj]
    if isinstance(obj, dict):
        return {k: obj.get(k) for k in fields}
    return obj


def emit_json(obj: Any, fields: Optional[Sequence[str]] = None) -> None:
    print(json.dumps(select_fields(obj, fields), indent=2, ensure_ascii=False))


def kv(rows: Iterable[Sequence[str]], gap: int = 2) -> None:
    """Print aligned ``label  value`` pairs (a details view)."""
    rows = [(str(a), str(b)) for a, b in rows]
    width = max((len(a) for a, _ in rows), default=0)
    for label, value in rows:
        print(f"{dim(label.ljust(width))}{' ' * gap}{value}")


def table(headers: Sequence[str], rows: Sequence[Sequence[Any]]) -> None:
    """A compact, left-aligned table sized to its content."""
    if not rows:
        return
    cells = [[("" if c is None else str(c)) for c in row] for row in rows]
    widths = [len(h) for h in headers]
    for row in cells:
        for i, c in enumerate(row):
            widths[i] = max(widths[i], len(c))
    print("  ".join(dim(h.ljust(widths[i])) for i, h in enumerate(headers)))
    for row in cells:
        print("  ".join(c.ljust(widths[i]) for i, c in enumerate(row)))
