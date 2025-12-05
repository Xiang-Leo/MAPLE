from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from ..core.config import get_settings
from ..models.discrete import DiscreteAnalysisResult, DiscreteComparisonResult
from ..models.tree import TreePayload
from ..services.tree_parser import TreeParseError
from ..services.tree_service import MCCTreeService
from ..services.discrete_analysis import get_discrete_analysis_service
from ..services.comparison_service import get_tree_comparison_service
from ..services.migration_matrix import build_migration_matrix

logger = logging.getLogger(__name__)

router = APIRouter()


class DiscreteComparisonRequest(BaseModel):
    filenames: list[str] = Field(..., min_items=2, description="List of stored MCC tree filenames to compare.")
    labels: Optional[list[str]] = Field(
        default=None,
        description="Optional labels for each tree to make the comparison readable.",
    )
    top_k: Optional[int] = Field(
        default=10,
        description="Number of most divergent paths to include; non-positive means return all.",
    )


def _get_service(tree_path: Optional[str] = None) -> MCCTreeService:
    if tree_path:
        return MCCTreeService(tree_path=Path(tree_path))
    return MCCTreeService()


@router.get("/tree", response_model=TreePayload)
def get_tree(filename: Optional[str] = None) -> TreePayload:
    service = _get_service()
    logger.info("GET /tree invoked", extra={"filename": filename})
    try:
        payload = service.load_tree(filename)
        logger.info(
            "Tree loaded",
            extra={
                "filename": filename,
                "nodes": len(payload.nodes),
                "edges": len(payload.edges),
            },
        )
        return payload
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except TreeParseError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/tree/upload")
async def upload_tree(file: UploadFile = File(...)) -> dict[str, str]:
    settings = get_settings()
    target_path = settings.data_dir / file.filename

    contents = await file.read()
    target_path.write_bytes(contents)

    return {"filename": file.filename, "stored_path": str(target_path)}


@router.post("/analysis/discrete", response_model=DiscreteAnalysisResult)
async def run_discrete_analysis(
    filename: Optional[str] = Form(None),
    top_k: Optional[int] = Form(10),
    support_file: Optional[UploadFile] = File(None),
) -> DiscreteAnalysisResult:
    service = _get_service()
    try:
        payload = service.load_tree(filename)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except TreeParseError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    support_text = None
    if support_file is not None:
        try:
            support_bytes = await support_file.read()
            support_text = support_bytes.decode("utf-8", errors="ignore")
        except Exception as exc:  # pragma: no cover - defensive decode
            raise HTTPException(status_code=400, detail=f"Failed to read support file: {exc}") from exc

    try:
        resolved_top_k = int(top_k) if top_k is not None else 10
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="top_k must be an integer") from exc

    analysis_service = get_discrete_analysis_service()
    try:
        return analysis_service.run_analysis(
            nodes=list(payload.nodes),
            edges=list(payload.edges),
            support_table=support_text,
            top_k=resolved_top_k,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/analysis/discrete/{analysis_id}/{artifact}")
def download_discrete_artifact(analysis_id: str, artifact: str) -> FileResponse:
    settings = get_settings()
    allowed = {
        "nodes.csv": "text/csv",
        "edges.csv": "text/csv",
        "map.geojson": "application/geo+json",
        "summary.md": "text/markdown",
    }
    if artifact not in allowed:
        raise HTTPException(status_code=404, detail="Unknown analysis artefact.")

    path = settings.data_dir / "analysis" / analysis_id / artifact
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="Artefact not found.")

    return FileResponse(path, media_type=allowed[artifact], filename=artifact)


@router.post("/analysis/discrete/compare", response_model=DiscreteComparisonResult)
async def compare_discrete_trees(request: DiscreteComparisonRequest) -> DiscreteComparisonResult:
    service = _get_service()
    analysis_service = get_discrete_analysis_service()
    comparison_service = get_tree_comparison_service()

    filenames = request.filenames
    if not filenames or len(filenames) < 2:
        raise HTTPException(status_code=400, detail="Provide at least two tree filenames for comparison.")

    if request.labels and len(request.labels) != len(filenames):
        raise HTTPException(status_code=400, detail="labels length must match filenames length.")

    try:
        resolved_top_k = int(request.top_k) if request.top_k is not None else 10
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="top_k must be an integer") from exc

    labelled_results: list[tuple[str, DiscreteAnalysisResult]] = []
    for index, filename in enumerate(filenames):
        try:
            payload = service.load_tree(filename)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except TreeParseError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

        try:
            analysis_result = analysis_service.run_analysis(
                nodes=list(payload.nodes),
                edges=list(payload.edges),
                top_k=resolved_top_k,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        if request.labels:
            label = request.labels[index]
        else:
            label = f"Tree {index + 1}"
        labelled_results.append((label, analysis_result))

    try:
        return comparison_service.compare(labelled_results, top_k=resolved_top_k)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/analysis/migration/matrix")
def get_migration_matrix(filename: Optional[str] = None) -> dict[str, object]:
    try:
        matrix = build_migration_matrix(filename)
    except Exception as exc:  # pragma: no cover - defensive catch
        logger.exception("Failed to build migration matrix")
        raise HTTPException(status_code=500, detail=f"Unable to build migration matrix: {exc}") from exc

    sources = list(matrix.index)
    targets = list(matrix.columns)
    values = matrix.reindex(index=sources, columns=targets, fill_value=0)
    counts = [[int(value) for value in row] for row in values.to_numpy()]

    return {
        "sources": sources,
        "targets": targets,
        "counts": counts,
    }
