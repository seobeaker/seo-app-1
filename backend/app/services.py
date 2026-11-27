"""Business logic: locations, keyword searches, normalisation, cost estimates."""
from __future__ import annotations

import json
import math
import re
from datetime import datetime, timedelta
from typing import Any, Literal

from pydantic import BaseModel, Field

from .config import Settings
from .dataforseo import DataForSEOClient
from .db import Database, utcnow

Mode = Literal["broad", "phrase", "questions", "related", "ideas"]

QUESTION_WORDS = [
    "how", "what", "why", "when", "where", "who", "which", "whose", "can", "could", "is", "are", "do",
    "does", "did", "should", "will", "would", "was", "were", "has", "have",
]
QUESTION_RE = re.compile(r"^(" + "|".join(QUESTION_WORDS) + r")\b", re.I)
QUESTION_FILTER = ["keyword", "regex", "^(" + "|".join(QUESTION_WORDS) + ")\\s"]

# Google Ads location types we offer in the "State / region" dropdown.
REGION_EXCLUDE = {
    "City", "Postal Code", "Airport", "University", "Neighborhood", "DMA Region", "Congressional District",
    "National Park", "TV Region", "Borough", "City Region", "District", "Municipality",
}


class SearchRequest(BaseModel):
    keyword: str = Field(min_length=1, max_length=80)
    location_code: int  # country
    language_code: str = "en"
    mode: Mode = "broad"
    region_code: int | None = None  # state / region / city for Google Ads regional volume
    limit: int = Field(default=200, ge=1, le=1000)
    include_serp_info: bool = True
    include_clickstream_data: bool = False
    related_depth: int = Field(default=2, ge=0, le=4)
    refresh: bool = False


class RegionalVolumeRequest(BaseModel):
    keywords: list[str] = Field(min_length=1, max_length=1000)
    location_code: int
    language_code: str = "en"
    refresh: bool = False


# ---------------------------------------------------------------------------
# Locations
# ---------------------------------------------------------------------------
class LocationService:
    def __init__(self, settings: Settings, db: Database, client: DataForSEOClient):
        self.s, self.db, self.client = settings, db, client

    def _stale(self, key: str) -> bool:
        ts = self.db.meta_get(key)
        if not ts:
            return True
        return utcnow() - datetime.fromisoformat(ts) > timedelta(days=self.s.locations_ttl_days)

    async def ensure(self, force: bool = False) -> None:
        if force or self.db.locations_count() == 0 or self._stale("locations_fetched_at"):
            # Large (all Google Ads locations worldwide) and free; stored in the locations table,
            # so skip the generic response cache (ttl 0 + refresh).
            res = await self.client.call("keywords_data/google_ads/locations", method="GET", refresh=True, ttl_days=0)
            items = res["result"]
            if items:
                self.db.replace_locations(items)
                self.db.meta_set("locations_fetched_at", utcnow().isoformat())
        if force or self._stale("labs_locations_fetched_at"):
            res = await self.client.call("dataforseo_labs/locations_and_languages", method="GET", refresh=True)
            labs = {
                str(i["location_code"]): [
                    {"language_code": l["language_code"], "language_name": l["language_name"]}
                    for l in (i.get("available_languages") or [])
                ]
                for i in res["result"]
                if i.get("location_type") == "Country"
            }
            self.db.meta_set("labs_locations", json.dumps(labs))
            self.db.meta_set("labs_locations_fetched_at", utcnow().isoformat())

    def labs_map(self) -> dict[str, list[dict]]:
        raw = self.db.meta_get("labs_locations")
        return json.loads(raw) if raw else {}

    def is_labs(self, location_code: int) -> bool:
        return str(location_code) in self.labs_map()

    async def countries(self) -> list[dict]:
        await self.ensure()
        labs = self.labs_map()
        return [
            {
                "location_code": c["location_code"],
                "name": c["location_name"],
                "iso": c["country_iso_code"],
                "labs": str(c["location_code"]) in labs,
            }
            for c in self.db.countries()
        ]

    async def children(self, parent_code: int) -> list[dict]:
        """Regions under a country, or cities under a region."""
        await self.ensure()
        parent = self.db.location(parent_code)
        if not parent:
            return []
        if parent["location_type"] == "Country":
            rows = [r for r in self.db.children(parent_code) if r["location_type"] not in REGION_EXCLUDE]
        else:
            rows = self.db.children(parent_code, cities=True)
        return [_loc_out(r) for r in rows]

    async def search_cities(self, country_iso: str, q: str) -> list[dict]:
        await self.ensure()
        return [_loc_out(r) for r in self.db.search_cities(country_iso.upper(), q)]

    async def languages(self, location_code: int) -> list[dict]:
        await self.ensure()
        labs = self.labs_map().get(str(location_code))
        if labs:
            return labs
        res = await self.client.call("keywords_data/google_ads/languages", method="GET", ttl_days=self.s.locations_ttl_days)
        return sorted(
            [{"language_code": l["language_code"], "language_name": l["language_name"]} for l in res["result"]],
            key=lambda l: l["language_name"],
        )


