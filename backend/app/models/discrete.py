"""Data models for discrete trait analysis outputs."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class LocationPosterior(BaseModel):
    """Posterior probability summary for a specific location."""

    location: str = Field(..., description="Location label as annotated in the MCC tree.")
    probability: float = Field(..., ge=0.0, le=1.0, description="Posterior probability of the location.")


class NodeAggregate(BaseModel):
    """Aggregated statistics for geographic nodes."""

    location: str = Field(..., description="Location label.")
    ancestral_weight: float = Field(
        default=0.0,
        ge=0.0,
        description="Sum of posterior probabilities for internal nodes assigned to this location.",
    )
    tip_weight: float = Field(
        default=0.0,
        ge=0.0,
        description="Sum of posterior probabilities for terminal nodes assigned to this location.",
    )
    latitude: Optional[float] = Field(default=None, description="Average latitude inferred for the location.")
    longitude: Optional[float] = Field(default=None, description="Average longitude inferred for the location.")


class EdgeAggregate(BaseModel):
    """Aggregated transition statistics between two locations."""

    src: str = Field(..., description="Source location label.")
    dst: str = Field(..., description="Destination location label.")
    weight: float = Field(
        default=0.0,
        ge=0.0,
        description="Aggregated posterior weight or expected count for the transition.",
    )
    time_median: Optional[float] = Field(
        default=None,
        description="Weighted median calendar year for the transition (if dates could be inferred).",
    )
    time_hpd_low: Optional[float] = Field(
        default=None,
        description="Lower bound of the 95% HPD interval for the transition timing (calendar year).",
    )
    time_hpd_high: Optional[float] = Field(
        default=None,
        description="Upper bound of the 95% HPD interval for the transition timing (calendar year).",
    )
    bayes_factor: Optional[float] = Field(
        default=None,
        description="Bayes Factor support merged from BSSVS logs when available.",
    )
    posterior_support: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=1.0,
        description="Posterior inclusion probability for the transition if obtainable from BSSVS logs.",
    )
    jumps_mean: Optional[float] = Field(
        default=None,
        ge=0.0,
        description="Mean Markov jump count for the transition (when available).",
    )
    jumps_hpd_low: Optional[float] = Field(
        default=None,
        description="Lower bound of the 95% HPD interval for Markov jumps (if available).",
    )
    jumps_hpd_high: Optional[float] = Field(
        default=None,
        description="Upper bound of the 95% HPD interval for Markov jumps (if available).",
    )


class PathWeight(BaseModel):
    """Contribution of a single tree to a specific migration path."""

    label: str = Field(..., description="Human-readable label for the tree being compared.")
    weight: float = Field(
        default=0.0,
        ge=0.0,
        description="Posterior weight aggregated for this path within the tree.",
    )
    rank: Optional[int] = Field(
        default=None,
        ge=1,
        description="Rank of the path within the originating tree (1 = strongest).",
    )


class PathDifference(BaseModel):
    """Comparison summary for a single migration path across trees."""

    src: str = Field(..., description="Source location label.")
    dst: str = Field(..., description="Destination location label.")
    weights: list[PathWeight] = Field(
        default_factory=list,
        description="Per-tree contribution metrics for the path.",
    )
    delta: float = Field(
        default=0.0,
        ge=0.0,
        description="Absolute difference between the strongest and weakest tree weights.",
    )
    leading_label: Optional[str] = Field(
        default=None,
        description="Label of the tree with the largest contribution for this path.",
    )


class DiscreteAnalysisResult(BaseModel):
    """Container returned to the client after discrete analysis."""

    analysis_id: str = Field(..., description="Identifier of the persisted analysis artefacts.")
    root_distribution: list[LocationPosterior] = Field(
        default_factory=list,
        description="Posterior ranking for the root location.",
    )
    top_paths: list[EdgeAggregate] = Field(
        default_factory=list,
        description="Top transition paths ranked by posterior weight.",
    )
    nodes: list[NodeAggregate] = Field(
        default_factory=list,
        description="Aggregated node-level statistics for download convenience.",
    )
    edges: list[EdgeAggregate] = Field(
        default_factory=list,
        description="Aggregated edge-level statistics for download convenience.",
    )
    exports: dict[str, str] = Field(
        default_factory=dict,
        description="Mapping of artefact names to download URLs.",
    )


class TreeComparisonSummary(BaseModel):
    """Wrapper that keeps per-tree context for comparison responses."""

    label: str = Field(..., description="Human-readable label describing the tree.")
    analysis_id: str = Field(..., description="Identifier of the discrete analysis run.")
    root_distribution: list[LocationPosterior] = Field(
        default_factory=list,
        description="Posterior ranking for the root location for this tree.",
    )
    top_paths: list[EdgeAggregate] = Field(
        default_factory=list,
        description="Top transition paths for this tree.",
    )
    exports: dict[str, str] = Field(
        default_factory=dict,
        description="Artefact download links for this tree's analysis.",
    )


class DiscreteComparisonResult(BaseModel):
    """Response structure for multi-tree discrete comparison."""

    trees: list[TreeComparisonSummary] = Field(
        default_factory=list,
        description="Per-tree summaries included in the comparison response.",
    )
    path_differences: list[PathDifference] = Field(
        default_factory=list,
        description="Top migration paths whose support differs between trees.",
    )
