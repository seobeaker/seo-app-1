"""Thin async DataForSEO v3 client with SQLite caching, spend logging and a daily cap."""
from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

from .config import Settings
from .db import Database, cache_key
from . import mock

log = logging.getLogger(__name__)


class DataForSEOError(Exception):
    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


class SpendCapExceeded(DataForSEOError):
    def __init__(self, message: str):
        super().__init__(message, status=402)


class DataForSEOClient:
    def __init__(self, settings: Settings, db: Database, http: httpx.AsyncClient | None = None):
        self.s = settings
        self.db = db
        self.mock = settings.dataforseo_mock
        if not self.mock and not (settings.dataforseo_login and settings.dataforseo_password):
            log.warning("DATAFORSEO_LOGIN/PASSWORD not set; API calls will fail. Set DATAFORSEO_MOCK=true to try the UI.")
        self._http = http or httpx.AsyncClient(
            base_url=settings.dataforseo_base_url,
            auth=(settings.dataforseo_login, settings.dataforseo_password),
            timeout=httpx.Timeout(120.0, connect=15.0),
            headers={"Content-Type": "application/json"},
        )

    async def aclose(self) -> None:
        await self._http.aclose()

    def check_budget(self, estimate: float) -> None:
        spent = self.db.spend_today()
        cap = self.s.daily_spend_cap_usd
        if cap > 0 and spent + estimate > cap:
            raise SpendCapExceeded(
                f"Daily spend cap reached: spent ${spent:.4f} today, this request is estimated at "
                f"${estimate:.4f}, cap is ${cap:.2f}. Raise DAILY_SPEND_CAP_USD in .env or wait until tomorrow (UTC)."
            )

    async def _request(self, method: str, endpoint: str, body: Any | None) -> dict:
        if self.mock:
            return mock.respond(endpoint, body)
        last_exc: Exception | None = None
        for attempt in range(4):
            try:
                if method == "GET":
                    r = await self._http.get(f"/{endpoint}")
                else:
                    r = await self._http.post(f"/{endpoint}", json=body)
                if r.status_code in (429, 500, 502, 503, 504):
                    raise httpx.HTTPStatusError("retryable", request=r.request, response=r)
                if r.status_code == 401:
                    raise DataForSEOError("DataForSEO rejected the credentials (401). Check DATAFORSEO_LOGIN/PASSWORD in .env.", 401)
                r.raise_for_status()
                return r.json()
            except (httpx.TransportError, httpx.HTTPStatusError) as exc:
                last_exc = exc
                await asyncio.sleep(1.5 * (2**attempt))
        raise DataForSEOError(f"DataForSEO request failed after retries: {last_exc}")

    async def call(
        self,
        endpoint: str,
        task: dict | None = None,
        *,
        method: str = "POST",
        estimate: float = 0.0,
        ttl_days: int | None = None,
        refresh: bool = False,
    ) -> dict:
        """Call an endpoint with a single task. Returns {"result": [...], "cost", "cached", "fetched_at"}.

        `result` is tasks[0].result (a list). Raises DataForSEOError on any API-level error.
        """
        body = [task] if task is not None else None
        key = cache_key(endpoint, body)
        ttl = self.s.cache_ttl_days if ttl_days is None else ttl_days
        if not refresh:
            hit = self.db.cache_get(key, ttl)
            if hit:
                return {**hit["response"], "cost": 0.0, "cached": True, "fetched_at": hit["fetched_at"]}

        if estimate > 0:
            self.check_budget(estimate)

        data = await self._request(method, endpoint, body)
        cost = float(data.get("cost") or 0)
        self.db.log_call(endpoint, cost)

        if data.get("status_code") != 20000:
            raise DataForSEOError(f"DataForSEO error {data.get('status_code')}: {data.get('status_message')}")
        tasks = data.get("tasks") or []
        if not tasks:
            raise DataForSEOError("DataForSEO returned no tasks")
        t = tasks[0]
        if t.get("status_code") != 20000:
            raise DataForSEOError(f"DataForSEO task error {t.get('status_code')}: {t.get('status_message')}", 400)

        payload = {"result": t.get("result") or []}
        fetched_at = self.db.cache_put(key, endpoint, body, payload, cost)
        return {**payload, "cost": cost, "cached": False, "fetched_at": fetched_at}
