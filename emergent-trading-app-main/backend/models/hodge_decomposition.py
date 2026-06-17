"""
hodge_decomposition.py — Discrete Hodge decomposition of cross-asset return flows.
"""

from __future__ import annotations

from typing import Any, Dict, List, Tuple

import numpy as np
from scipy.linalg import svd

from utils.geometry_guard import (
    PRIMARY_ANCHOR_ERROR,
    anchor_in_labels,
    degraded_flag,
    resolve_peers_safe,
)
from utils.market_fetch import fetch_aligned_closes, log_returns


def _round(x: float, n: int = 4) -> float:
    return round(float(x), n)


def _build_graph(corr: np.ndarray, labels: List[str], threshold: float = 0.3) -> Tuple[List[Tuple[int, int]], np.ndarray]:
    n = len(labels)
    edges: List[Tuple[int, int]] = []
    corrs: List[float] = []
    for i in range(n):
        for j in range(i + 1, n):
            if abs(corr[i, j]) > threshold:
                edges.append((i, j))
                corrs.append(float(corr[i, j]))
    return edges, np.array(corrs, dtype=np.float64)


def _incidence_matrix(n: int, edges: List[Tuple[int, int]]) -> np.ndarray:
    m = len(edges)
    b = np.zeros((n, m), dtype=np.float64)
    for k, (i, j) in enumerate(edges):
        b[i, k] = -1.0
        b[j, k] = 1.0
    return b


def _cycle_basis(b_inc: np.ndarray) -> np.ndarray:
    """Orthonormal basis for ker(B) via SVD null space."""
    if b_inc.size == 0:
        return np.zeros((0, 0))
    _, s, vh = svd(b_inc, full_matrices=True)
    tol = max(b_inc.shape) * np.finfo(float).eps * (s[0] if len(s) else 1.0)
    rank = int(np.sum(s > tol))
    null_start = rank
    if null_start >= vh.shape[0]:
        return np.zeros((b_inc.shape[1], 0))
    cycles = vh[null_start:, :].T
    return cycles


def _hodge_decompose(flow: np.ndarray, b_inc: np.ndarray) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Project edge flow onto gradient + curl (cycle) + harmonic subspaces."""
    m = len(flow)
    n = b_inc.shape[0]
    if m == 0:
        return flow, flow * 0, flow * 0, np.zeros(n)

    # Gradient: x_grad = B^T φ with (B B^T) φ = B x
    bb_t = b_inc @ b_inc.T
    rhs = b_inc @ flow
    phi, _, _, _ = np.linalg.lstsq(bb_t, rhs, rcond=None)
    x_grad = b_inc.T @ phi
    residual = flow - x_grad

    cycles = _cycle_basis(b_inc)
    if cycles.shape[1] == 0:
        return x_grad, residual * 0, residual, phi

    curl_coef, _, _, _ = np.linalg.lstsq(cycles, residual, rcond=None)
    x_curl = cycles @ curl_coef
    x_harm = residual - x_curl
    return x_grad, x_curl, x_harm, phi


def _energy_shares(x: np.ndarray, xg: np.ndarray, xc: np.ndarray, xh: np.ndarray) -> Tuple[float, float, float]:
    total = float(np.dot(x, x))
    if total < 1e-14:
        return 0.33, 0.33, 0.34
    return (
        float(np.dot(xg, xg) / total),
        float(np.dot(xc, xc) / total),
        float(np.dot(xh, xh) / total),
    )


def _interpretation(g_pct: float, s_pct: float, h_pct: float) -> str:
    if g_pct >= s_pct and g_pct >= h_pct:
        return "trend_dominant"
    if s_pct >= h_pct:
        return "cyclic_dominant"
    return "equilibrium"


def _degraded_hodge_response(
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
        "days_used": 0,
        "horizon": horizon,
        "gradient_pct": 0.0,
        "solenoidal_pct": 0.0,
        "harmonic_pct": 0.0,
        "node_potentials": {},
        "edge_flows": [],
        "graph_edges": [],
        "interpretation": "equilibrium",
        "peers_requested": peers_requested,
    }


def run_hodge_decomposition(
    ticker: str,
    days: int = 60,
    horizon: str = "medium",
    n_assets: int = 8,
) -> Dict[str, Any]:
    sym = (ticker or "SPY").strip().upper()
    n_assets = max(7, min(12, int(n_assets)))
    days = max(30, min(90, int(days)))

    peers, _peer_err = resolve_peers_safe(sym, n_peers=n_assets)
    try:
        closes, labels, days_used = fetch_aligned_closes(
            peers, lookback_days=days, buffer_days=40, min_rows=30,
        )
    except ValueError:
        return _degraded_hodge_response(sym, horizon, [], peers)

    if not anchor_in_labels(sym, labels):
        return _degraded_hodge_response(sym, horizon, labels, peers)
    rets = log_returns(closes[labels])
    if len(rets) < 20:
        raise ValueError("Insufficient return history for Hodge decomposition.")

    corr = np.corrcoef(rets.to_numpy(dtype=np.float64).T)
    if not np.all(np.isfinite(corr)):
        corr = np.nan_to_num(corr, nan=0.0)

    edges, edge_corrs = _build_graph(corr, labels, threshold=0.3)
    if len(edges) < 2:
        raise ValueError("Graph too sparse: fewer than 2 edges above correlation threshold 0.3.")

    ret_arr = rets[labels].to_numpy(dtype=np.float64)
    flow = np.zeros(len(edges), dtype=np.float64)
    for k, (i, j) in enumerate(edges):
        ri, rj = ret_arr[:, i], ret_arr[:, j]
        vi = float(np.var(ri, ddof=1))
        beta = float(np.cov(ri, rj, ddof=1)[0, 1] / vi) if vi > 1e-14 else 0.0
        flow[k] = float(np.mean(ri - beta * rj))

    b_inc = _incidence_matrix(len(labels), edges)
    x_grad, x_curl, x_harm, phi = _hodge_decompose(flow, b_inc)
    g_pct, s_pct, h_pct = _energy_shares(flow, x_grad, x_curl, x_harm)

    node_potentials = {labels[i]: _round(float(phi[i]), 4) for i in range(len(labels))}

    edge_flows = [
        [i, j, _round(float(flow[k]), 5), _round(float(x_grad[k]), 5),
         _round(float(x_curl[k]), 5), _round(float(x_harm[k]), 5)]
        for k, (i, j) in enumerate(edges)
    ]
    graph_edges = [
        [i, j, _round(float(edge_corrs[k]), 4)]
        for k, (i, j) in enumerate(edges)
    ]

    return {
        "ticker": sym,
        "peers": labels,
        "days_used": days_used,
        "horizon": horizon,
        "gradient_pct": _round(g_pct, 4),
        "solenoidal_pct": _round(s_pct, 4),
        "harmonic_pct": _round(h_pct, 4),
        "node_potentials": node_potentials,
        "edge_flows": edge_flows,
        "graph_edges": graph_edges,
        "interpretation": _interpretation(g_pct, s_pct, h_pct),
        "warnings": [],
    }
