from __future__ import annotations

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

# Serve the frontend assets so the tool runs as a single package.
settings = get_settings()
static_dir = Path(__file__).resolve().parent.parent.parent / "frontend" / "static"

if static_dir.exists():
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
