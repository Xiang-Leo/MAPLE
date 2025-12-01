from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Optional

from pydantic import BaseSettings, Field


class Settings(BaseSettings):
    """Application configuration loaded from environment variables when available."""

    data_dir: Path = Field(default=Path("data"), env="LOCALPHYLOGEO_DATA_DIR")
    default_tree_path: Optional[Path] = Field(
        default=None,
        env="LOCALPHYLOGEO_TREE_PATH",
        description="Path to the default MCC tree file to load on startup.",
    )

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    settings = Settings()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    return settings
