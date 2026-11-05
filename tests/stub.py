"""A stand-in Snag API that serves data recorded from a real run of the demo shop."""

import json
import threading
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

FIXTURES = json.loads((Path(__file__).parent / "fixtures" / "snag.json").read_text(encoding="utf-8"))


def route(path):
    """Map a request path to recorded JSON, or None for a 404."""
    parts = [urllib.parse.unquote(p) for p in path.split("?")[0].strip("/").split("/")]
    if parts == ["api", "projects"]:
        return FIXTURES["projects"]
    if parts == ["api", "projects", "demo"]:
        return FIXTURES["project"]
    if parts[:3] == ["api", "projects", "demo"] and len(parts) == 4:
        return {
            "issues": FIXTURES["issues"],
            "sessions": FIXTURES["sessions"],
            "analytics": FIXTURES["analytics"],
            "funnels": FIXTURES["funnels"],
        }.get(parts[3])
    if parts[:4] == ["api", "projects", "demo", "issues"] and len(parts) == 5:
        return FIXTURES["issue"] if parts[4] == FIXTURES["group_key"] else None
    if parts[:2] == ["api", "sessions"] and parts[-1] == "events":
        return FIXTURES["session_events"] if parts[2] == FIXTURES["session_id"] else None
    return None


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802 (http.server's naming)
        data = route(self.path)
        body = json.dumps(data if data is not None else {"error": "not found"}).encode("utf-8")
        self.send_response(200 if data is not None else 404)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


class Stub:
    """Runs the API on a free local port for the length of a `with` block."""

    def __enter__(self):
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.url = f"http://127.0.0.1:{self.server.server_port}"
        return self

    def __exit__(self, *exc):
        self.server.shutdown()
        self.server.server_close()
