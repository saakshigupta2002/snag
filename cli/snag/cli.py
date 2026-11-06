"""snag: command-line entry point.

Grammar (noun-verb, like `gh`):  snag <resource> <verb> [args] [flags]
Global flags: --json, --select a,b,c, --endpoint, --token, --project, --no-color, -q.
Exit codes: 0 ok · 2 usage · 3 not found · 4 network/upstream · 1 other.
"""

import argparse
import sys
from typing import List, Optional, Tuple

from . import __version__, auth
from . import output as out
from .api import ApiError, Client, NotFound
from .config import resolve
from .db import connect, ledger, save_issues, save_sessions
from .evidence import summary, transcript

SEV_RANK = {"high": 2, "medium": 1, "low": 0}


class Usage(Exception):
    pass


def _fields(args) -> Optional[List[str]]:
    return [f.strip() for f in args.select.split(",")] if getattr(args, "select", None) else None


def _client(args, need_project: bool = True) -> Tuple[Client, Optional[str]]:
    cfg = resolve(args.endpoint, args.token, args.project)
    client = Client(cfg)
    pid = cfg.project
    if need_project and not pid:
        projects = client.projects()
        if isinstance(projects, list) and len(projects) == 1:
            pid = projects[0].get("id")
        elif isinstance(projects, list) and len(projects) > 1:
            raise Usage("multiple projects: pass --project <id> or set a default with `snag auth login`")
        else:
            raise Usage("no project configured: run `snag auth login` or pass --project <id>")
    return client, pid


# ── auth ───────────────────────────────────────────────────────────────────
def cmd_auth_login(args) -> int:
    return auth.login(args.no_input)


def cmd_auth_status(args) -> int:
    return auth.status()


# ── project ────────────────────────────────────────────────────────────────
def cmd_project_list(args) -> int:
    client, _ = _client(args, need_project=False)
    projects = client.projects() or []
    if args.json:
        out.emit_json(projects, _fields(args))
        return out.EXIT_OK
    out.table(["name", "id"], [(p.get("name"), p.get("id")) for p in projects])
    return out.EXIT_OK


def cmd_project_view(args) -> int:
    client, pid = _client(args) if not args.id else (_client(args, need_project=False)[0], args.id)
    p = client.project(pid)
    if args.json:
        out.emit_json(p, _fields(args))
        return out.EXIT_OK
    out.kv([("name", p.get("name")), ("id", p.get("id")), ("key", p.get("projectKey", ""))])
    return out.EXIT_OK


# ── issue ──────────────────────────────────────────────────────────────────
def cmd_issue_list(args) -> int:
    client, pid = _client(args)
    try:
        groups = client.issues(pid, status=args.status, severity=args.severity, detector=args.detector) or []
        try:
            conn = connect(); save_issues(conn, pid, groups); conn.close()
        except Exception:
            pass
    except ApiError as exc:
        # Network down: fall back to the local mirror (the durable bug ledger).
        if exc.status is not None:
            raise
        try:
            conn = connect(); groups = ledger(conn, pid); conn.close()
        except Exception:
            raise exc
        if not groups:
            raise exc
        out.hint("offline: showing the local mirror")
    groups = sorted(groups, key=lambda g: (SEV_RANK.get(g.get("severity"), 0),
                                           g.get("lastSeen", "")), reverse=True)
    if args.max:
        groups = groups[: args.max]
    if args.json:
        out.emit_json(groups, _fields(args))
        return out.EXIT_OK
    if not groups:
        print(out.dim("Nothing flagged for this filter."))
        return out.EXIT_OK
    out.table(["severity", "detector", "count", "status", "issue"],
              [(g.get("severity"), g.get("detector"), g.get("occurrences"),
                g.get("status"), (g.get("title") or "")[:60]) for g in groups])
    return out.EXIT_OK


def cmd_issue_view(args) -> int:
    client, pid = _client(args)
    try:
        data = client.issue(pid, args.group_key)
    except NotFound:
        # Fall back to the grouped list so a human-typed key still resolves.
        groups = client.issues(pid) or []
        data = next((g for g in groups if g.get("groupKey") == args.group_key), None)
        if data is None:
            raise
    if args.json:
        out.emit_json(data, _fields(args))
        return out.EXIT_OK
    g = data if isinstance(data, dict) else {}
    out.kv([(k, g.get(k)) for k in
            ("title", "detector", "severity", "status", "occurrences", "firstSeen", "lastSeen")
            if g.get(k) is not None])
    if g.get("aiSummary"):
        print("\n" + g["aiSummary"])
    return out.EXIT_OK


