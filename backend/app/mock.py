"""Offline mock of the DataForSEO endpoints this app uses.

Enabled with DATAFORSEO_MOCK=true. Responses use the real envelope and item shapes
(tasks[].result[].items[]), with deterministic made-up numbers, so the UI and the
parsing code can be exercised without credentials or cost. Location codes for
states/cities here are FAKE (9xxxxxx) and only exist in mock mode.
"""
from __future__ import annotations

import hashlib
from datetime import date

COUNTRIES = [
    (2036, "Australia", "AU"),
    (2124, "Canada", "CA"),
    (2356, "India", "IN"),
    (2826, "United Kingdom", "GB"),
    (2840, "United States", "US"),
]
REGIONS = {
    2036: [("New South Wales", ["Sydney", "Newcastle"]), ("Victoria", ["Melbourne", "Geelong"]),
           ("Queensland", ["Brisbane", "Gold Coast"]), ("Western Australia", ["Perth"])],
    2840: [("California", ["Los Angeles", "San Francisco"]), ("New York", ["New York"]), ("Texas", ["Austin", "Houston"])],
    2826: [("England", ["London", "Manchester"]), ("Scotland", ["Edinburgh"])],
    2356: [("Karnataka", ["Bengaluru"]), ("Kerala", ["Kochi", "Thiruvananthapuram"]), ("Maharashtra", ["Mumbai"])],
    2124: [("Ontario", ["Toronto"]), ("British Columbia", ["Vancouver"])],
}
LABS_COUNTRIES = {2036, 2124, 2356, 2826, 2840}

MODIFIERS = [
    "best", "near me", "services", "company", "agency", "cost", "price", "local", "for small business",
    "melbourne", "sydney", "expert", "consultant", "tips", "checklist", "tools", "course", "free",
    "audit", "strategy", "marketing", "packages", "pricing", "reviews", "guide", "examples",
]
QUESTIONS = ["how to", "what is", "why", "how much does", "which", "where to find", "can i", "is"]
SERP_TYPES = ["organic", "local_pack", "people_also_ask", "featured_snippet", "video", "images", "ai_overview",
              "related_searches", "paid", "knowledge_graph"]
INTENTS = ["informational", "commercial", "transactional", "navigational"]


def _h(s: str) -> int:
    return int(hashlib.md5(s.encode()).hexdigest(), 16)


def locations() -> list[dict]:
    out, code = [], 9000001
    for c_code, name, iso in COUNTRIES:
        out.append({"location_code": c_code, "location_name": name, "location_code_parent": None,
                    "country_iso_code": iso, "location_type": "Country"})
        for region, cities in REGIONS.get(c_code, []):
            r_code = code
            code += 1
            out.append({"location_code": r_code, "location_name": f"{region},{name}", "location_code_parent": c_code,
                        "country_iso_code": iso, "location_type": "State"})
            for city in cities:
                out.append({"location_code": code, "location_name": f"{city},{region},{name}",
                            "location_code_parent": r_code, "country_iso_code": iso, "location_type": "City"})
                code += 1
    return out


def labs_locations() -> list[dict]:
    return [
        {"location_code": c, "location_name": n, "location_code_parent": None, "country_iso_code": iso,
         "location_type": "Country",
         "available_languages": [{"available_sources": ["google"], "language_name": "English", "language_code": "en",
                                  "keywords": 1000000, "serps": 100000}]}
        for c, n, iso in COUNTRIES if c in LABS_COUNTRIES
    ]


def _monthly(seed: str, volume: int) -> list[dict]:
    today = date.today()
    out = []
    y, m = today.year, today.month
    for i in range(12):
        m -= 1
        if m == 0:
            m, y = 12, y - 1
        factor = 0.7 + (_h(f"{seed}{i}") % 60) / 100
        out.append({"year": y, "month": m, "search_volume": int(volume * factor)})
    return out