def _loc_out(r: dict) -> dict:
    return {
        "location_code": r["location_code"],
        "name": r["location_name"].split(",")[0],
        "full_name": r["location_name"],
        "type": r["location_type"],
        "parent": r["location_code_parent"],
    }


# ---------------------------------------------------------------------------
# Normalisation
# ---------------------------------------------------------------------------
def dfs_time_to_iso(value: str | None) -> str | None:
    """'2026-10-21 09:13:44 +00:00' -> '2026-10-21T09:13:44+00:00'."""
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d %H:%M:%S %z").isoformat()
    except ValueError:
        return value


def normalise_labs_item(item: dict) -> dict:
    data = item.get("keyword_data") or item  # related_keywords wraps items in keyword_data
    ki = data.get("keyword_info") or {}
    kp = data.get("keyword_properties") or {}
    si = data.get("search_intent_info") or {}
    serp = data.get("serp_info") or {}
    monthly = sorted(
        (ki.get("monthly_searches") or []), key=lambda m: (m.get("year", 0), m.get("month", 0))
    )
    return {
        "keyword": data.get("keyword"),
        "search_volume": ki.get("search_volume"),
        "cpc": ki.get("cpc"),
        "competition": ki.get("competition"),
        "competition_level": ki.get("competition_level"),
        "kd": kp.get("keyword_difficulty"),
        "intent": si.get("main_intent"),
        "secondary_intents": si.get("foreign_intent") or [],
        "monthly_searches": [{"year": m["year"], "month": m["month"], "search_volume": m.get("search_volume")} for m in monthly],
        "serp_features": [t for t in (serp.get("serp_item_types") or []) if t != "organic"],
        "serp_url": serp.get("check_url"),
        "updated": dfs_time_to_iso(ki.get("last_updated_time") or serp.get("last_updated_time")),
        "updated_source": "dataforseo",
        "regional_volume": None,
    }


