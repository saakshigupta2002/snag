"""Thin client for the Snag ingest management API.

Every read the dashboard can do, the CLI can do: over the same ``/api/*``
endpoints, authenticated with the management Bearer token. Uses only
``urllib`` so there are no dependencies.
"""

import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, Optional

from .config import Config

TIMEOUT = float(__import__("os").environ.get("SNAG_TIMEOUT", "20"))


class ApiError(Exception):
    """A network / HTTP failure talking to Snag. ``status`` is None for I/O."""

    def __init__(self, message: str, status: Optional[int] = None):
        super().__init__(message)
        self.status = status


class NotFound(ApiError):
    pass


class Client:
    def __init__(self, cfg: Config):
        if not cfg.endpoint:
            raise ApiError("no Snag endpoint configured: run `snag auth login`")
        self.cfg = cfg

    def request(self, path: str, method: str = "GET",
                body: Optional[Any] = None,
                query: Optional[Dict[str, Any]] = None) -> Any:
        url = self.cfg.endpoint + path
        if query:
            clean = {k: v for k, v in query.items() if v is not None}
            if clean:
                url += ("&" if "?" in url else "?") + urllib.parse.urlencode(clean)
        data = json.dumps(body).encode("utf-8") if body is not None else None
        headers = {"accept": "application/json"}
        if data is not None:
            headers["content-type"] = "application/json"
        if self.cfg.token:
            headers["authorization"] = f"Bearer {self.cfg.token}"
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                raw = resp.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            server_msg = ""
            try:
                server_msg = json.loads(exc.read().decode("utf-8")).get("error", "") or ""
            except Exception:
                pass
            if exc.code == 404:
                raise NotFound(server_msg or "not found", 404)
            if exc.code in (401, 403):
                raise ApiError("unauthorized: check your token (`snag auth login`)", exc.code)
            raise ApiError(f"HTTP {exc.code}" + (f": {server_msg}" if server_msg else ""), exc.code)
        except (urllib.error.URLError, TimeoutError) as exc:
            raise ApiError(f"cannot reach {self.cfg.endpoint} ({exc})")
        if not raw:
            return None
        try:
            return json.loads(raw)
        except ValueError:
            return raw

    # ── typed helpers ──────────────────────────────────────────────────────
    def health(self) -> Any:
        return self.request("/api/health")

    def projects(self) -> Any:
        return self.request("/api/projects")

    def project(self, pid: str) -> Any:
        return self.request(f"/api/projects/{pid}")

    def issues(self, pid: str, **filters: Any) -> Any:
        return self.request(f"/api/projects/{pid}/issues", query=filters)

    def issue(self, pid: str, group_key: str) -> Any:
        gk = urllib.parse.quote(group_key, safe="")
        return self.request(f"/api/projects/{pid}/issues/{gk}")

    def set_issue_status(self, pid: str, group_key: str, status: str, note: Optional[str] = None) -> Any:
        gk = urllib.parse.quote(group_key, safe="")
        return self.request(f"/api/projects/{pid}/issues/{gk}/status", method="POST",
                            body={"status": status, "note": note})

    def create_issue(self, pid: str, body: Dict[str, Any]) -> Any:
        return self.request(f"/api/projects/{pid}/issues", method="POST", body=body)

    def sessions(self, pid: str, **filters: Any) -> Any:
        return self.request(f"/api/projects/{pid}/sessions", query=filters)

    def session_events(self, sid: str) -> Any:
        return self.request(f"/api/sessions/{urllib.parse.quote(sid, safe='')}/events")

    def analytics(self, pid: str, days: int = 14, **filters: Any) -> Any:
        return self.request(f"/api/projects/{pid}/analytics", query=dict(days=days, **filters))

    def funnels(self, pid: str, days: int = 30) -> Any:
        return self.request(f"/api/projects/{pid}/funnels", query={"days": days})
