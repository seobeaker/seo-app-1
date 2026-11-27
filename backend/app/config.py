"""App settings, read from environment variables / the .env file."""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(ROOT / ".env", ".env"), env_file_encoding="utf-8", extra="ignore"
    )

    # DataForSEO credentials (https://app.dataforseo.com/api-access). Never sent to the browser.
    dataforseo_login: str = ""
    dataforseo_password: str = ""
    dataforseo_base_url: str = "https://api.dataforseo.com/v3"

    # Serve bundled sample responses instead of calling the API (no creds, no cost).
    dataforseo_mock: bool = False

    # Storage
    database_path: str = str(ROOT / "data" / "app.db")
    cache_ttl_days: int = 30
    locations_ttl_days: int = 30

    # Spend control (USD)
    daily_spend_cap_usd: float = 2.0

    # Rough price model used only for the "estimated cost" shown before a search.
    # Check https://dataforseo.com/pricing and adjust. Actual cost is read from each API response.
    price_labs_per_task: float = 0.01
    price_labs_per_item: float = 0.0001
    price_google_ads_volume_per_task: float = 0.075
    price_google_ads_kfk_per_task: float = 0.075

    # Defaults for the UI
    default_country_iso: str = "AU"
    default_language_code: str = "en"

    cors_origins: str = "http://localhost:5173"


@lru_cache
def get_settings() -> Settings:
    return Settings()
