from __future__ import annotations

from collections import defaultdict
from functools import lru_cache
from typing import Sequence

from ..models.discrete import (
    DiscreteAnalysisResult,
    DiscreteComparisonResult,
    PathDifference,
    PathWeight,
    TreeComparisonSummary,
)


class TreeComparisonService:
    """Create high-level summaries that compare multiple discrete analyses."""

    def compare(
        self,
        labelled_results: Sequence[tuple[str, DiscreteAnalysisResult]],
        top_k: int = 10,
    ) -> DiscreteComparisonResult:
        if len(labelled_results) < 2:
            raise ValueError("At least two trees are required for comparison.")

        if top_k is None or top_k <= 0:
            resolved_top_k = None
        else:
            resolved_top_k = top_k

        label_order = {label: index for index, (label, _) in enumerate(labelled_results)}
        all_labels = [label for label, _ in labelled_results]

        tree_summaries: list[TreeComparisonSummary] = []
        path_weights = defaultdict(list)

        for label, analysis in labelled_results:
            tree_summaries.append(
                TreeComparisonSummary(
                    label=label,
                    analysis_id=analysis.analysis_id,
                    root_distribution=analysis.root_distribution,
                    top_paths=analysis.top_paths,
                    exports=analysis.exports,
                )
            )

            for rank, edge in enumerate(analysis.edges, start=1):
                path_weights[(edge.src, edge.dst)].append(
                    PathWeight(label=label, weight=edge.weight, rank=rank)
                )

        path_differences: list[PathDifference] = []
        for (src, dst), weights in path_weights.items():
            contributions = self._ensure_all_labels(weights, all_labels)
            max_weight = max(contribution.weight for contribution in contributions)
            min_weight = min(contribution.weight for contribution in contributions)
            delta = max_weight - min_weight
            if delta <= 0:
                continue
            contributions.sort(key=lambda contribution: label_order.get(contribution.label, 0))
            leading_label = max(contributions, key=lambda contribution: contribution.weight).label
            path_differences.append(
                PathDifference(
                    src=src,
                    dst=dst,
                    weights=contributions,
                    delta=delta,
                    leading_label=leading_label,
                )
            )

        path_differences.sort(key=lambda item: item.delta, reverse=True)

        if resolved_top_k is not None:
            path_differences = path_differences[:resolved_top_k]

        return DiscreteComparisonResult(trees=tree_summaries, path_differences=path_differences)

    @staticmethod
    def _ensure_all_labels(
        weights: Sequence[PathWeight], labels: Sequence[str]
    ) -> list[PathWeight]:
        existing = {weight.label for weight in weights}
        completed = list(weights)
        for label in labels:
            if label not in existing:
                completed.append(PathWeight(label=label, weight=0.0, rank=None))
        return completed


@lru_cache(maxsize=1)
def get_tree_comparison_service() -> TreeComparisonService:
    return TreeComparisonService()
