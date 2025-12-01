"""Utilities to summarise BEAST/BEAST2 discrete trait MCC trees."""

from __future__ import annotations

import csv
import io
import json
import math
import re
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from statistics import mean
from typing import Any, Iterable, Optional
from uuid import uuid4

from ..core.config import get_settings
from ..models.discrete import (
    DiscreteAnalysisResult,
    EdgeAggregate,
    LocationPosterior,
    NodeAggregate,
)
from ..models.tree import TreeEdge, TreeNode


# Patterns used to interpret optional BSSVS / Markov jump tables.
EDGE_COLUMN_PATTERN = re.compile(
    r"(?P<prefix>[a-zA-Z]+)[_\[(]{1}(?P<src>[^,\->:;\s]+)[,>\-\s]+(?P<dst>[^)\]\s]+)"
)
GENERIC_PAIR_PATTERN = re.compile(r"(?P<src>[^->:]+)[->:](?P<dst>.+)")


@dataclass
class EdgeObservation:
    """Single edge observation derived from MCC tree traversal."""

    src: str
    dst: str
    weight: float
    time_median: Optional[float]
    hpd_low: Optional[float]
    hpd_high: Optional[float]


@dataclass
class LocationAccumulator:
    """Helper to average coordinates with weights."""

    weight_sum: float = 0.0
    lat_sum: float = 0.0
    lon_sum: float = 0.0

    def add(self, latitude: float, longitude: float, weight: float) -> None:
        if not (math.isfinite(latitude) and math.isfinite(longitude) and weight > 0):
            return
        self.weight_sum += weight
        self.lat_sum += latitude * weight
        self.lon_sum += longitude * weight

    def mean(self) -> tuple[Optional[float], Optional[float]]:
        if self.weight_sum <= 0:
            return (None, None)
        return (self.lat_sum / self.weight_sum, self.lon_sum / self.weight_sum)


