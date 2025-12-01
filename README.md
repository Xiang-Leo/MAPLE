# LocalPhylogeo

LocalPhylogeo provides a local viewer for continuous phylogeographic MCC trees. The FastAPI backend parses BEAST-generated MCC tree files and exposes JSON endpoints, while the static frontend renders time-scaled phylogenies, geographic spread, and trait summaries directly in the browser.

## Feature Overview

- Upload or point to a default MCC tree file (`.tree`, `.nexus`, `.nex`, `.newick`, `.nwk`, etc.) and parse node trait metadata.
- FastAPI endpoints expose tree structure, edge data, and trait information in a modular layout that is easy to extend.
- D3.js renders the time-scaled tree (with layout switches, colour controls, zoom, node radius, tip labels, and HPD overlays) and Leaflet displays the geographic distribution with migration paths.
- Trait summary cards highlight the frequency of discrete and continuous traits for rapid inspection.
- Choose a custom basemap by entering a tile URL template or uploading a JSON map configuration, and revert to the default OpenStreetMap layer at any time.
- Compare multiple MCC trees via `/api/analysis/discrete/compare`; the backend re-runs the discrete analysis for each tree and returns the migration paths whose support differs the most between epidemics or scenarios.

## Project Layout

```
LocalPhylogeo/
├── backend/
│   ├── app/
│   │   ├── api/            # REST API routes
│   │   ├── core/           # Settings and configuration
│   │   ├── models/         # Pydantic data models
│   │   ├── services/       # MCC tree parsing and helpers
│   │   └── main.py         # FastAPI entrypoint
├── frontend/
│   └── static/             # Frontend HTML/CSS/JS assets
├── data/                   # Runtime data directory (created on demand)
├── requirements.txt        # Python dependencies
└── README.md
```

## Environment Setup

1. Python 3.10+ is recommended.
2. Create and activate a virtual environment:

   ```bash
   python -m venv .venv
   source .venv/bin/activate  # On Windows use .venv\Scripts\activate
   ```

3. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

## Run The Backend

```bash
uvicorn backend.app.main:app --reload
```

- The server listens on `http://127.0.0.1:8000/` by default.
- Visiting the root path serves the frontend; REST endpoints live under `/api`.

### Provide a Default MCC Tree

- Place the MCC tree file in the `data/` directory and set an environment variable:

  ```bash
  export LOCALPHYLOGEO_TREE_PATH=data/your_tree.tree
  ```

- Alternatively, upload a tree through the UI; uploaded files are stored under `data/`.

### Compare Multiple MCC Trees

- Upload (or otherwise place) each tree file under `data/` and call:

  ```bash
  curl -X POST http://127.0.0.1:8000/api/analysis/discrete/compare \
       -H "Content-Type: application/json" \
       -d '{
             "filenames": ["first.tree", "second.tree"],
             "labels": ["Outbreak A", "Outbreak B"],
             "top_k": 5
           }'
  ```

- The response lists per-tree summaries plus `path_differences`, which highlight the migration routes whose posterior support diverges most between the supplied trees.

## Frontend

- The left sidebar is divided into **File Input**, **Tree & Operations**, and **Map & Operations** panels.
- Upload a tree to trigger an automatic re-render.
- The time-scaled tree uses “time before present” on the x-axis, with leaves on the right and the root on the left, and supports label toggles, brushing, and HPD overlays.
- The map draws markers using latitude/longitude traits (`location_lat/location_lon`, `latitude/longitude`, etc.) and connects parent and child nodes with migration polylines.
- The map panel lets you:
  - Enter a tile layer template URL containing `{z}`, `{x}`, and `{y}` placeholders.
  - Upload a JSON configuration with a `tileUrl` field (and optional `name`, `attribution`, `maxZoom`, or a nested `options` object).
  - Restore the default OpenStreetMap basemap.

Example JSON configuration:

```json
{
  "name": "CartoDB Positron",
  "tileUrl": "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
  "attribution": "© CartoDB",
  "maxZoom": 19
}
```

- The trait summary panel ranks trait values by frequency.

## Extension Ideas

- **Additional parsing logic**: expand `backend/app/services/tree_parser.py` to support custom traits or alternative tree formats.
- **Multiple tree management**: maintain a tree index in `tree_service.py` and extend the API to list or switch trees.
- **Timeline interaction**: add time sliders to filter map routes by sampling date.
- **Statistical analysis**: expose new endpoints that compute migration rates or HPD intervals and render new charts in the frontend.

## Testing & Development

- Add PyTest suites in `tests/` to cover parsing, trait extraction, and geographic utilities.
- Place sample MCC trees in `data/` for quick reloads during development.

Contributions and feature requests are always welcome—tailor the tool to suit your analyses.