def cmd_issue_create(args) -> int:
    client, pid = _client(args)
    if not args.title or args.severity not in ("low", "medium", "high"):
        raise Usage("--title and --severity {low|medium|high} are required")
    if args.dry_run:
        print(out.dim(f"would file AI issue [{args.severity}] {args.title}"))
        return out.EXIT_OK
    body = {"title": args.title, "severity": args.severity,
            "sessionId": args.session, "detector": args.detector, "note": args.note}
    res = client.create_issue(pid, {k: v for k, v in body.items() if v is not None})
    if args.json:
        out.emit_json(res, _fields(args))
        return out.EXIT_OK
    print(f"{out.green('filed')} AI issue: {res.get('groupKey')}")
    return out.EXIT_OK


def cmd_issue_resolve(args) -> int:
    client, pid = _client(args)
    status = "confirmed" if args.verdict == "confirm" else "dismissed"
    if args.dry_run:
        print(out.dim(f"would set {args.group_key} -> {status}"))
        return out.EXIT_OK
    client.set_issue_status(pid, args.group_key, status, args.note)
    print(f"{out.green('OK')} {args.group_key} -> {status}")
    return out.EXIT_OK


# ── session ────────────────────────────────────────────────────────────────
def cmd_session_list(args) -> int:
    client, pid = _client(args)
    filt = dict(device=args.device, browser=args.browser, detector=args.detector,
                errors="1" if args.errors else None, bot="1" if args.bot else None,
                **({"from": args.since} if args.since else {}))
    sessions = client.sessions(pid, **filt) or []
    sessions.sort(key=lambda s: ((s.get("interactions") or 0), s.get("startedAt", "")), reverse=True)
    if args.max:
        sessions = sessions[: args.max]
    try:
        conn = connect(); save_sessions(conn, pid, sessions); conn.close()
    except Exception:
        pass
    if args.json:
        out.emit_json(sessions, _fields(args))
        return out.EXIT_OK
    out.table(["started", "activity", "device", "browser", "status", "id"],
              [(s.get("startedAt", "")[:19], s.get("interactions"), s.get("device"),
                s.get("browser"), s.get("status"), s.get("id")) for s in sessions])
    return out.EXIT_OK


def _load_session(client: Client, sid: str):
    data = client.session_events(sid)
    return (data or {}).get("session") or {}, (data or {}).get("events") or []


def cmd_session_view(args) -> int:
    client, _ = _client(args, need_project=False)
    session, events = _load_session(client, args.id)
    rows = transcript(events)
    info = summary(session, rows)
    if args.json:
        out.emit_json(info, _fields(args))
        return out.EXIT_OK
    out.kv([(k, info.get(k)) for k in info])
    return out.EXIT_OK


def cmd_session_evidence(args) -> int:
    client, _ = _client(args, need_project=False)
    session, events = _load_session(client, args.id)
    rows = transcript(events)
    if args.json:
        out.emit_json({"session": summary(session, rows), "transcript": rows}, _fields(args))
        return out.EXIT_OK
    info = summary(session, rows)
    print(out.bold(f"session {info['id']}") +
          out.dim(f"  {info.get('browser') or ''} · {info.get('interactions')} interactions · "
                  f"{info.get('problems')} problem(s)"))
    if info.get("url"):
        print(out.dim(out.scrub(str(info["url"]))))
    print()
    for r in rows:
        clean = out.scrub(r["text"])
        text = out.red(clean) if r["bad"] else clean
        print(f"{out.dim(r['t'])}  {text}")
    if not rows:
        print(out.dim("No interaction events in this recording (idle / bounce)."))
    return out.EXIT_OK


# ── analytics ──────────────────────────────────────────────────────────────
def cmd_analytics_show(args) -> int:
    client, pid = _client(args)
    a = client.analytics(pid, days=args.days)
    if args.json:
        out.emit_json(a, _fields(args))
        return out.EXIT_OK
    k = a.get("kpis", {})
    u = a.get("users", {})
    out.kv([("sessions", k.get("sessions")), ("pages/session", k.get("avgPagesPerSession")),
            ("avg duration", f"{round((k.get('avgDurationMs') or 0)/1000)}s"),
            ("scroll depth", k.get("avgScrollPct")),
            ("unique users", u.get("unique")), ("new / returning", f"{u.get('new')} / {u.get('returning')}"),
            ("js errors", f"{a.get('jsErrors', {}).get('pct')}%"),
            ("bots", f"{a.get('bots', {}).get('pct')}%")])
    return out.EXIT_OK