def normalise_ads_item(item: dict, fetched_at: str) -> dict:
    monthly = sorted((item.get("monthly_searches") or []), key=lambda m: (m.get("year", 0), m.get("month", 0)))
    ci = item.get("competition_index")
    return {
        "keyword": item.get("keyword"),
        "search_volume": item.get("search_volume"),
        "cpc": item.get("cpc"),
        "competition": (ci / 100) if ci is not None else None,
        "competition_level": item.get("competition"),
        "kd": None,
        "intent": None,
        "secondary_intents": [],
        "monthly_searches": [{"year": m["year"], "month": m["month"], "search_volume": m.get("search_volume")} for m in monthly],
        "serp_features": [],
        "serp_url": None,
        "updated": fetched_at,  # Google Ads has no last-updated field; use when we fetched it
        "updated_source": "fetched",
        "regional_volume": None,
    }


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------
class SearchService:
    def __init__(self, settings: Settings, db: Database, client: DataForSEOClient, locations: LocationService):
        self.s, self.db, self.client, self.locations = settings, db, client, locations

    def estimate(self, req: SearchRequest, labs: bool) -> dict:
        s = self.s
        parts: list[dict] = []
        if labs:
            items = req.limit
            if req.mode == "related":
                items = min(req.limit, [1, 8, 72, 584, 4680][req.related_depth])
            c = s.price_labs_per_task + s.price_labs_per_item * items
            if req.include_clickstream_data:
                c *= 2
            parts.append({"label": f"Labs {req.mode} (up to {items} rows)", "usd": round(c, 4)})
        else:
            parts.append({"label": "Google Ads keyword ideas", "usd": s.price_google_ads_kfk_per_task})
            parts.append({"label": "Search intent", "usd": round(s.price_labs_per_task + s.price_labs_per_item * req.limit, 4)})
        if req.region_code:
            calls = math.ceil(req.limit / 1000)
            parts.append({"label": "Google Ads regional volume", "usd": round(s.price_google_ads_volume_per_task * calls, 4)})
        total = round(sum(p["usd"] for p in parts), 4)
        return {
            "total_usd": total,
            "parts": parts,
            "spent_today_usd": round(self.db.spend_today(), 4),
            "cap_usd": s.daily_spend_cap_usd,
            "note": "Estimate from the price settings in .env; cached searches cost nothing.",
        }

    async def search(self, req: SearchRequest) -> dict:
        await self.locations.ensure()
        labs = self.locations.is_labs(req.location_code)
        est = self.estimate(req, labs)
        seed = req.keyword.strip().lower()
        total_cost = 0.0
        cached_all = True
        fetched_at = None
        common = {"location_code": req.location_code, "language_code": req.language_code}

        if labs:
            opts = {
                "include_serp_info": req.include_serp_info,
                "include_clickstream_data": req.include_clickstream_data,
            }
            labs_est = est["parts"][0]["usd"]
            if req.mode in ("broad", "phrase", "questions"):
                task: dict[str, Any] = {
                    "keyword": seed, **common, **opts, "limit": req.limit,
                    "include_seed_keyword": True, "order_by": ["keyword_info.search_volume,desc"],
                }
                if req.mode == "phrase":
                    task["exact_match"] = True
                if req.mode == "questions":
                    task["filters"] = [QUESTION_FILTER]
                res = await self.client.call("dataforseo_labs/google/keyword_suggestions/live", task,
                                             estimate=labs_est, refresh=req.refresh)
            elif req.mode == "related":
                task = {"keyword": seed, **common, **opts, "depth": req.related_depth, "limit": req.limit,
                        "include_seed_keyword": True,
                        "order_by": ["keyword_data.keyword_info.search_volume,desc"]}
                res = await self.client.call("dataforseo_labs/google/related_keywords/live", task,
                                             estimate=labs_est, refresh=req.refresh)
            else:  # ideas
                task = {"keywords": [seed], **common, **opts, "limit": req.limit,
                        "order_by": ["keyword_info.search_volume,desc"]}
                res = await self.client.call("dataforseo_labs/google/keyword_ideas/live", task,
                                             estimate=labs_est, refresh=req.refresh)
            total_cost += res["cost"]
            cached_all &= res["cached"]
            fetched_at = res["fetched_at"]
            rows: list[dict] = []
            for r in res["result"]:
                sd = r.get("seed_keyword_data")
                if sd and req.mode != "questions":
                    rows.append(normalise_labs_item(sd))
                rows.extend(normalise_labs_item(i) for i in (r.get("items") or []))
        else:
            task = {"keywords": [seed], **common, "sort_by": "search_volume"}
            res = await self.client.call("keywords_data/google_ads/keywords_for_keywords/live", task,
                                         estimate=est["parts"][0]["usd"], refresh=req.refresh)
            total_cost += res["cost"]
            cached_all &= res["cached"]
            fetched_at = res["fetched_at"]
            rows = [normalise_ads_item(i, res["fetched_at"]) for i in res["result"]]
            rows.sort(key=lambda r: r["search_volume"] or 0, reverse=True)
            if req.mode == "phrase":
                rows = [r for r in rows if seed in (r["keyword"] or "")]
            rows = rows[: req.limit]
            if rows:
                intents = await self.client.call(
                    "dataforseo_labs/google/search_intent/live",
                    {"keywords": [r["keyword"] for r in rows], "language_code": req.language_code},
                    estimate=est["parts"][1]["usd"], refresh=req.refresh,
                )
                total_cost += intents["cost"]
                by_kw = {}
                for r in intents["result"]:
                    for i in r.get("items") or []:
                        by_kw[i["keyword"]] = i
                for row in rows:
                    i = by_kw.get(row["keyword"])
                    if i and i.get("keyword_intent"):
                        row["intent"] = i["keyword_intent"]["label"]
                        row["secondary_intents"] = [x["label"] for x in (i.get("secondary_keyword_intents") or [])]

        if req.mode == "questions":
            rows = [r for r in rows if r["keyword"] and QUESTION_RE.search(r["keyword"])]

        # de-duplicate, keep first
        seen: set[str] = set()
        rows = [r for r in rows if r["keyword"] and not (r["keyword"] in seen or seen.add(r["keyword"]))]

        regional = None
        if req.region_code and rows:
            regional = await self.regional_volume(
                RegionalVolumeRequest(keywords=[r["keyword"] for r in rows][:1000], location_code=req.region_code,
                                      language_code=req.language_code, refresh=req.refresh)
            )
            total_cost += regional["cost"]
            cached_all &= regional["cached"]
            vols = regional["volumes"]
            for r in rows:
                r["regional_volume"] = vols.get(r["keyword"])

        region = self.db.location(req.region_code) if req.region_code else None
        return {
            "rows": rows,
            "meta": {
                "seed": seed,
                "mode": req.mode,
                "location_code": req.location_code,
                "language_code": req.language_code,
                "source": "labs" if labs else "google_ads",
                "region": {"location_code": region["location_code"], "name": region["location_name"],
                           "type": region["location_type"]} if region else None,
                "regional_fetched_at": regional["fetched_at"] if regional else None,
                "cost_usd": round(total_cost, 4),
                "cached": cached_all,
                "fetched_at": fetched_at,
                "estimate": est,
                "spent_today_usd": round(self.db.spend_today(), 4),
            },
        }

    async def regional_volume(self, req: RegionalVolumeRequest) -> dict:
        kws = [k.strip().lower() for k in req.keywords if k.strip() and len(k) <= 80 and len(k.split()) <= 10]
        kws = list(dict.fromkeys(kws))
        res = await self.client.call(
            "keywords_data/google_ads/search_volume/live",
            {"keywords": kws, "location_code": req.location_code, "language_code": req.language_code},
            estimate=self.s.price_google_ads_volume_per_task, refresh=req.refresh,
        )
        return {
            "volumes": {i["keyword"]: i.get("search_volume") for i in res["result"]},
            "rows": [normalise_ads_item(i, res["fetched_at"]) for i in res["result"]],
            "cost": res["cost"],
            "cached": res["cached"],
            "fetched_at": res["fetched_at"],
        }
