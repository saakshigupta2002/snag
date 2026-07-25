"""Configuration: where the CLI finds your Snag and which project it talks to.

Precedence (highest first), per clig.dev:
    command-line flags  >  environment variables  >  config file

Config file lives at an XDG path: ``$XDG_CONFIG_HOME/snag/config.json``
(default ``~/.config/snag/config.json``). It is plain JSON so it stays
stdlib-only on every supported Python. Secrets are written 0600.
"""

import json
import os
from pathlib import Path
from typing import Optional

ENV_ENDPOINT = "SNAG_ENDPOINT"
ENV_TOKEN = "SNAG_TOKEN"
ENV_PROJECT = "SNAG_PROJECT"

_FIELDS = ("endpoint", "token", "project", "app_url", "safe_mode")


def _config_home() -> Path:
    base = os.environ.get("XDG_CONFIG_HOME") or str(Path.home() / ".config")
    return Path(base) / "snag"


def config_path() -> Path:
    return _config_home() / "config.json"


def data_home() -> Path:
    base = os.environ.get("XDG_DATA_HOME") or str(Path.home() / ".local" / "share")
    return Path(base) / "snag"


def db_path() -> Path:
    return data_home() / "snag.db"


class Config:
    """Resolved configuration for one invocation."""

    def __init__(self, data: Optional[dict] = None):
        d = data or {}
        self.endpoint: str = (d.get("endpoint") or "").rstrip("/")
        self.token: Optional[str] = d.get("token") or None
        self.project: Optional[str] = d.get("project") or None
        self.app_url: Optional[str] = d.get("app_url") or None
        self.safe_mode: bool = d.get("safe_mode", True)

    # ── persistence ────────────────────────────────────────────────────────
    @classmethod
    def load_file(cls) -> "Config":
        try:
            with open(config_path(), "r", encoding="utf-8") as fh:
                return cls(json.load(fh))
        except (FileNotFoundError, ValueError):
            return cls()

    def save(self) -> Path:
        home = _config_home()
        home.mkdir(parents=True, exist_ok=True)
        path = config_path()
        payload = {k: getattr(self, k) for k in _FIELDS if getattr(self, k) not in (None, "")}
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, indent=2, sort_keys=True)
            fh.write("\n")
        try:
            os.chmod(path, 0o600)  # token lives here — keep it private
        except OSError:
            pass
        return path


def resolve(endpoint: Optional[str] = None,
            token: Optional[str] = None,
            project: Optional[str] = None) -> Config:
    """Merge file < env < explicit flags into one effective config."""
    cfg = Config.load_file()
    cfg.endpoint = (endpoint or os.environ.get(ENV_ENDPOINT) or cfg.endpoint or "").rstrip("/")
    cfg.token = token or os.environ.get(ENV_TOKEN) or cfg.token
    cfg.project = project or os.environ.get(ENV_PROJECT) or cfg.project
    return cfg
