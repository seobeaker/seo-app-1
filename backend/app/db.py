"""SQLite storage: API response cache, spend log, locations, saved keyword lists."""
from __future__ import annotations

import hashlib
import json
import sqlite3
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

SCHEMA = """
CREATE TABLE IF NOT EXISTS api_cache (
    key TEXT PRIMARY KEY,
    endpoint TEXT NOT NULL,
    request_json TEXT NOT NULL,
    response_json TEXT NOT NULL,
    cost REAL NOT NULL DEFAULT 0,
    fetched_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS api_calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    day TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    cost REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_api_calls_day ON api_calls(day);
CREATE TABLE IF NOT EXISTS locations (
    location_code INTEGER PRIMARY KEY,
    location_name TEXT NOT NULL,
    location_code_parent INTEGER,
    country_iso_code TEXT,
    location_type TEXT
);
CREATE INDEX IF NOT EXISTS idx_locations_parent ON locations(location_code_parent);
CREATE INDEX IF NOT EXISTS idx_locations_country ON locations(country_iso_code, location_type);
CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS list_items (
    list_id INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    keyword TEXT NOT NULL,
    data_json TEXT NOT NULL,
    added_at TEXT NOT NULL,
    PRIMARY KEY (list_id, keyword)
);
"""


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def cache_key(endpoint: str, body: Any) -> str:
    raw = endpoint + "|" + json.dumps(body, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode()).hexdigest()