def _labs_item(kw: str, location_code: int, serp: bool) -> dict:
    h = _h(kw)
    volume = [10, 20, 30, 50, 70, 90, 110, 140, 170, 210, 260, 320, 390, 480, 590, 720, 880, 1000, 1300, 1600,
              2400, 3600, 5400, 8100][h % 24]
    if len(kw.split()) > 4:
        volume = max(10, volume // 8)
    intent = INTENTS[h % 3] if not kw.split()[0] in ("how", "what", "why", "which", "where", "can", "is") else "informational"
    updated = "2026-10-21 09:13:44 +00:00"
    return {
        "se_type": "google",
        "keyword": kw,
        "location_code": location_code,
        "language_code": "en",
        "keyword_info": {
            "se_type": "google",
            "last_updated_time": updated,
            "competition": round((h % 100) / 100, 2),
            "competition_level": ["LOW", "MEDIUM", "HIGH"][h % 3],
            "cpc": round((h % 5000) / 100, 2) if h % 7 else None,
            "search_volume": volume,
            "low_top_of_page_bid": 1.2,
            "high_top_of_page_bid": 9.8,
            "categories": [10019],
            "monthly_searches": _monthly(kw, volume),
        },
        "keyword_properties": {"se_type": "google", "core_keyword": None, "keyword_difficulty": h % 70,
                               "detected_language": "en", "is_another_language": False,
                               "words_count": len(kw.split())},
        "search_intent_info": {"se_type": "google", "main_intent": intent,
                               "foreign_intent": ["commercial"] if h % 4 == 0 and intent != "commercial" else None,
                               "last_updated_time": updated},
        "serp_info": {"se_type": "google", "check_url": f"https://www.google.com/search?q={kw.replace(' ', '+')}",
                      "serp_item_types": ["organic"] + [t for i, t in enumerate(SERP_TYPES[1:]) if (h >> i) & 1],
                      "se_results_count": h % 10_000_000, "last_updated_time": updated,
                      "previous_updated_time": "2026-09-20 08:00:00 +00:00"} if serp else None,
        "avg_backlinks_info": None,
    }


def _candidates(seed: str, mode: str) -> list[str]:
    seed = seed.strip().lower()
    if mode == "questions":
        return [f"{q} {seed}" for q in QUESTIONS] + [f"{q} {seed} {m}" for q in QUESTIONS[:4] for m in MODIFIERS[:6]]
    kws = [seed] + [f"{seed} {m}" for m in MODIFIERS] + [f"{m} {seed}" for m in MODIFIERS[:10]]
    if mode == "broad":
        words = seed.split()
        if len(words) > 1:
            rev = " ".join(reversed(words))
            kws += [rev] + [f"{rev} {m}" for m in MODIFIERS[:12]]
    if mode in ("related", "ideas"):
        first = seed.split()[0]
        kws = [f"{first} {m}" for m in MODIFIERS] + [f"{m} {first}" for m in MODIFIERS[:8]] + kws[:15]
    return list(dict.fromkeys(kws))


def _envelope(result: list, cost: float) -> dict:
    return {"version": "0.1.mock", "status_code": 20000, "status_message": "Ok.", "cost": cost,
            "tasks_count": 1, "tasks_error": 0,
            "tasks": [{"id": "mock", "status_code": 20000, "status_message": "Ok.", "cost": cost,
                       "result_count": len(result), "result": result}]}


def respond(endpoint: str, body: list | None) -> dict:
    task = (body or [{}])[0]
    loc = task.get("location_code", 2840)
    serp = bool(task.get("include_serp_info"))
    limit = int(task.get("limit", 100))

    if endpoint == "keywords_data/google_ads/locations":
        return _envelope(locations(), 0)
    if endpoint == "dataforseo_labs/locations_and_languages":
        return _envelope(labs_locations(), 0)
    if endpoint == "keywords_data/google_ads/languages":
        return _envelope([{"language_name": "English", "language_code": "en"},
                          {"language_name": "Hindi", "language_code": "hi"},
                          {"language_name": "French", "language_code": "fr"}], 0)

    if endpoint == "dataforseo_labs/google/keyword_suggestions/live":
        mode = "phrase" if task.get("exact_match") else "broad"
        flt = str(task.get("filters") or "")
        if "regex" in flt:
            mode = "questions"
        kws = [k for k in _candidates(task["keyword"], mode) if k != task["keyword"].lower()][:limit]
        items = [_labs_item(k, loc, serp) for k in kws]
        return _envelope([{"se_type": "google", "seed_keyword": task["keyword"], "location_code": loc,
                           "language_code": "en", "total_count": len(items), "items_count": len(items),
                           "items": items}], 0.01 + 0.0001 * len(items))
    if endpoint == "dataforseo_labs/google/related_keywords/live":
        kws = _candidates(task["keyword"], "related")[:limit]
        items = [{"se_type": "google", "keyword_data": _labs_item(k, loc, serp), "depth": 1,
                  "related_keywords": []} for k in kws]
        return _envelope([{"se_type": "google", "seed_keyword": task["keyword"], "total_count": len(items),
                           "items_count": len(items), "items": items}], 0.01 + 0.0001 * len(items))
    if endpoint == "dataforseo_labs/google/keyword_ideas/live":
        kws = _candidates(task["keywords"][0], "ideas")[:limit]
        items = [_labs_item(k, loc, serp) for k in kws]
        return _envelope([{"se_type": "google", "seed_keywords": task["keywords"], "total_count": len(items),
                           "items_count": len(items), "items": items}], 0.01 + 0.0001 * len(items))
    if endpoint == "dataforseo_labs/google/bulk_keyword_difficulty/live":
        items = [{"se_type": "google", "keyword": k, "keyword_difficulty": _h(k) % 70} for k in task["keywords"]]
        return _envelope([{"items_count": len(items), "items": items}], 0.01)
    if endpoint == "dataforseo_labs/google/search_intent/live":
        items = [{"keyword": k, "keyword_intent": {"label": INTENTS[_h(k) % 3], "probability": 0.8},
                  "secondary_keyword_intents": None} for k in task["keywords"]]
        return _envelope([{"items_count": len(items), "items": items}], 0.01)
    if endpoint in ("keywords_data/google_ads/search_volume/live", "keywords_data/google_ads/keywords_for_keywords/live"):
        if endpoint.endswith("keywords_for_keywords/live"):
            kws = _candidates(task["keywords"][0], "broad")
        else:
            kws = task["keywords"]
        scale = 1.0 if loc < 9000000 else 0.05 + (_h(str(loc)) % 30) / 100
        out = []
        for k in kws:
            li = _labs_item(k, loc, False)["keyword_info"]
            vol = max(0, int(li["search_volume"] * scale)) if loc >= 9000000 else li["search_volume"]
            out.append({"keyword": k, "spell": None, "location_code": loc, "language_code": "en",
                        "search_partners": False, "competition": li["competition_level"],
                        "competition_index": int(li["competition"] * 100), "search_volume": vol,
                        "low_top_of_page_bid": 1.0, "high_top_of_page_bid": 8.0, "cpc": li["cpc"],
                        "monthly_searches": _monthly(k, vol)})
        return _envelope(out, 0.075)
    return {"version": "0.1.mock", "status_code": 40400, "status_message": f"Mock has no endpoint {endpoint}",
            "cost": 0, "tasks": []}
