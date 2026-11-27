"""API tests. All run against the offline mock (no network, no cost)."""
import httpx
import pytest
from fastapi.testclient import TestClient

from app.dataforseo import DataForSEOClient
from app.db import Database
from app.main import create_app
from app.services import normalise_labs_item, dfs_time_to_iso

from .conftest import make_settings


def test_health(client):
    r = client.get("/api/health").json()
    assert r["ok"] and r["mock"] is True


def test_countries_and_children(client):
    countries = client.get("/api/locations/countries").json()
    au = next(c for c in countries if c["iso"] == "AU")
    assert au["labs"] is True and au["location_code"] == 2036
    states = client.get(f"/api/locations/{au['location_code']}/children").json()
    assert {s["name"] for s in states} >= {"Victoria", "New South Wales"}
    vic = next(s for s in states if s["name"] == "Victoria")
    cities = client.get(f"/api/locations/{vic['location_code']}/children").json()
    assert "Melbourne" in {c["name"] for c in cities}
    found = client.get("/api/locations/cities", params={"country": "au", "q": "Mel"}).json()
    assert found[0]["name"] == "Melbourne"


def test_languages(client):
    langs = client.get("/api/languages", params={"location_code": 2036}).json()
    assert {"language_code": "en", "language_name": "English"} in langs


@pytest.mark.parametrize("mode", ["broad", "phrase", "questions", "related", "ideas"])
def test_search_modes(client, mode):
    r = client.post("/api/search", json={"keyword": "dentist seo", "location_code": 2036, "mode": mode, "limit": 50})
    assert r.status_code == 200, r.text
    body = r.json()
    rows = body["rows"]
    assert rows
    row = rows[0]
    assert set(row) >= {"keyword", "search_volume", "kd", "intent", "cpc", "monthly_searches", "serp_features", "updated"}
    assert body["meta"]["source"] == "labs"
    assert len({r["keyword"] for r in rows}) == len(rows)
    if mode == "questions":
        assert all(r["keyword"].split()[0] in {"how", "what", "why", "which", "where", "can", "is"} for r in rows)
    if mode == "phrase":
        assert all("dentist seo" in r["keyword"] for r in rows)


def test_search_is_cached_and_refresh_bypasses(client):
    payload = {"keyword": "coffee", "location_code": 2036, "limit": 20}
    first = client.post("/api/search", json=payload).json()["meta"]
    second = client.post("/api/search", json=payload).json()["meta"]
    assert first["cached"] is False and first["cost_usd"] > 0
    assert second["cached"] is True and second["cost_usd"] == 0
    third = client.post("/api/search", json={**payload, "refresh": True}).json()["meta"]
    assert third["cached"] is False


def test_regional_volume_column(client):
    states = client.get("/api/locations/2036/children").json()
    vic = next(s for s in states if s["name"] == "Victoria")
    body = client.post("/api/search", json={"keyword": "plumber", "location_code": 2036, "region_code": vic["location_code"],
                                            "limit": 30}).json()
    assert body["meta"]["region"]["name"].startswith("Victoria")
    assert all(r["regional_volume"] is not None for r in body["rows"])
    assert any(r["regional_volume"] < r["search_volume"] for r in body["rows"] if r["search_volume"])


def test_estimate(client):
    e = client.post("/api/estimate", json={"keyword": "x", "location_code": 2036, "limit": 1000, "region_code": 9000001}).json()
    assert e["total_usd"] == pytest.approx(0.01 + 0.1 + 0.075)
    e2 = client.post("/api/estimate", json={"keyword": "x", "location_code": 2036, "limit": 1000,
                                            "include_clickstream_data": True}).json()
    assert e2["total_usd"] == pytest.approx(0.22)


def test_spend_cap_blocks(tmp_path):
    app = create_app(make_settings(tmp_path, daily_spend_cap_usd=0.015))
    with TestClient(app) as c:
        ok = c.post("/api/search", json={"keyword": "a", "location_code": 2036, "limit": 10})
        assert ok.status_code == 200
        blocked = c.post("/api/search", json={"keyword": "b", "location_code": 2036, "limit": 10})
        assert blocked.status_code == 402
        assert "cap" in blocked.json()["detail"].lower()
        assert c.get("/api/usage").json()["spent_today_usd"] > 0


