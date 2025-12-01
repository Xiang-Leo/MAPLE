from __future__ import annotations

import io
import logging
import re
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

DEBUG_TRACE_FILE = Path("debug_trace.log")

from Bio import Phylo

from ..models.tree import TreeEdge, TreeMetadata, TreeNode, TreePayload

logger = logging.getLogger(__name__)

PAIR_PATTERN = re.compile(
    r"(?P<key>[\w.%-]+)=(?P<value>({[^}]*}|\"[^\"]*\"|[^,]+))"
)


class TreeParseError(RuntimeError):
    """Raised when the MCC tree cannot be parsed."""


def _parse_comment(comment: Optional[str]) -> Dict[str, Any]:
    if not comment:
        return {}

    content = comment.strip()
    if content.startswith("[&") and content.endswith("]"):
        content = content[2:-1]

    traits: Dict[str, Any] = {}
    for match in PAIR_PATTERN.finditer(content):
        key = match.group("key")
        raw_value = match.group("value").strip()
        value: Any
        if raw_value.startswith("\"") and raw_value.endswith("\""):
            value = raw_value[1:-1]
        elif raw_value.startswith("{") and raw_value.endswith("}"):
            inner = raw_value[1:-1].strip()
            if not inner:
                value = []
            else:
                parts = [item.strip() for item in inner.split(",")]
                converted: List[Any] = []
                for part in parts:
                    converted.append(_coerce_value(part))
                value = converted
        else:
            value = _coerce_value(raw_value)
        traits[key] = value
    return traits


def _coerce_value(token: str) -> Any:
    lowered = token.lower()
    if lowered in {"true", "false"}:
        return lowered == "true"
    try:
        if any(ch in token for ch in (".", "e", "E")):
            return float(token)
        return int(token)
    except ValueError:
        return token


def _ensure_tree_format(tree_path: Path) -> str:
    suffix = tree_path.suffix.lower()

    if suffix in {".nexus", ".nex"}:
        return "nexus"

    if suffix in {".nwk", ".newick"}:
        return "newick"

    if suffix in {".tree", ".tre", ".trees"}:
        preview = _read_preview(tree_path)
        if preview.startswith("#NEXUS"):
            return "nexus"
        return "newick"

    # Attempt lightweight sniffing for users who provide files without extensions.
    preview = _read_preview(tree_path)
    if preview.startswith("#NEXUS"):
        return "nexus"
    if preview.startswith("("):
        return "newick"

    raise TreeParseError(f"Unsupported MCC tree format for {tree_path}")


def _read_preview(tree_path: Path, limit: int = 2048) -> str:
    try:
        with tree_path.open("r", encoding="utf-8", errors="ignore") as handle:
            snippet = handle.read(limit)
    except OSError as exc:
        raise TreeParseError(f"Failed to inspect tree format: {exc}") from exc
    return snippet.lstrip().upper()[:20]


TRANSLATE_BLOCK_PATTERN = re.compile(
    r"translate\s*(.*?);", re.IGNORECASE | re.DOTALL
)
TREE_PATTERN = re.compile(r"tree\s+[^=]+=\s*(.+?);", re.IGNORECASE | re.DOTALL)
TRANSLATE_ENTRY_PATTERN = re.compile(r"^\s*(\d+)\s+(.+?)\s*$", re.DOTALL)
TOKEN_PATTERN = re.compile(r"([(),])\s*(\d+)(?=[:\[,)\)])")


def _load_nexus_tree(tree_path: Path):
    try:
        raw_text = tree_path.read_text(encoding="utf-8")
    except OSError as exc:
        raise TreeParseError(f"Failed to read nexus tree file: {exc}") from exc

    translate_block = _extract_translate_block(raw_text)
    translate_map = _parse_translate_block(translate_block)

    tree_string = _extract_tree_string(raw_text)
    replaced_tree = _apply_translate_map(tree_string, translate_map)

    logger.info(
        "Parsed nexus translate block",
        extra={"tree_path": str(tree_path), "map_size": len(translate_map)},
    )

    _append_debug(
        f"prepare_nexus:complete:{tree_path}:length={len(replaced_tree)}\n"
    )

    return Phylo.read(io.StringIO(replaced_tree), "newick")


def _extract_translate_block(raw_text: str) -> str:
    match = TRANSLATE_BLOCK_PATTERN.search(raw_text)
    if not match:
        return ""
    return match.group(1)


