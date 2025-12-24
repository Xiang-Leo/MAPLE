from __future__ import annotations

import os
import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .api.routes import router
from .core.config import get_settings

app = FastAPI(title="LocalPhylogeo", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api")

@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}

# Serve the frontend assets so the tool runs as a single package.
settings = get_settings()


def _resolve_static_dir() -> Path:
    # 1) Explicit override (used by packagers like PyInstaller).
    env_dir = os.environ.get("MAPLE_STATIC_DIR")
    if env_dir:
        return Path(env_dir)

    # 2) PyInstaller onefile/onedir extraction directory.
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        return Path(meipass) / "frontend" / "static"

    # 3) Source tree layout.
    return Path(__file__).resolve().parent.parent.parent / "frontend" / "static"


static_dir = _resolve_static_dir()

if static_dir.exists():
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