def test_non_labs_country_falls_back_to_google_ads(tmp_path):
    app = create_app(make_settings(tmp_path))
    with TestClient(app) as c:
        # pretend Labs does not cover Canada
        c.get("/api/locations/countries")
        import json
        db = c.app.state.db
        labs = json.loads(db.meta_get("labs_locations"))
        labs.pop("2124")
        db.meta_set("labs_locations", json.dumps(labs))
        body = c.post("/api/search", json={"keyword": "maple syrup", "location_code": 2124, "limit": 20}).json()
        assert body["meta"]["source"] == "google_ads"
        assert body["rows"][0]["updated_source"] == "fetched"
        assert body["rows"][0]["intent"]


def test_lists_crud(client):
    lst = client.post("/api/lists", json={"name": "Dentist ideas"}).json()
    client.post(f"/api/lists/{lst['id']}/items", json={"items": [{"keyword": "seo for dentists", "search_volume": 1600}]})
    got = client.get(f"/api/lists/{lst['id']}").json()
    assert got["items"][0]["keyword"] == "seo for dentists"
    assert client.get("/api/lists").json()[0]["count"] == 1
    client.post(f"/api/lists/{lst['id']}/items/remove", json={"keywords": ["seo for dentists"]})
    assert client.get(f"/api/lists/{lst['id']}").json()["items"] == []
    client.delete(f"/api/lists/{lst['id']}")
    assert client.get("/api/lists").json() == []


def test_normalise_related_item_and_time():
    item = {"keyword_data": {"keyword": "k", "keyword_info": {"search_volume": 5, "last_updated_time": "2026-10-21 09:13:44 +00:00",
                                                             "monthly_searches": [{"year": 2026, "month": 2, "search_volume": 1},
                                                                                  {"year": 2025, "month": 12, "search_volume": 2}]},
                             "keyword_properties": {"keyword_difficulty": 12}, "search_intent_info": {"main_intent": "commercial"},
                             "serp_info": {"serp_item_types": ["organic", "local_pack"]}}}
    row = normalise_labs_item(item)
    assert row["kd"] == 12 and row["intent"] == "commercial" and row["serp_features"] == ["local_pack"]
    assert row["monthly_searches"][0]["year"] == 2025
    assert row["updated"] == "2026-10-21T09:13:44+00:00"
    assert dfs_time_to_iso(None) is None


async def test_real_client_sends_basic_auth_and_parses_envelope(tmp_path):
    """Exercise the non-mock HTTP path with a fake transport (no real network)."""
    seen = {}

    def handler(request: httpx.Request):
        seen["auth"] = request.headers.get("authorization")
        seen["path"] = request.url.path
        return httpx.Response(200, json={"status_code": 20000, "cost": 0.02, "tasks": [
            {"status_code": 20000, "result": [{"items": [{"keyword": "x"}]}]}]})

    s = make_settings(tmp_path, dataforseo_mock=False, dataforseo_login="me", dataforseo_password="pw")
    db = Database(":memory:")
    http = httpx.AsyncClient(base_url=s.dataforseo_base_url, auth=("me", "pw"), transport=httpx.MockTransport(handler))
    c = DataForSEOClient(s, db, http=http)
    res = await c.call("dataforseo_labs/google/keyword_suggestions/live", {"keyword": "x"})
    assert res["cost"] == 0.02 and res["result"][0]["items"][0]["keyword"] == "x"
    assert seen["auth"].startswith("Basic ") and seen["path"].endswith("keyword_suggestions/live")
    assert db.spend_today() == pytest.approx(0.02)
    # task-level error surfaces
    def bad(request):
        return httpx.Response(200, json={"status_code": 20000, "cost": 0, "tasks": [{"status_code": 40501, "status_message": "Invalid Field"}]})
    c2 = DataForSEOClient(s, db, http=httpx.AsyncClient(base_url=s.dataforseo_base_url, transport=httpx.MockTransport(bad)))
    with pytest.raises(Exception, match="Invalid Field"):
        await c2.call("x/live", {"keyword": "y"})