def cmd_analytics_funnels(args) -> int:
    client, pid = _client(args)
    data = client.funnels(pid, days=args.days)
    out.emit_json(data, _fields(args)) if args.json else print(
        "\n".join(f"{f.get('name')}: entered {f.get('entered')}"
                  for f in data.get("results", [])) or out.dim("No funnels defined."))
    return out.EXIT_OK


def cmd_analytics_report(args) -> int:
    client, pid = _client(args)
    a = client.analytics(pid, days=args.days)
    groups = client.issues(pid, status="open") or []
    high = [g for g in groups if g.get("severity") == "high"]
    lines = [f"# Snag report: last {args.days} days", "",
             f"- **{a.get('kpis', {}).get('sessions', 0)}** sessions, "
             f"**{a.get('users', {}).get('unique', 0)}** unique users",
             f"- **{len(groups)}** open issues (**{len(high)}** high severity)",
             f"- **{a.get('jsErrors', {}).get('pct', 0)}%** of sessions hit a JS error", ""]
    if groups:
        lines.append("## Top open issues")
        for g in sorted(groups, key=lambda x: SEV_RANK.get(x.get("severity"), 0), reverse=True)[:8]:
            lines.append(f"- `{g.get('severity')}` {g.get('title')} "
                         f"({g.get('detector')}, {g.get('occurrences')}×)")
    print("\n".join(lines))
    return out.EXIT_OK


# ── api / status / explore / mcp ───────────────────────────────────────────
def cmd_api(args) -> int:
    client, _ = _client(args, need_project=False)
    body = None
    if args.field:
        body = {}
        for f in args.field:
            k, _, v = f.partition("=")
            body[k] = v
    data = client.request(args.path if args.path.startswith("/") else "/" + args.path,
                          method=args.method, body=body)
    out.emit_json(data, _fields(args))
    return out.EXIT_OK


def cmd_status(args) -> int:
    client, pid = _client(args)
    a = client.analytics(pid, days=1)
    ing = a.get("ingest", {})
    groups = client.issues(pid, status="open") or []
    high = sum(1 for g in groups if g.get("severity") == "high")
    if args.json:
        out.emit_json({"lastSessionAt": ing.get("lastSessionAt"),
                       "sessionsToday": ing.get("sessionsToday"),
                       "openIssues": len(groups), "highSeverity": high}, _fields(args))
        return out.EXIT_OK
    out.kv([("last session", ing.get("lastSessionAt") or out.dim("never")),
            ("sessions today", ing.get("sessionsToday", 0)),
            ("open issues", len(groups)),
            ("high severity", out.red(str(high)) if high else "0")])
    return out.EXIT_OK


def cmd_explore(args) -> int:
    from . import explore
    return explore.dispatch(args, resolve(args.endpoint, args.token, args.project))


def cmd_mcp(args) -> int:
    from . import mcp_server
    return mcp_server.serve()


def cmd_version(args) -> int:
    print(f"snag {__version__}")
    return out.EXIT_OK


