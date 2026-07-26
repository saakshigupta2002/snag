"""MCP server (stdio) exposing Snag's read primitives to any MCP client.

Speaks JSON-RPC 2.0 over newline-delimited stdio — no third-party dependency.
Agents that prefer MCP over shelling out get the same data the CLI reads:
issues, sessions, the evidence transcript, analytics and status.

Config comes from the environment / config file (SNAG_ENDPOINT, SNAG_TOKEN,
SNAG_PROJECT), exactly like the CLI.
"""

import json
import sys
from typing import Any, Dict, List

from . import __version__
from .api import ApiError, Client
from .config import resolve
from .evidence import summary, transcript

PROTOCOL = "2024-11-05"


def _project(client: Client) -> str:
    cfg = resolve()
    if cfg.project:
        return cfg.project
    projects = client.projects() or []
    if len(projects) == 1:
        return projects[0]["id"]
    raise ApiError("set SNAG_PROJECT (multiple or no projects)")


TOOLS: List[Dict[str, Any]] = [
    {"name": "snag_list_issues",
     "description": "List flagged issues for the project, worst first. Optional status/severity/detector filters.",
     "inputSchema": {"type": "object", "properties": {
         "status": {"type": "string"}, "severity": {"type": "string"}, "detector": {"type": "string"}}}},
    {"name": "snag_get_issue",
     "description": "Details for one issue group by its groupKey.",
     "inputSchema": {"type": "object", "properties": {"group_key": {"type": "string"}},
                     "required": ["group_key"]}},
    {"name": "snag_list_sessions",
     "description": "List recorded sessions, most active first. Optional errors/bot/device/browser filters.",
     "inputSchema": {"type": "object", "properties": {
         "errors": {"type": "boolean"}, "bot": {"type": "boolean"},
         "device": {"type": "string"}, "browser": {"type": "string"}}}},
    {"name": "snag_get_session_evidence",
     "description": "A recorded session as a readable transcript (clicks, navigations, errors, network).",
     "inputSchema": {"type": "object", "properties": {"session_id": {"type": "string"}},
                     "required": ["session_id"]}},
    {"name": "snag_get_analytics",
     "description": "Headline analytics (KPIs, users, errors, bots) over the last N days.",
     "inputSchema": {"type": "object", "properties": {"days": {"type": "integer"}}}},
    {"name": "snag_get_status",
     "description": "Ingest health: last session, sessions today, open/high issue counts.",
     "inputSchema": {"type": "object", "properties": {}}},
]


def _call(name: str, args: Dict[str, Any]) -> Any:
    client = Client(resolve())
    if name == "snag_list_issues":
        return client.issues(_project(client), status=args.get("status"),
                             severity=args.get("severity"), detector=args.get("detector"))
    if name == "snag_get_issue":
        gk = args.get("group_key")
        if not gk:
            raise ApiError("group_key is required")
        return client.issue(_project(client), gk)
    if name == "snag_list_sessions":
        return client.sessions(_project(client),
                               errors="1" if args.get("errors") else None,
                               bot="1" if args.get("bot") else None,
                               device=args.get("device"), browser=args.get("browser"))
    if name == "snag_get_session_evidence":
        sid = args.get("session_id")
        if not sid:
            raise ApiError("session_id is required")
        data = client.session_events(sid) or {}
        rows = transcript(data.get("events") or [])
        return {"session": summary(data.get("session") or {}, rows), "transcript": rows}
    if name == "snag_get_analytics":
        try:
            days = int(args.get("days", 14))
        except (TypeError, ValueError):
            days = 14
        return client.analytics(_project(client), days=days)
    if name == "snag_get_status":
        a = client.analytics(_project(client), days=1)
        groups = client.issues(_project(client), status="open") or []
        return {"ingest": a.get("ingest"), "openIssues": len(groups),
                "highSeverity": sum(1 for g in groups if g.get("severity") == "high")}
    raise ApiError(f"unknown tool {name}")


def _handle(msg: Dict[str, Any]) -> Any:
    method = msg.get("method")
    if method == "initialize":
        return {"protocolVersion": PROTOCOL, "capabilities": {"tools": {}},
                "serverInfo": {"name": "snag", "version": __version__}}
    if method == "tools/list":
        return {"tools": TOOLS}
    if method == "tools/call":
        params = msg.get("params") or {}
        try:
            result = _call(params.get("name"), params.get("arguments") or {})
            text = json.dumps(result, ensure_ascii=False, indent=2)
            return {"content": [{"type": "text", "text": text}]}
        except Exception as exc:  # never let one bad call kill the server loop
            return {"content": [{"type": "text", "text": f"error: {exc}"}], "isError": True}
    if method == "ping":
        return {}
    return None  # notifications (e.g. notifications/initialized) get no reply


def serve() -> int:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except ValueError:
            continue
        result = _handle(msg)
        if "id" not in msg:  # a notification — never reply
            continue
        response: Dict[str, Any] = {"jsonrpc": "2.0", "id": msg["id"]}
        if result is None:
            response["error"] = {"code": -32601, "message": f"method not found: {msg.get('method')}"}
        else:
            response["result"] = result
        sys.stdout.write(json.dumps(response) + "\n")
        sys.stdout.flush()
    return 0


def main() -> int:
    return serve()


if __name__ == "__main__":
    sys.exit(main())