def _parse_translate_block(block: str) -> Dict[str, str]:
    translate_map: Dict[str, str] = {}
    if not block:
        return translate_map

    for entry in block.split(","):
        entry = entry.strip().strip(";")
        if not entry:
            continue
        match = TRANSLATE_ENTRY_PATTERN.match(entry)
        if not match:
            continue
        idx, label = match.groups()
        label = label.strip().rstrip(",;")
        if not (label.startswith("'") and label.endswith("'")):
            label = label.replace("'", "''")
            label = f"'{label}'"
        translate_map[idx] = label
    return translate_map


def _extract_tree_string(raw_text: str) -> str:
    match = TREE_PATTERN.search(raw_text)
    if not match:
        raise TreeParseError("No tree block found in nexus file")
    tree_string = match.group(1).strip()
    tree_string = re.sub(r"\s+", "", tree_string)
    return tree_string


def _apply_translate_map(tree_string: str, translate_map: Dict[str, str]) -> str:
    if not translate_map:
        return tree_string

    def replacer(match: re.Match[str]) -> str:
        prefix = match.group(1)
        idx = match.group(2)
        label = translate_map.get(idx, translate_map.get(idx.lstrip("0"), idx))
        return f"{prefix}{label}"

    return TOKEN_PATTERN.sub(replacer, tree_string)


def _iter_edges(parent_id: str, child_ids: Iterable[str]) -> Iterable[TreeEdge]:
    for child_id in child_ids:
        yield TreeEdge(parent_id=parent_id, child_id=child_id)


def load_mcc_tree(tree_path: Path) -> TreePayload:
    if not tree_path.exists():
        raise FileNotFoundError(f"Tree file not found: {tree_path}")

    tree_format = _ensure_tree_format(tree_path)

    _append_debug(f"load_mcc_tree:start:{tree_path}:{tree_format}\n")

    logger.info(
        "Loading MCC tree",
        extra={"tree_path": str(tree_path), "format": tree_format},
    )

    try:
        if tree_format == "nexus":
            tree = _load_nexus_tree(tree_path)
        else:
            tree = Phylo.read(tree_path, tree_format)
        _append_debug(f"load_mcc_tree:parsed:{tree_path}\n")
        logger.info(
            "Tree parsed",
            extra={
                "tree_path": str(tree_path),
                "format": tree_format,
                "clade_count": len(list(tree.find_clades())) if tree else 0,
            },
        )
    except Exception as exc:  # pragma: no cover - surface parsing failures cleanly
        logger.exception("Biopython failed to read MCC tree", extra={"tree_path": str(tree_path)})
        raise TreeParseError(f"Failed to parse MCC tree: {exc}") from exc

    depths: Dict[Any, float] = tree.depths()
    if not depths:
        logger.error(
            "Tree depths could not be computed", extra={"tree_path": str(tree_path)}
        )
        raise TreeParseError("Tree depths could not be computed; check branch lengths.")

    max_depth = max(depths.values())

    nodes: Dict[Any, TreeNode] = {}
    edges: List[TreeEdge] = []

    counter = {"value": 0}

    def walk(clade, parent_id: Optional[str] = None) -> None:
        counter["value"] += 1
        node_id = f"n{counter['value']}"
        branch_length = clade.branch_length if clade.branch_length is not None else None
        time_from_root = depths.get(clade, 0.0)
        time_before_present = max_depth - time_from_root

        traits = _parse_comment(getattr(clade, "comment", None))

        label = getattr(clade, "name", None)
        if not label:
            # Fall back to tip labels stored on terminals
            label = getattr(clade, "taxon", None)

        node = TreeNode(
            id=node_id,
            label=label,
            parent_id=parent_id,
            branch_length=branch_length,
            time_from_root=time_from_root,
            time_before_present=time_before_present,
            traits=traits,
        )
        nodes[clade] = node

        if parent_id is not None:
            edges.append(TreeEdge(parent_id=parent_id, child_id=node_id))

        for child in clade.clades:
            walk(child, node_id)

    walk(tree.root)

    _append_debug(f"load_mcc_tree:end:{tree_path}:nodes={len(nodes)}\n")

    metadata = TreeMetadata(
        name=getattr(tree, "name", None),
        root_height=max_depth,
        tip_count=sum(1 for node in nodes.values() if not any(edge.parent_id == node.id for edge in edges)),
    )

    return TreePayload(nodes=list(nodes.values()), edges=edges, metadata=metadata)


def _append_debug(message: str) -> None:
    try:
        with DEBUG_TRACE_FILE.open("a", encoding="utf-8") as handle:
            handle.write(message)
    except Exception:
        pass