# ── parser ─────────────────────────────────────────────────────────────────
def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="snag",
        description="Agent-native CLI for Snag: see, judge, fix and verify the bugs your users hit.",
        epilog="Examples:\n"
               "  snag auth login\n"
               "  snag issue list --json\n"
               "  snag session evidence <id>\n"
               "  snag explore run --url http://localhost:3000\n",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("--json", action="store_true", help="structured JSON output")
    p.add_argument("--select", metavar="a,b,c", help="with --json, keep only these fields")
    p.add_argument("--endpoint", help="Snag ingest/API URL (overrides config)")
    p.add_argument("--token", help="management token (prefer `snag auth login`)")
    p.add_argument("--project", help="project id (overrides default)")
    p.add_argument("--no-color", action="store_true", help="disable colour")
    p.add_argument("-q", "--quiet", action="store_true", help="less chatter")
    p.add_argument("--version", action="version", version=f"snag {__version__}")
    sub = p.add_subparsers(dest="resource", metavar="<resource>")

    def verbs(name, help_):
        sp = sub.add_parser(name, help=help_)
        return sp.add_subparsers(dest="verb", metavar="<verb>")

    # auth
    a = verbs("auth", "connect the CLI to your Snag")
    a.add_parser("login", help="interactive setup").set_defaults(func=cmd_auth_login, no_input=False)
    a.add_parser("status", help="show current connection").set_defaults(func=cmd_auth_status)

    # project
    pr = verbs("project", "your Snag projects")
    pr.add_parser("list", help="list projects").set_defaults(func=cmd_project_list)
    pv = pr.add_parser("view", help="view one project"); pv.add_argument("id", nargs="?")
    pv.set_defaults(func=cmd_project_view)

    # issue
    iss = verbs("issue", "flagged issues")
    il = iss.add_parser("list", help="list issues, worst first")
    il.add_argument("--status"); il.add_argument("--severity"); il.add_argument("--detector")
    il.add_argument("--max", type=int, default=0); il.set_defaults(func=cmd_issue_list)
    iv = iss.add_parser("view", help="one issue + evidence"); iv.add_argument("group_key")
    iv.set_defaults(func=cmd_issue_view)
    ir = iss.add_parser("resolve", help="confirm or dismiss an issue")
    ir.add_argument("group_key"); ir.add_argument("verdict", choices=["confirm", "dismiss"])
    ir.add_argument("--note"); ir.add_argument("-n", "--dry-run", action="store_true")
    ir.set_defaults(func=cmd_issue_resolve)
    ic = iss.add_parser("create", help="file an AI-flagged issue (with a clip)")
    ic.add_argument("--title", required=True)
    ic.add_argument("--severity", choices=["low", "medium", "high"], required=True)
    ic.add_argument("--session", help="session id for the replay clip")
    ic.add_argument("--detector", help="short label, e.g. the flow (default: agent)")
    ic.add_argument("--note", help="your reasoning / evidence")
    ic.add_argument("-n", "--dry-run", action="store_true")
    ic.set_defaults(func=cmd_issue_create)

    # session
    se = verbs("session", "recorded sessions")
    sl = se.add_parser("list", help="sessions, most active first")
    for f in ("device", "browser", "detector", "since"):
        sl.add_argument(f"--{f}")
    sl.add_argument("--errors", action="store_true"); sl.add_argument("--bot", action="store_true")
    sl.add_argument("--max", type=int, default=50); sl.set_defaults(func=cmd_session_list)
    sv = se.add_parser("view", help="one session summary"); sv.add_argument("id")
    sv.set_defaults(func=cmd_session_view)
    sev = se.add_parser("evidence", help="session as a readable transcript"); sev.add_argument("id")
    sev.set_defaults(func=cmd_session_evidence)

    # analytics
    an = verbs("analytics", "product analytics")
    ash = an.add_parser("show", help="headline KPIs"); ash.add_argument("--days", type=int, default=14)
    ash.set_defaults(func=cmd_analytics_show)
    af = an.add_parser("funnels", help="funnel results"); af.add_argument("--days", type=int, default=30)
    af.set_defaults(func=cmd_analytics_funnels)
    ar = an.add_parser("report", help="markdown digest"); ar.add_argument("--days", type=int, default=7)
    ar.set_defaults(func=cmd_analytics_report)

    # explore
    ex = verbs("explore", "actively hunt for bugs (Playwright)")
    er = ex.add_parser("run", help="drive the app and record to Snag")
    er.add_argument("--url"); er.add_argument("--missions"); er.add_argument("--workers", type=int, default=3)
    er.add_argument("--force", action="store_true", help="allow a production-looking URL")
    er.add_argument("-n", "--dry-run", action="store_true"); er.set_defaults(func=cmd_explore, explore_verb="run")
    es = ex.add_parser("scaffold", help="write the Playwright safety config")
    es.add_argument("--dir", default="."); es.set_defaults(func=cmd_explore, explore_verb="scaffold")

    # api / status / mcp / version
    ap = sub.add_parser("api", help="raw Snag API passthrough"); ap.add_argument("path")
    ap.add_argument("--method", default="GET"); ap.add_argument("--field", action="append")
    ap.set_defaults(func=cmd_api)
    st = sub.add_parser("status", help="ingest health at a glance"); st.set_defaults(func=cmd_status)
    mc = sub.add_parser("mcp", help="run the MCP server (stdio)"); mc.set_defaults(func=cmd_mcp)
    sub.add_parser("version", help="print version").set_defaults(func=cmd_version)
    return p


def main(argv: Optional[List[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if not getattr(args, "func", None):
        parser.print_help()
        return out.EXIT_USAGE
    try:
        return args.func(args)
    except Usage as exc:
        out.error(str(exc))
        return out.EXIT_USAGE
    except NotFound as exc:
        out.error(str(exc))
        return out.EXIT_NOT_FOUND
    except ApiError as exc:
        out.error(str(exc))
        return out.EXIT_UPSTREAM
    except BrokenPipeError:
        return out.EXIT_OK
    except KeyboardInterrupt:
        print(file=sys.stderr)
        return out.EXIT_ERROR


if __name__ == "__main__":
    sys.exit(main())