class Database:
    def __init__(self, path: str):
        if path != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA foreign_keys = ON")
        self._conn.execute("PRAGMA journal_mode = WAL") if path != ":memory:" else None
        self._lock = threading.Lock()
        with self._lock:
            self._conn.executescript(SCHEMA)
            self._conn.commit()

    def _exec(self, sql: str, params: tuple = ()) -> sqlite3.Cursor:
        with self._lock:
            cur = self._conn.execute(sql, params)
            self._conn.commit()
            return cur

    def _all(self, sql: str, params: tuple = ()) -> list[sqlite3.Row]:
        with self._lock:
            return self._conn.execute(sql, params).fetchall()

    # ---- cache -------------------------------------------------------------
    def cache_get(self, key: str, ttl_days: int) -> dict | None:
        rows = self._all("SELECT response_json, fetched_at FROM api_cache WHERE key = ?", (key,))
        if not rows:
            return None
        fetched_at = datetime.fromisoformat(rows[0]["fetched_at"])
        if utcnow() - fetched_at > timedelta(days=ttl_days):
            return None
        return {"response": json.loads(rows[0]["response_json"]), "fetched_at": rows[0]["fetched_at"]}

    def cache_put(self, key: str, endpoint: str, body: Any, response: dict, cost: float) -> str:
        fetched_at = utcnow().isoformat()
        self._exec(
            "INSERT OR REPLACE INTO api_cache(key, endpoint, request_json, response_json, cost, fetched_at)"
            " VALUES (?,?,?,?,?,?)",
            (key, endpoint, json.dumps(body), json.dumps(response), cost, fetched_at),
        )
        return fetched_at

    # ---- spend -------------------------------------------------------------
    def log_call(self, endpoint: str, cost: float) -> None:
        now = utcnow()
        self._exec(
            "INSERT INTO api_calls(ts, day, endpoint, cost) VALUES (?,?,?,?)",
            (now.isoformat(), now.date().isoformat(), endpoint, cost),
        )

    def spend_today(self) -> float:
        rows = self._all(
            "SELECT COALESCE(SUM(cost), 0) AS s FROM api_calls WHERE day = ?", (utcnow().date().isoformat(),)
        )
        return float(rows[0]["s"])

    def spend_total(self) -> float:
        return float(self._all("SELECT COALESCE(SUM(cost), 0) AS s FROM api_calls")[0]["s"])

    # ---- meta --------------------------------------------------------------
    def meta_get(self, key: str) -> str | None:
        rows = self._all("SELECT value FROM meta WHERE key = ?", (key,))
        return rows[0]["value"] if rows else None

    def meta_set(self, key: str, value: str) -> None:
        self._exec("INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)", (key, value))

    # ---- locations ---------------------------------------------------------
    def replace_locations(self, items: list[dict]) -> None:
        with self._lock:
            self._conn.execute("DELETE FROM locations")
            self._conn.executemany(
                "INSERT OR REPLACE INTO locations VALUES (?,?,?,?,?)",
                [
                    (
                        i["location_code"],
                        i["location_name"],
                        i.get("location_code_parent"),
                        i.get("country_iso_code"),
                        i.get("location_type"),
                    )
                    for i in items
                ],
            )
            self._conn.commit()

    def locations_count(self) -> int:
        return int(self._all("SELECT COUNT(*) AS c FROM locations")[0]["c"])

    def countries(self) -> list[dict]:
        rows = self._all(
            "SELECT * FROM locations WHERE location_type = 'Country' ORDER BY location_name"
        )
        return [dict(r) for r in rows]

    def location(self, code: int) -> dict | None:
        rows = self._all("SELECT * FROM locations WHERE location_code = ?", (code,))
        return dict(rows[0]) if rows else None

    def children(self, parent_code: int, cities: bool | None = None) -> list[dict]:
        sql = "SELECT * FROM locations WHERE location_code_parent = ?"
        if cities is True:
            sql += " AND location_type = 'City'"
        elif cities is False:
            sql += " AND location_type != 'City'"
        rows = self._all(sql + " ORDER BY location_name", (parent_code,))
        return [dict(r) for r in rows]

    # ---- lists -------------------------------------------------------------
    def lists(self) -> list[dict]:
        rows = self._all(
            "SELECT l.id, l.name, l.created_at, COUNT(i.keyword) AS count FROM lists l"
            " LEFT JOIN list_items i ON i.list_id = l.id GROUP BY l.id ORDER BY l.created_at DESC"
        )
        return [dict(r) for r in rows]

    def create_list(self, name: str) -> dict:
        cur = self._exec("INSERT INTO lists(name, created_at) VALUES (?, ?)", (name, utcnow().isoformat()))
        return {"id": cur.lastrowid, "name": name, "count": 0}

    def delete_list(self, list_id: int) -> None:
        self._exec("DELETE FROM lists WHERE id = ?", (list_id,))

    def get_list(self, list_id: int) -> dict | None:
        rows = self._all("SELECT * FROM lists WHERE id = ?", (list_id,))
        if not rows:
            return None
        items = self._all(
            "SELECT keyword, data_json, added_at FROM list_items WHERE list_id = ? ORDER BY added_at", (list_id,)
        )
        return {
            **dict(rows[0]),
            "items": [{**json.loads(r["data_json"]), "keyword": r["keyword"], "added_at": r["added_at"]} for r in items],
        }

    def add_list_items(self, list_id: int, items: list[dict]) -> int:
        now = utcnow().isoformat()
        with self._lock:
            self._conn.executemany(
                "INSERT OR REPLACE INTO list_items(list_id, keyword, data_json, added_at) VALUES (?,?,?,?)",
                [(list_id, i["keyword"], json.dumps(i), now) for i in items],
            )
            self._conn.commit()
        return len(items)

    def remove_list_items(self, list_id: int, keywords: list[str]) -> None:
        with self._lock:
            self._conn.executemany(
                "DELETE FROM list_items WHERE list_id = ? AND keyword = ?", [(list_id, k) for k in keywords]
            )
            self._conn.commit()

    def search_cities(self, country_iso: str, q: str, limit: int = 50) -> list[dict]:
        rows = self._all(
            "SELECT * FROM locations WHERE country_iso_code = ? AND location_type IN ('City','Municipality')"
            " AND location_name LIKE ? ORDER BY length(location_name), location_name LIMIT ?",
            (country_iso, f"{q}%", limit),
        )
        return [dict(r) for r in rows]