class DiscreteAnalysisService:
    """Service layer responsible for computing discrete trait summaries."""

    def __init__(self) -> None:
        settings = get_settings()
        self.data_dir = settings.data_dir
        self.analysis_dir = self.data_dir / "analysis"
        self.analysis_dir.mkdir(parents=True, exist_ok=True)

    def run_analysis(
        self,
        nodes: list[TreeNode],
        edges: list[TreeEdge],
        support_table: Optional[str] = None,
        top_k: int = 10,
    ) -> DiscreteAnalysisResult:
        """Run the discrete analysis and persist artefacts.

        Args:
            nodes: Tree nodes parsed from the MCC tree.
            edges: Directed edges of the MCC tree.
            support_table: Optional CSV/TSV text with BSSVS/Markov jumps output.
            top_k: Number of pathways to highlight in the summary.

        Returns:
            A :class:`DiscreteAnalysisResult` describing posterior rankings and
            links to generated artefacts.
        """

        if not nodes:
            raise ValueError("Tree payload has no nodes to analyse.")

        node_lookup = {node.id: node for node in nodes}
        children_map: dict[str, list[str]] = defaultdict(list)
        for edge in edges:
            children_map[edge.parent_id].append(edge.child_id)

        distributions = {
            node.id: self._extract_location_distribution(node.traits)
            for node in nodes
        }

        root_nodes = [node for node in nodes if node.parent_id is None]
        if len(root_nodes) != 1:
            raise ValueError(
                "MCC tree must have exactly one root; received"
                f" {len(root_nodes)} nodes without parent."
            )
        root_node = root_nodes[0]
        root_distribution = self._normalise_distribution(
            distributions.get(root_node.id) or {"Unknown": 1.0}
        )

        reference_year = self._infer_reference_year(nodes)

        location_stats: dict[str, LocationAccumulator] = defaultdict(LocationAccumulator)
        ancestral_weight: dict[str, float] = defaultdict(float)
        tip_weight: dict[str, float] = defaultdict(float)
        best_states: dict[str, tuple[str, float]] = {}

        for node in nodes:
            distribution = self._normalise_distribution(distributions.get(node.id))
            best_location, best_prob = self._best_state(distribution)
            best_states[node.id] = (best_location, best_prob)

            if children_map.get(node.id):
                for location, probability in distribution.items():
                    ancestral_weight[location] += probability
            else:
                for location, probability in distribution.items():
                    tip_weight[location] += probability

            coordinate = self._extract_coordinates(node.traits)
            if coordinate:
                latitude, longitude = coordinate
                location_stats[best_location].add(latitude, longitude, max(best_prob, 0.0))

        observations: dict[tuple[str, str], list[EdgeObservation]] = defaultdict(list)
        for edge in edges:
            parent = node_lookup.get(edge.parent_id)
            child = node_lookup.get(edge.child_id)
            if not parent or not child:
                continue
            parent_dist = self._normalise_distribution(distributions.get(parent.id))
            child_dist = self._normalise_distribution(distributions.get(child.id))
            if not parent_dist or not child_dist:
                continue
            time_stats = self._extract_time_stats(child, reference_year)
            for src, src_prob in parent_dist.items():
                for dst, dst_prob in child_dist.items():
                    if src == dst:
                        continue
                    weight = src_prob * dst_prob
                    if weight <= 0:
                        continue
                    observations[(src, dst)].append(
                        EdgeObservation(
                            src=src,
                            dst=dst,
                            weight=weight,
                            time_median=time_stats[0],
                            hpd_low=time_stats[1],
                            hpd_high=time_stats[2],
                        )
                    )

        support_metrics = self._parse_support_table(support_table) if support_table else {}

        edge_summaries: list[EdgeAggregate] = []
        for (src, dst), obs_list in observations.items():
            summary = self._summarise_edge(src, dst, obs_list, support_metrics.get((src, dst)))
            if summary.weight <= 0:
                continue
            edge_summaries.append(summary)

        edge_summaries.sort(key=lambda item: item.weight, reverse=True)

        node_summaries: list[NodeAggregate] = []
        observed_locations = set(list(ancestral_weight) + list(tip_weight))
        for location in sorted(observed_locations):
            accumulator = location_stats.get(location)
            latitude: Optional[float]
            longitude: Optional[float]
            if accumulator:
                latitude, longitude = accumulator.mean()
            else:
                latitude, longitude = (None, None)

            node_summaries.append(
                NodeAggregate(
                    location=location,
                    ancestral_weight=ancestral_weight.get(location, 0.0),
                    tip_weight=tip_weight.get(location, 0.0),
                    latitude=latitude,
                    longitude=longitude,
                )
            )

        analysis_id = uuid4().hex
        output_dir = self.analysis_dir / analysis_id
        output_dir.mkdir(parents=True, exist_ok=False)

        self._write_nodes_csv(output_dir, node_summaries)
        self._write_edges_csv(output_dir, edge_summaries)
        self._write_geojson(output_dir, node_summaries, edge_summaries)
        self._write_summary_markdown(
            output_dir,
            root_distribution,
            edge_summaries[: top_k or 10],
        )

        exports = {
            "nodes_csv": f"/api/analysis/discrete/{analysis_id}/nodes.csv",
            "edges_csv": f"/api/analysis/discrete/{analysis_id}/edges.csv",
            "map_geojson": f"/api/analysis/discrete/{analysis_id}/map.geojson",
            "summary_md": f"/api/analysis/discrete/{analysis_id}/summary.md",
        }

        root_rank = [
            LocationPosterior(location=location, probability=probability)
            for location, probability in sorted(
                root_distribution.items(), key=lambda item: item[1], reverse=True
            )
        ]

        return DiscreteAnalysisResult(
            analysis_id=analysis_id,
            root_distribution=root_rank,
            top_paths=edge_summaries[: top_k or 10],
            nodes=node_summaries,
            edges=edge_summaries,
            exports=exports,
        )

    @staticmethod
    def _normalise_distribution(distribution: Optional[dict[str, float]]) -> dict[str, float]:
        if not distribution:
            return {"Unknown": 1.0}
        positive = {k: float(v) for k, v in distribution.items() if v and float(v) > 0}
        if not positive:
            return {"Unknown": 1.0}
        total = sum(positive.values())
        if total <= 0:
            return {"Unknown": 1.0}
        return {k: v / total for k, v in positive.items()}

    @staticmethod
    def _best_state(distribution: dict[str, float]) -> tuple[str, float]:
        if not distribution:
            return ("Unknown", 0.0)
        location, probability = max(distribution.items(), key=lambda item: item[1])
        return (location, probability)

    @staticmethod
    def _clean_label(label: Any) -> str:
        if label is None:
            return "Unknown"
        text = str(label).strip().strip('"')
        return text or "Unknown"

    def _extract_location_distribution(self, traits: dict[str, Any]) -> dict[str, float]:
        if not traits:
            return {}

        candidate_keys = sorted(traits)
        for key in candidate_keys:
            lowered = key.lower()
            value = traits[key]
            if any(token in lowered for token in ("prob", "posterior", "freq")):
                distribution = self._coerce_distribution(key, value, traits)
                if distribution:
                    return distribution

        for key in candidate_keys:
            lowered = key.lower()
            value = traits[key]
            if lowered.endswith("state") or "location" in lowered:
                label = self._clean_label(value)
                if label != "Unknown":
                    return {label: 1.0}

        return {}

    def _coerce_distribution(
        self,
        key: str,
        value: Any,
        traits: dict[str, Any],
    ) -> dict[str, float]:
        if isinstance(value, dict):
            return {
                self._clean_label(k): float(v)
                for k, v in value.items()
                if self._clean_label(k) != "Unknown" and self._is_number(v)
            }

        if isinstance(value, (list, tuple)):
            if all(self._is_number(item) for item in value):
                labels = self._companion_labels(key, traits, len(value))
                if labels:
                    return {
                        self._clean_label(label): float(prob)
                        for label, prob in zip(labels, value)
                    }
            elif all(isinstance(item, str) for item in value):
                parsed = {}
                for item in value:
                    parts = re.split('[=:"\\s]+', item)
                    parts = [part for part in parts if part]
                    if len(parts) >= 2 and self._is_number(parts[-1]):
                        parsed[self._clean_label(parts[0])] = float(parts[-1])
                if parsed:
                    return parsed

        if isinstance(value, str):
            segments = re.split(r"[,;]\s*", value)
            parsed = {}
            for segment in segments:
                if not segment:
                    continue
                if "=" in segment:
                    label, probability = segment.split("=", 1)
                elif ":" in segment:
                    label, probability = segment.split(":", 1)
                else:
                    continue
                probability = probability.strip()
                if self._is_number(probability):
                    parsed[self._clean_label(label)] = float(probability)
            if parsed:
                return parsed

        return {}

    def _companion_labels(
        self, key: str, traits: dict[str, Any], expected_length: int
    ) -> list[str] | None:
        prefixes = [key.replace("prob", "set"), key.replace("prob", "states"), key.replace("posterior", "states")]
        prefixes.append(key.replace("prob", "labels"))
        prefixes.append(key.replace("prob", "state"))
        for prefix in prefixes:
            if prefix in traits and isinstance(traits[prefix], (list, tuple)):
                labels = [self._clean_label(label) for label in traits[prefix]]
                if len(labels) == expected_length:
                    return labels
        return None

    @staticmethod
    def _extract_coordinates(traits: dict[str, Any]) -> Optional[tuple[float, float]]:
        if not traits:
            return None
        lat_keys = ("location_lat", "latitude", "lat", "location1")
        lon_keys = ("location_lon", "longitude", "lon", "location2")
        latitude = None
        longitude = None
        for key in lat_keys:
            value = traits.get(key)
            if DiscreteAnalysisService._is_number(value):
                latitude = float(value)
                break
        for key in lon_keys:
            value = traits.get(key)
            if DiscreteAnalysisService._is_number(value):
                longitude = float(value)
                break
        if latitude is None or longitude is None:
            return None
        return (latitude, longitude)

    @staticmethod
    def _is_number(value: Any) -> bool:
        try:
            float(value)
        except (TypeError, ValueError):
            return False
        return True

    @staticmethod
    def _infer_reference_year(nodes: Iterable[TreeNode]) -> Optional[float]:
        latest_date: Optional[datetime] = None
        for node in nodes:
            traits = node.traits or {}
            for key, value in traits.items():
                if not isinstance(value, (str, int, float)):
                    continue
                key_lower = key.lower()
                if "date" not in key_lower and "year" not in key_lower:
                    continue
                parsed = DiscreteAnalysisService._parse_date(value)
                if parsed and (latest_date is None or parsed > latest_date):
                    latest_date = parsed
        if not latest_date:
            return None
        year = latest_date.year
        start_of_year = datetime(year, 1, 1, tzinfo=latest_date.tzinfo)
        delta = latest_date - start_of_year
        return year + delta.days / 365.25

    @staticmethod
    def _parse_date(value: Any) -> Optional[datetime]:
        if isinstance(value, datetime):
            return value
        text = str(value).strip()
        if not text:
            return None
        formats = ["%Y-%m-%d", "%Y/%m/%d", "%d-%b-%Y", "%Y-%m", "%Y"]
        for fmt in formats:
            try:
                return datetime.strptime(text, fmt)
            except ValueError:
                continue
        return None

    def _extract_time_stats(
        self, node: TreeNode, reference_year: Optional[float]
    ) -> tuple[Optional[float], Optional[float], Optional[float]]:
        median = self._get_numeric_trait(node, ("height_median", "time_median"))
        if median is None:
            median = node.time_before_present

        hpd_values = self._get_sequence_trait(
            node,
            ("height_95%_HPD", "height_95%HPD", "time_95%_HPD"),
        )
        hpd_low, hpd_high = (None, None)
        if hpd_values and len(hpd_values) >= 2:
            hpd_low = min(hpd_values)
            hpd_high = max(hpd_values)

        if reference_year is not None:
            median = self._convert_to_year(reference_year, median)
            converted_low = (
                self._convert_to_year(reference_year, hpd_low)
                if hpd_low is not None
                else None
            )
            converted_high = (
                self._convert_to_year(reference_year, hpd_high)
                if hpd_high is not None
                else None
            )
            if converted_low is not None and converted_high is not None:
                hpd_low = min(converted_low, converted_high)
                hpd_high = max(converted_low, converted_high)
            else:
                hpd_low = converted_low
                hpd_high = converted_high

        return (median, hpd_low, hpd_high)

    @staticmethod
    def _convert_to_year(reference_year: float, time_before_present: Optional[float]) -> Optional[float]:
        if time_before_present is None:
            return None
        return reference_year - float(time_before_present)

    @staticmethod
    def _get_numeric_trait(node: TreeNode, keys: Iterable[str]) -> Optional[float]:
        traits = node.traits or {}
        for key in keys:
            if key in traits and DiscreteAnalysisService._is_number(traits[key]):
                return float(traits[key])
        return None

    @staticmethod
    def _get_sequence_trait(node: TreeNode, keys: Iterable[str]) -> Optional[list[float]]:
        traits = node.traits or {}
        for key in keys:
            value = traits.get(key)
            if isinstance(value, (list, tuple)):
                numeric = [float(v) for v in value if DiscreteAnalysisService._is_number(v)]
                if numeric:
                    return numeric
        return None

    def _summarise_edge(
        self,
        src: str,
        dst: str,
        observations: list[EdgeObservation],
        support: Optional[dict[str, Any]] = None,
    ) -> EdgeAggregate:
        total_weight = sum(obs.weight for obs in observations)
        if total_weight <= 0:
            return EdgeAggregate(src=src, dst=dst, weight=0.0)

        times = [obs.time_median for obs in observations if obs.time_median is not None]
        hpd_lows = [obs.hpd_low for obs in observations if obs.hpd_low is not None]
        hpd_highs = [obs.hpd_high for obs in observations if obs.hpd_high is not None]

        time_median = self._weighted_quantile(observations, 0.5)
        time_hpd_low = self._weighted_quantile(observations, 0.025, attribute="hpd_low")
        time_hpd_high = self._weighted_quantile(observations, 0.975, attribute="hpd_high")

        if time_median is None and times:
            time_median = mean(times)
        if time_hpd_low is None and hpd_lows:
            time_hpd_low = min(hpd_lows)
        if time_hpd_high is None and hpd_highs:
            time_hpd_high = max(hpd_highs)

        summary = EdgeAggregate(
            src=src,
            dst=dst,
            weight=total_weight,
            time_median=time_median,
            time_hpd_low=time_hpd_low,
            time_hpd_high=time_hpd_high,
        )

        if support:
            summary.bayes_factor = support.get("bayes_factor")
            summary.posterior_support = support.get("posterior")
            summary.jumps_mean = support.get("jumps_mean")
            summary.jumps_hpd_low = support.get("jumps_hpd_low")
            summary.jumps_hpd_high = support.get("jumps_hpd_high")

        return summary

    @staticmethod
    def _weighted_quantile(
        observations: list[EdgeObservation],
        quantile: float,
        attribute: str = "time_median",
    ) -> Optional[float]:
        values = []
        weights = []
        for obs in observations:
            value = getattr(obs, attribute)
            if value is None:
                continue
            values.append(value)
            weights.append(obs.weight)
        if not values or not weights:
            return None
        order = sorted(zip(values, weights), key=lambda item: item[0])
        cumulative = 0.0
        total = sum(weights)
        for value, weight in order:
            cumulative += weight
            if cumulative / total >= quantile:
                return value
        return order[-1][0]

    def _parse_support_table(
        self, raw_text: str
    ) -> dict[tuple[str, str], dict[str, Any]]:
        buffer = io.StringIO(raw_text)
        try:
            sample = buffer.read(1024)
        finally:
            buffer.seek(0)
        if sample:
            try:
                dialect = csv.Sniffer().sniff(sample, delimiters=",\t;")
            except csv.Error:
                dialect = csv.excel
        else:
            dialect = csv.excel
        reader = csv.DictReader(buffer, dialect=dialect)
        columns = reader.fieldnames or []

        edge_series: dict[tuple[str, str], dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))

        for row in reader:
            for column in columns:
                if column not in row:
                    continue
                value = row[column].strip() if isinstance(row[column], str) else row[column]
                if not self._is_number(value):
                    continue
                metric = float(value)
                edge_key, metric_key = self._interpret_support_column(column)
                if not edge_key:
                    continue
                edge_series[edge_key][metric_key].append(metric)

        summary: dict[tuple[str, str], dict[str, Any]] = {}
        for edge, metrics in edge_series.items():
            result: dict[str, Any] = {}
            if "bf" in metrics:
                result["bayes_factor"] = mean(metrics["bf"])
            if "posterior" in metrics:
                result["posterior"] = min(max(mean(metrics["posterior"]), 0.0), 1.0)
            if "jumps" in metrics:
                values = metrics["jumps"]
                result["jumps_mean"] = mean(values)
                result["jumps_hpd_low"], result["jumps_hpd_high"] = self._basic_hpd(values)
            summary[edge] = result

        return summary

    def _interpret_support_column(
        self, column: str
    ) -> tuple[Optional[tuple[str, str]], str]:
        header = column.strip()
        match = EDGE_COLUMN_PATTERN.search(header)
        if match:
            prefix = match.group("prefix").lower()
            src = self._clean_label(match.group("src"))
            dst = self._clean_label(match.group("dst"))
            metric = self._classify_metric(prefix)
            return (src, dst), metric

        match = GENERIC_PAIR_PATTERN.search(header)
        if match:
            src = self._clean_label(match.group("src"))
            dst = self._clean_label(match.group("dst"))
            metric = self._classify_metric(header.lower())
            return (src, dst), metric

        return (None, "")

    @staticmethod
    def _classify_metric(prefix: str) -> str:
        if "bf" in prefix or "bayes" in prefix:
            return "bf"
        if "indicator" in prefix or "posterior" in prefix or "support" in prefix:
            return "posterior"
        if "jump" in prefix:
            return "jumps"
        if "count" in prefix:
            return "jumps"
        return "posterior"

    @staticmethod
    def _basic_hpd(values: list[float]) -> tuple[Optional[float], Optional[float]]:
        if not values:
            return (None, None)
        sorted_values = sorted(values)
        lower_index = max(int(len(sorted_values) * 0.025) - 1, 0)
        upper_index = min(int(len(sorted_values) * 0.975), len(sorted_values) - 1)
        return (sorted_values[lower_index], sorted_values[upper_index])

    def _write_nodes_csv(self, directory: Path, nodes: list[NodeAggregate]) -> None:
        path = directory / "nodes.csv"
        with path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.writer(handle)
            writer.writerow(["location", "ancestral_weight", "tip_weight", "latitude", "longitude"])
            for node in nodes:
                writer.writerow([
                    node.location,
                    f"{node.ancestral_weight:.6f}",
                    f"{node.tip_weight:.6f}",
                    f"{node.latitude:.6f}" if node.latitude is not None else "",
                    f"{node.longitude:.6f}" if node.longitude is not None else "",
                ])

    def _write_edges_csv(self, directory: Path, edges: list[EdgeAggregate]) -> None:
        path = directory / "edges.csv"
        with path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.writer(handle)
            writer.writerow(
                [
                    "src",
                    "dst",
                    "weight",
                    "time_median",
                    "time_hpd_low",
                    "time_hpd_high",
                    "bayes_factor",
                    "posterior_support",
                    "jumps_mean",
                    "jumps_hpd_low",
                    "jumps_hpd_high",
                ]
            )
            for edge in edges:
                writer.writerow(
                    [
                        edge.src,
                        edge.dst,
                        f"{edge.weight:.6f}",
                        f"{edge.time_median:.6f}" if edge.time_median is not None else "",
                        f"{edge.time_hpd_low:.6f}" if edge.time_hpd_low is not None else "",
                        f"{edge.time_hpd_high:.6f}" if edge.time_hpd_high is not None else "",
                        f"{edge.bayes_factor:.6f}" if edge.bayes_factor is not None else "",
                        f"{edge.posterior_support:.6f}" if edge.posterior_support is not None else "",
                        f"{edge.jumps_mean:.6f}" if edge.jumps_mean is not None else "",
                        f"{edge.jumps_hpd_low:.6f}" if edge.jumps_hpd_low is not None else "",
                        f"{edge.jumps_hpd_high:.6f}" if edge.jumps_hpd_high is not None else "",
                    ]
                )

    def _write_geojson(
        self,
        directory: Path,
        nodes: list[NodeAggregate],
        edges: list[EdgeAggregate],
    ) -> None:
        node_lookup = {
            node.location: node
            for node in nodes
            if node.latitude is not None and node.longitude is not None
        }
        features: list[dict[str, Any]] = []
        for node in nodes:
            if node.latitude is None or node.longitude is None:
                continue
            features.append(
                {
                    "type": "Feature",
                    "geometry": {
                        "type": "Point",
                        "coordinates": [node.longitude, node.latitude],
                    },
                    "properties": {
                        "location": node.location,
                        "ancestral_weight": node.ancestral_weight,
                        "tip_weight": node.tip_weight,
                    },
                }
            )

        for edge in edges:
            src_node = node_lookup.get(edge.src)
            dst_node = node_lookup.get(edge.dst)
            if not src_node or not dst_node:
                continue
            features.append(
                {
                    "type": "Feature",
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [
                            [src_node.longitude, src_node.latitude],
                            [dst_node.longitude, dst_node.latitude],
                        ],
                    },
                    "properties": {
                        "src": edge.src,
                        "dst": edge.dst,
                        "weight": edge.weight,
                        "time_median": edge.time_median,
                        "time_hpd_low": edge.time_hpd_low,
                        "time_hpd_high": edge.time_hpd_high,
                        "bayes_factor": edge.bayes_factor,
                        "posterior_support": edge.posterior_support,
                        "jumps_mean": edge.jumps_mean,
                        "jumps_hpd_low": edge.jumps_hpd_low,
                        "jumps_hpd_high": edge.jumps_hpd_high,
                    },
                }
            )

        path = directory / "map.geojson"
        with path.open("w", encoding="utf-8") as handle:
            json.dump({"type": "FeatureCollection", "features": features}, handle, ensure_ascii=False, indent=2)

    def _write_summary_markdown(
        self,
        directory: Path,
        root_distribution: dict[str, float],
        top_paths: list[EdgeAggregate],
    ) -> None:
        lines = ["# Discrete Trait Summary", ""]
        lines.append("## Root Origin Posterior")
        lines.append("| Rank | Location | Posterior |")
        lines.append("| ---- | -------- | --------- |")
        for index, (location, probability) in enumerate(
            sorted(root_distribution.items(), key=lambda item: item[1], reverse=True),
            start=1,
        ):
            lines.append(f"| {index} | {location} | {probability:.4f} |")

        lines.append("")
        lines.append("## Top Transition Paths")
        lines.append("| Rank | Path | Weight | Time Median | Time 95% HPD | Support |")
        lines.append("| ---- | ---- | ------ | ----------- | ------------ | ------- |")
        for index, edge in enumerate(top_paths, start=1):
            interval = "–" if edge.time_hpd_low is None or edge.time_hpd_high is None else f"{edge.time_hpd_low:.2f}–{edge.time_hpd_high:.2f}"
            support_parts = []
            if edge.bayes_factor is not None:
                support_parts.append(f"BF={edge.bayes_factor:.2f}")
            if edge.posterior_support is not None:
                support_parts.append(f"p={edge.posterior_support:.3f}")
            if edge.jumps_mean is not None:
                support_parts.append(f"jumps={edge.jumps_mean:.2f}")
            support_text = ", ".join(support_parts) if support_parts else "–"
            median_text = f"{edge.time_median:.2f}" if edge.time_median is not None else "–"
            lines.append(
                f"| {index} | {edge.src} → {edge.dst} | {edge.weight:.4f} | {median_text} | {interval} | {support_text} |"
            )

        lines.append("")
        lines.append("## Notes")
        lines.append(
            "- Posterior weights are derived from the MCC tree distributions; "
            "interpret as expected transition counts."
        )
        lines.append(
            "- Timing estimates are approximated from the child's time-before-present annotations."
        )
        lines.append(
            "- Support values (Bayes Factor, posterior inclusion, Markov jumps) are included when files were provided."
        )

        path = directory / "summary.md"
        with path.open("w", encoding="utf-8") as handle:
            handle.write("\n".join(lines))


@lru_cache(maxsize=1)
def get_discrete_analysis_service() -> DiscreteAnalysisService:
    """Return a cached service instance."""

    return DiscreteAnalysisService()
