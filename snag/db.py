"""A local SQLite mirror of what the CLI has seen: the durable "bug ledger".

Snag prunes sessions on a retention window; this keeps a local copy of the
issues and session summaries you've pulled, so history survives and repeat
reads work offline. It is a cache, never the source of truth.
"""

import json
import sqlite3
import time
from typing import Any, Dict, List, Optional

from .config import data_home, db_path

_SCHEMA = """
CREATE TABLE IF NOT EXISTS issues (
  project     TEXT NOT NULL,
  group_key   TEXT NOT NULL,
  detector    TEXT,
  severity    TEXT,
  status      TEXT,
  title       TEXT,
  last_seen   TEXT,
  data        TEXT NOT NULL,
  seen_at     REAL NOT NULL,
  PRIMARY KEY (project, group_key)
);
CREATE TABLE IF NOT EXISTS sessions (
  project      TEXT NOT NULL,
  id           TEXT NOT NULL,
  started_at   TEXT,
  interactions INTEGER,
  data         TEXT NOT NULL,
  seen_at      REAL NOT NULL,
  PRIMARY KEY (project, id)
);
"""


def connect() -> sqlite3.Connection:
    data_home().mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path()))
    conn.executescript(_SCHEMA)
    return conn


def save_issues(conn: sqlite3.Connection, project: str, groups: List[Dict[str, Any]]) -> None:
    now = time.time()
    conn.executemany(
        "INSERT OR REPLACE INTO issues "
        "(project, group_key, detector, severity, status, title, last_seen, data, seen_at) "
        "VALUES (?,?,?,?,?,?,?,?,?)",
        [(project, g.get("groupKey"), g.get("detector"), g.get("severity"), g.get("status"),
          g.get("title"), g.get("lastSeen"), json.dumps(g), now) for g in groups],
    )
    conn.commit()


def save_sessions(conn: sqlite3.Connection, project: str, sessions: List[Dict[str, Any]]) -> None:
    now = time.time()
    conn.executemany(
        "INSERT OR REPLACE INTO sessions "
        "(project, id, started_at, interactions, data, seen_at) VALUES (?,?,?,?,?,?)",
        [(project, s.get("id"), s.get("startedAt"), s.get("interactions"), json.dumps(s), now)
         for s in sessions],
    )
    conn.commit()


def ledger(conn: sqlite3.Connection, project: str, limit: int = 200) -> List[Dict[str, Any]]:
    """Every issue ever recorded locally for a project: newest first."""
    cur = conn.execute(
        "SELECT data FROM issues WHERE project = ? ORDER BY last_seen DESC LIMIT ?",
        (project, limit),
    )
    return [json.loads(r[0]) for r in cur.fetchall()]
