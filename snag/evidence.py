"""Turn a recorded session into an agent-readable transcript.

Claude can't watch a video, but it can read a transcript. Snag records each
session as structured events; this collapses the meaningful ones: navigations,
clicks, console/uncaught errors, network calls, form actions: into a compact,
timestamped log an agent (or a human) can reason about.

The event shapes mirror ``packages/shared/src/events.ts`` in the snag repo:
rrweb custom events (``type == 5``) carry ``data.payload`` with a ``kind``.
"""

from typing import Any, Dict, List, Optional

RRWEB_CUSTOM = 5


def _path(url: Optional[str]) -> str:
    if not url:
        return ""
    try:
        from urllib.parse import urlsplit
        s = urlsplit(url)
        return (s.path or "/") + (f"?{s.query}" if s.query else "")
    except Exception:
        return url


def _payload(ev: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if ev.get("type") != RRWEB_CUSTOM:
        return None
    data = ev.get("data") or {}
    if data.get("tag") != "snag":
        return None
    p = data.get("payload")
    return p if isinstance(p, dict) else None


def _line(off_ms: int, p: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    kind = p.get("kind")
    t = f"{off_ms / 1000:6.1f}s"
    if kind == "navigation":
        trig = p.get("trigger", "")
        return {"t": t, "kind": "nav", "bad": False,
                "text": f"navigate {_path(p.get('url'))}" + (f" ({trig})" if trig else "")}
    if kind == "click":
        label = p.get("text") or p.get("selector") or "element"
        rage = " [RAGE]" if p.get("rage") else ""
        return {"t": t, "kind": "click", "bad": bool(p.get("rage")),
                "text": f"click {label}{rage}"}
    if kind == "console":
        bad = p.get("level") == "error"
        return {"t": t, "kind": "console", "bad": bad,
                "text": f"console.{p.get('level', 'log')} {p.get('message', '')}"[:200]}
    if kind == "error":
        return {"t": t, "kind": "error", "bad": True,
                "text": f"uncaught {p.get('message', '')}"[:200]}
    if kind == "network":
        status = p.get("status")
        bad = (status or 0) >= 400 or bool(p.get("error")) or bool(p.get("timedOut"))
        outcome = status or p.get("error") or ("timeout" if p.get("timedOut") else "?")
        dur = p.get("durationMs")
        return {"t": t, "kind": "network", "bad": bad,
                "text": f"{p.get('method', 'GET')} {_path(p.get('url'))} -> {outcome}"
                        + (f" ({dur}ms)" if dur is not None else "")}
    if kind == "form":
        return {"t": t, "kind": "form", "bad": p.get("action") == "invalid",
                "text": f"form {p.get('action', '')} {p.get('formSelector', '')}".strip()}
    if kind == "event":
        return {"t": t, "kind": "event", "bad": False, "text": f"event \"{p.get('name', '')}\""}
    if kind == "page_hide":
        return {"t": t, "kind": "end", "bad": False, "text": "left the page"}
    return None


def transcript(events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Ordered list of ``{t, kind, bad, text}`` evidence rows."""
    if not events:
        return []
    start = events[0].get("timestamp", 0)
    rows: List[Dict[str, Any]] = []
    for ev in events:
        p = _payload(ev)
        if not p:
            continue
        line = _line(int(ev.get("timestamp", start) - start), p)
        if line:
            rows.append(line)
    return rows


def summary(session: Dict[str, Any], rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    """A one-glance header: what kind of session this was."""
    return {
        "id": session.get("id"),
        "url": session.get("urlFirst"),
        "device": session.get("device"),
        "browser": session.get("browser"),
        "interactions": session.get("interactions"),
        "activeMs": session.get("activeMs"),
        "durationMs": session.get("durationMs"),
        "problems": sum(1 for r in rows if r["bad"]),
        "steps": len(rows),
    }
