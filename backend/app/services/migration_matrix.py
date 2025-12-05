"""Build state-transition matrices directly from MCC tree payloads."""

from __future__ import annotations

from collections import Counter
from typing import Optional

import pandas as pd

from ..models.tree import TreePayload
from .discrete_analysis import DiscreteAnalysisService, get_discrete_analysis_service
from .tree_service import get_tree_service


def _infer_best_states(payload: TreePayload) -> dict[str, str]:
    """Infer the most likely discrete state for every node in the tree."""

    analysis_service = get_discrete_analysis_service()
    best_states: dict[str, str] = {}

    for node in payload.nodes:
        distribution = analysis_service._extract_location_distribution(node.traits)
        normalised = DiscreteAnalysisService._normalise_distribution(distribution)
        state, _ = DiscreteAnalysisService._best_state(normalised)
        best_states[node.id] = state

    return best_states


def _count_transitions(payload: TreePayload, states: dict[str, str]) -> Counter[tuple[str, str]]:
    """Count transitions between inferred parent/child states across the tree."""

    transitions: Counter[tuple[str, str]] = Counter()

    for edge in payload.edges:
        src = states.get(edge.parent_id)
        dst = states.get(edge.child_id)
        if not src or not dst:
            continue
        if src == dst or src == "Unknown" or dst == "Unknown":
            continue
        transitions[(src, dst)] += 1

    return transitions


def build_migration_matrix(filename: Optional[str] = None) -> pd.DataFrame:
    """Compute a migration matrix for the requested MCC tree file.

    Args:
        filename: Optional MCC tree filename previously stored server-side. When
            omitted, the default tree configured via ``LOCALPHYLOGEO_TREE_PATH``
            is used.

    Returns:
        A pandas ``DataFrame`` whose rows denote source states and columns denote
        destination states.
    """

    tree_service = get_tree_service()
    payload = tree_service.load_tree(filename)

    best_states = _infer_best_states(payload)
    transition_counts = _count_transitions(payload, best_states)

    if not transition_counts:
        return pd.DataFrame()

    sources = sorted({src for src, _ in transition_counts})
    targets = sorted({dst for _, dst in transition_counts})
    matrix = pd.DataFrame(0, index=sources, columns=targets, dtype=int)

    for (src, dst), count in transition_counts.items():
        matrix.loc[src, dst] = int(count)

    matrix.index.name = "Source"
    matrix.columns.name = "Target"
    return matrix
