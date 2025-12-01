from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Optional

from ..core.config import get_settings
from ..models.tree import TreePayload
from .tree_parser import TreeParseError, load_mcc_tree


class MCCTreeService:
    """Service layer for accessing MCC tree data."""

    def __init__(self, tree_path: Optional[Path] = None) -> None:
        settings = get_settings()
        self.tree_path = tree_path or settings.default_tree_path
        if self.tree_path is not None:
            self.tree_path = Path(self.tree_path)
        self.data_dir = settings.data_dir

    def resolve_tree_path(self, filename: Optional[str] = None) -> Path:
        if filename:
            candidate = Path(filename)
            if candidate.exists():
                return candidate
            if not candidate.is_absolute():
                candidate = self.data_dir / candidate
            return candidate

        if self.tree_path:
            return Path(self.tree_path)

        raise FileNotFoundError(
            "No MCC tree path provided. Upload a tree or set LOCALPHYLOGEO_TREE_PATH."
        )

    def load_tree(self, filename: Optional[str] = None) -> TreePayload:
        path = self.resolve_tree_path(filename)
        return load_mcc_tree(path)


@lru_cache(maxsize=8)
def get_tree_service(tree_path: Optional[Path] = None) -> MCCTreeService:
    return MCCTreeService(tree_path=tree_path)
