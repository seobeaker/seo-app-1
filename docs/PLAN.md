# Keyword Research Micro App — Plan

A personal keyword research tool modelled on the workflow of Semrush's Keyword
Magic Tool, powered by the DataForSEO v3 API. Single user, self-hosted on a VPS.

## Goals

- Type a seed keyword, pick a country (and optionally a state/region and city),
  and get a table of keyword ideas with Intent, Volume, KD %, CPC, competition,
  monthly trend, SERP features and an "Updated" date.
- Match tabs like the reference UI: **Broad**, **Phrase**, **Related**, **Ideas**,
  and a **Questions** toggle.
- Filters: volume, KD, intent, CPC, include words, exclude words; a "topic group"
  sidebar built from the result words (by count or by volume).
- Row checkboxes, select all, copy keywords, copy table (tab separated, pastes
  straight into Excel/Sheets), CSV export of the filtered view or selected rows.
- Save keyword lists.
- Never surprise you with cost: estimated cost before a search, a daily spend cap,
  a SQLite cache so repeat searches are free, clickstream off by default.

## DataForSEO endpoints used

| Purpose | Endpoint | Notes |
|---|---|---|
| Countries/regions/cities | `GET keywords_data/google_ads/locations` | Free. Fetched once and stored in SQLite. Gives Country → State/Region → City hierarchy (`location_code_parent`). |
| Which countries have Labs data + languages | `GET dataforseo_labs/locations_and_languages` | Free. Labs is country level only. |
| Google Ads languages | `GET keywords_data/google_ads/languages` | Free. Used for countries Labs does not cover. |
| Broad / Phrase / Questions | `POST dataforseo_labs/google/keyword_suggestions/live` | Main table. Returns volume, CPC, competition, monthly trend, KD (`keyword_properties.keyword_difficulty`), intent (`search_intent_info`) and SERP features (`serp_info`, with `include_serp_info`) in **one** call. Phrase = `exact_match: true`. Questions = keyword filter on question words. |
| Related | `POST dataforseo_labs/google/related_keywords/live` | "Searches related to" graph, `depth` 0–4. |
| Ideas | `POST dataforseo_labs/google/keyword_ideas/live` | Category-based ideas, broader than suggestions. |
| State / city volume | `POST keywords_data/google_ads/search_volume/live` | Up to 1,000 keywords per call, any location code (state, city, etc.). Shown as a separate, clearly labelled **"Regional vol."** column. |
| Fallback for countries Labs lacks | `POST keywords_data/google_ads/keywords_for_keywords/live` | Gives ideas + volume + CPC; no KD/intent. |
| Optional enrichment | `bulk_keyword_difficulty/live`, `search_intent/live` | Used to fill KD/intent for the fallback path. |

Why this split: Labs data (KD, intent, SERP features, fast, cheap per row) is only
available per country. Google Ads search volume can be requested for a state or a
city, so when you pick one, the app sends the result keywords to Google Ads for
that location and adds the regional number next to the national one.

**Updated column:** Labs returns `keyword_info.last_updated_time` (and
`serp_info.last_updated_time`); that is what we show. Google Ads search volume
has no "last updated" field, so for those rows the app shows when it fetched the
data (`fetched_at`).

**Exact match:** Semrush's Exact Match has no direct DataForSEO equivalent. Phrase
(`exact_match: true`) is the closest; an "exact phrase only" checkbox filters the
results to keywords containing the seed words contiguously, client side.

## Architecture

```
Browser (React SPA)
   │  /api/*  (no DataForSEO creds ever reach the browser)
   ▼
FastAPI backend ── httpx ──► api.dataforseo.com/v3
   │
   └── SQLite (data/app.db): response cache, spend log, locations, saved lists
```

- **Backend:** Python 3.12, FastAPI, httpx (async), stdlib `sqlite3`,
  pydantic-settings. Credentials only from `.env`.
- **Frontend:** React + TypeScript + Vite + Tailwind CSS + TanStack Table.
- **Cache:** key = SHA-256 of endpoint + request body (so it is naturally keyed by
  keyword, location, language, mode and options). TTL configurable (default
  30 days). The Refresh button bypasses it.
- **Spend control:** each call's actual `cost` from the API response is logged.
  A request is refused (HTTP 402) if today's spend plus the estimate would exceed
  `DAILY_SPEND_CAP_USD`. The header shows today's spend.
- **Mock mode:** `DATAFORSEO_MOCK=true` serves bundled sample responses, so the
  whole UI works with no credentials and no cost. Tests use the same fixtures.

## API (backend)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Status, mock mode |
| GET | `/api/locations/countries` | All countries, flagged with Labs support |
| GET | `/api/locations/{location_code}/children` | States/regions under a country, or cities under a region |
| GET | `/api/locations/cities?country=AU&q=mel` | City search within a country |
| GET | `/api/languages?location_code=` | Languages for a country |
| POST | `/api/estimate` | Estimated cost for a search |
| POST | `/api/search` | Run a search (mode, location, region, options) |
| POST | `/api/regional-volume` | Google Ads volume for chosen keywords at any location |
| GET | `/api/usage` | Today's spend vs cap |
| GET/POST/DELETE | `/api/lists`, `/api/lists/{id}`, `/api/lists/{id}/items` | Saved keyword lists |

## Running

- **Local, two terminals:** `uvicorn` on :8000 + `npm run dev` on :5173 (Vite
  proxies `/api`).
- **Local, Docker:** `docker compose up --build` → http://localhost:8080.
- **VPS later:** same compose file plus `docker-compose.prod.yml`, Caddy gets a
  Let's Encrypt certificate for your domain and adds basic auth. See
  `docs/DEPLOY.md`. Nothing is deployed yet.

## Out of scope for v1 (ideas for later)

- Domain box ("personalised data"): could use Labs `ranked_keywords` to mark
  keywords your domain already ranks for.
- SERP feature icons per keyword with links to the live SERP.
- XLSX export (CSV opens in Excel fine for now).
- Multi-user accounts.
