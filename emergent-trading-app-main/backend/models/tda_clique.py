"""
tda_clique.py — Clique Complex / Persistent Homology via Vietoris–Rips filtration.
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Tuple

import numpy as np

from utils.geometry_guard import (
    PRIMARY_ANCHOR_ERROR,
    anchor_in_labels,
    degraded_flag,
    resolve_peers_safe,
)
from utils.market_fetch import fetch_aligned_closes, log_returns


def _round(x: float, n: int = 4) -> float:
    return round(float(x), n)


def _circle_layout(n: int) -> List[Dict[str, float]]:
    phase = -math.pi / 2
    return [
        {"x": math.cos(phase + 2 * math.pi * i / n),
         "y": math.sin(phase + 2 * math.pi * i / n)}
        for i in range(n)
    ]


class _UnionFind:
    def __init__(self, n: int) -> None:
        self.parent = list(range(n))

    def find(self, x: int) -> int:
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x

    def union(self, a: int, b: int) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.parent[ra] = rb

    def components(self) -> int:
        return len({self.find(i) for i in range(len(self.parent))})


def _distance_matrix(corr: np.ndarray) -> np.ndarray:
    n = corr.shape[0]
    d = np.zeros((n, n), dtype=np.float64)
    for i in range(n):
        for j in range(i + 1, n):
            val = 1.0 - abs(float(corr[i, j]))
            val = max(0.0, min(1.0, val))
            d[i, j] = d[j, i] = val
    return d


def _betti_curves(dist: np.ndarray, steps: int = 50) -> Tuple[List[List[float]], List[List[float]]]:
    n = dist.shape[0]
    beta0_series: List[List[float]] = []
    beta1_series: List[List[float]] = []

    for s in range(steps + 1):
        eps = s / steps
        uf = _UnionFind(n)
        edges = 0
        active = np.zeros((n, n), dtype=bool)
        for i in range(n):
            for j in range(i + 1, n):
                if dist[i, j] <= eps + 1e-12:
                    edges += 1
                    active[i, j] = active[j, i] = True
                    uf.union(i, j)
        triangles = 0
        for i in range(n):
            for j in range(i + 1, n):
                if not active[i, j]:
                    continue
                for k in range(j + 1, n):
                    if active[i, k] and active[j, k]:
                        triangles += 1
        beta0 = uf.components()
        chi = n - edges + triangles
        beta1 = max(0, beta0 - chi)
        beta0_series.append([_round(eps), beta0])
        beta1_series.append([_round(eps), beta1])

    return beta0_series, beta1_series


def _edges_at_threshold(dist: np.ndarray, eps: float) -> List[List[float]]:
    n = dist.shape[0]
    out: List[List[float]] = []
    for i in range(n):
        for j in range(i + 1, n):
            if dist[i, j] <= eps + 1e-12:
                out.append([i, j, _round(1.0 - dist[i, j], 4)])
    return out


def _triangles_at_threshold(dist: np.ndarray, eps: float) -> List[List[int]]:
    n = dist.shape[0]
    active = dist <= eps + 1e-12
    np.fill_diagonal(active, False)
    tris: List[List[int]] = []
    for i in range(n):
        for j in range(i + 1, n):
            if not active[i, j]:
                continue
            for k in range(j + 1, n):
                if active[i, k] and active[j, k]:
                    tris.append([i, j, k])
    return tris


def _interpretation(max_beta1: int) -> str:
    if max_beta1 >= 4:
        return "high_cyclic"
    if max_beta1 <= 1:
        return "tree_like"
    return "low_cyclic"


def _degraded_clique_response(
    sym: str,
    horizon: str,
    labels: List[str],
    peers_requested: List[str],
) -> Dict[str, Any]:
    base = degraded_flag(PRIMARY_ANCHOR_ERROR)
    return {
        **base,
        "ticker": sym,
        "peers": labels,
        "n_peers": len(labels),
        "days_used": 0,
        "horizon": horizon,
        "beta0_series": [[0.0, 1]],
        "beta1_series": [[0.0, 0]],
        "eps_star": 0.0,
        "max_beta1": 0,
        "interpretation": "tree_like",
        "clique_complex_edges": [],
        "clique_complex_triangles": [],
        "node_labels": labels,
        "node_layout": _circle_layout(max(1, len(labels))),
        "peers_requested": peers_requested,
    }


def run_tda_clique(
    ticker: str,
    days: int = 90,
    horizon: str = "medium",
    n_peers: int = 10,
) -> Dict[str, Any]:
    sym = (ticker or "SPY").strip().upper()
    n_peers = max(8, min(14, int(n_peers)))
    days = max(60, min(365, int(days)))

    peers, _peer_err = resolve_peers_safe(sym, n_peers=n_peers)
    try:
        closes, labels, days_used = fetch_aligned_closes(
            peers, lookback_days=days, buffer_days=60, min_rows=60,
        )
    except ValueError:
        return _degraded_clique_response(sym, horizon, [], peers)

    if not anchor_in_labels(sym, labels):
        return _degraded_clique_response(sym, horizon, labels, peers)

    rets = log_returns(closes[labels])
    if len(rets) < 30:
        raise ValueError("Insufficient return history after alignment.")

    corr = np.corrcoef(rets.to_numpy(dtype=np.float64).T)
    if not np.all(np.isfinite(corr)):
        corr = np.nan_to_num(corr, nan=0.0)

    dist = _distance_matrix(corr)
    beta0_series, beta1_series = _betti_curves(dist, steps=50)

    max_beta1 = 0
    eps_star = 0.5
    for (eps, b1) in beta1_series:
        if b1 > max_beta1:
            max_beta1 = int(b1)
            eps_star = float(eps)

    warnings: List[str] = []
    if max_beta1 == 0:
        warnings.append("No persistent 1-cycles detected; graph is tree-like at all thresholds.")

    return {
        "ticker": sym,
        "peers": labels,
        "n_peers": len(labels),
        "days_used": days_used,
        "horizon": horizon,
        "beta0_series": beta0_series,
        "beta1_series": beta1_series,
        "eps_star": _round(eps_star),
        "max_beta1": max_beta1,
        "interpretation": _interpretation(max_beta1),
        "clique_complex_edges": _edges_at_threshold(dist, eps_star),
        "clique_complex_triangles": _triangles_at_threshold(dist, eps_star),
        "node_labels": labels,
        "node_layout": _circle_layout(len(labels)),
        "warnings": warnings,
    }
