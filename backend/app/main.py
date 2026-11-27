"""FastAPI app: JSON API under /api. DataForSEO credentials stay on the server."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .config import Settings, get_settings
from .dataforseo import DataForSEOClient, DataForSEOError
from .db import Database
from .services import LocationService, RegionalVolumeRequest, SearchRequest, SearchService

logging.basicConfig(level=logging.INFO)


class NewList(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class ListItems(BaseModel):
    items: list[dict] = Field(min_length=1, max_length=5000)


class RemoveItems(BaseModel):
    keywords: list[str]


def create_app(settings: Settings | None = None, client: DataForSEOClient | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        db = Database(settings.database_path)
        c = client or DataForSEOClient(settings, db)
        c.db = db
        app.state.db = db
        app.state.client = c
        app.state.locations = LocationService(settings, db, c)
        app.state.search = SearchService(settings, db, c, app.state.locations)
        yield
        await c.aclose()

    app = FastAPI(title="Keyword Research", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(DataForSEOError)
    async def dfs_error(_: Request, exc: DataForSEOError):
        return JSONResponse(status_code=exc.status, content={"detail": str(exc)})

    @app.get("/api/health")
    async def health():
        return {
            "ok": True,
            "mock": settings.dataforseo_mock,
            "credentials_set": bool(settings.dataforseo_login and settings.dataforseo_password),
            "default_country_iso": settings.default_country_iso,
            "default_language_code": settings.default_language_code,
        }

    @app.get("/api/usage")
    async def usage(request: Request):
        db: Database = request.app.state.db
        return {
            "spent_today_usd": round(db.spend_today(), 4),
            "spent_total_usd": round(db.spend_total(), 4),
            "cap_usd": settings.daily_spend_cap_usd,
        }

    @app.get("/api/locations/countries")
    async def countries(request: Request):
        return await request.app.state.locations.countries()

    @app.post("/api/locations/refresh")
    async def refresh_locations(request: Request):
        await request.app.state.locations.ensure(force=True)
        return {"ok": True}

    @app.get("/api/locations/{location_code}/children")
    async def children(location_code: int, request: Request):
        return await request.app.state.locations.children(location_code)

    @app.get("/api/locations/cities")
    async def cities(country: str, q: str, request: Request):
        if len(q.strip()) < 2:
            return []
        return await request.app.state.locations.search_cities(country, q.strip())

    @app.get("/api/languages")
    async def languages(location_code: int, request: Request):
        return await request.app.state.locations.languages(location_code)

    @app.post("/api/estimate")
    async def estimate(req: SearchRequest, request: Request):
        await request.app.state.locations.ensure()
        labs = request.app.state.locations.is_labs(req.location_code)
        return request.app.state.search.estimate(req, labs)

    @app.post("/api/search")
    async def search(req: SearchRequest, request: Request):
        return await request.app.state.search.search(req)

    @app.post("/api/regional-volume")
    async def regional_volume(req: RegionalVolumeRequest, request: Request):
        res = await request.app.state.search.regional_volume(req)
        return {k: res[k] for k in ("rows", "cost", "cached", "fetched_at")}

    # ---- saved lists -------------------------------------------------------
    @app.get("/api/lists")
    async def lists(request: Request):
        return request.app.state.db.lists()

    @app.post("/api/lists")
    async def create_list(body: NewList, request: Request):
        return request.app.state.db.create_list(body.name.strip())

    @app.get("/api/lists/{list_id}")
    async def get_list(list_id: int, request: Request):
        lst = request.app.state.db.get_list(list_id)
        if not lst:
            raise HTTPException(404, "List not found")
        return lst

    @app.delete("/api/lists/{list_id}")
    async def delete_list(list_id: int, request: Request):
        request.app.state.db.delete_list(list_id)
        return {"ok": True}

    @app.post("/api/lists/{list_id}/items")
    async def add_items(list_id: int, body: ListItems, request: Request):
        db: Database = request.app.state.db
        if not db.get_list(list_id):
            raise HTTPException(404, "List not found")
        items = [i for i in body.items if isinstance(i.get("keyword"), str) and i["keyword"].strip()]
        return {"added": db.add_list_items(list_id, items)}

    @app.post("/api/lists/{list_id}/items/remove")
    async def remove_items(list_id: int, body: RemoveItems, request: Request):
        request.app.state.db.remove_list_items(list_id, body.keywords)
        return {"ok": True}

    return app


app = create_app()
