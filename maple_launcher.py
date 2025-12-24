from __future__ import annotations

import os
import sys
import threading
import time
import webbrowser
from pathlib import Path

import uvicorn


def _resource_path(relative: str) -> Path:
    """Return an absolute path to a bundled resource (PyInstaller) or repo file."""

    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
    return base / relative


def main() -> None:
    # Runtime data directory:
    # - packaged app: default to ~/MAPLE-data
    # - source run:   default to ./data (handled by Settings)
    if "LOCALPHYLOGEO_DATA_DIR" not in os.environ:
        packaged = hasattr(sys, "_MEIPASS")
        if packaged:
            os.environ["LOCALPHYLOGEO_DATA_DIR"] = str(Path.home() / "MAPLE-data")

    # Tell backend where to find the frontend assets when bundled.
    # We will include `frontend/static` into the bundle at the same relative path.
    static_dir = _resource_path("frontend/static")
    os.environ.setdefault("MAPLE_STATIC_DIR", str(static_dir))

    host = os.environ.get("MAPLE_HOST", "127.0.0.1")
    port = int(os.environ.get("MAPLE_PORT", "8000"))

    url = f"http://{host}:{port}/"

    def opener() -> None:
        # Give uvicorn a moment to start before opening the browser.
        time.sleep(1.0)
        try:
            webbrowser.open(url)
        except Exception:
            pass

    threading.Thread(target=opener, daemon=True).start()

    # IMPORTANT for PyInstaller:
    # Uvicorn can accept an import string ("backend.app.main:app"), but that import
    # happens dynamically at runtime and PyInstaller may not bundle `backend/`.
    # Import the FastAPI app object directly so PyInstaller can discover it.
    from backend.app.main import app as fastapi_app  # noqa: PLC0415

    uvicorn.run(
        fastapi_app,
        host=host,
        port=port,
        log_level="info",
    )


if __name__ == "__main__":
    main()

