"""
sheaf_cohomology.py
================================================================================
Čech cohomology H¹ of a market-data sheaf over a finite nerve cover.

Each open set Uᵢ is a peer asset in the instrument basket. Local sections are
mean log-returns over the observation window; edge transitions carry the
observed return spread. Spanning-tree gauge removal exposes holonomy around
independent cycles = informational obstruction (arbitrage residual).
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import yfinance as yf

from utils.geometry_guard import (
    PRIMARY_ANCHOR_ERROR,
    anchor_in_labels,
    degraded_flag,
    resolve_peers_safe,
)
from utils.peer_resolver import resolve_yahoo


def _round(x: float, n: int = 3) -> float:
    return round(float(x), n)


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, float(x)))


def _circle_layout(n: int) -> List[Dict[str, float]]:
    phase = -math.pi / 2
    return [
        {"x": math.cos(phase + 2 * math.pi * i / n),
         "y": math.sin(phase + 2 * math.pi * i / n)}
        for i in range(n)
    ]


def _fetch_peer_returns(
    peers: List[str],
    lookback_days: int,
) -> Tuple[pd.DataFrame, List[str]]:
    """Download aligned daily log-returns for available peers."""
    period = f"{max(lookback_days + 60, 90)}d"
    frames: Dict[str, pd.Series] = {}
    labels: List[str] = []

    for peer in peers:
        yahoo = resolve_yahoo(peer)
        try:
            df = yf.Ticker(yahoo).history(period=period, interval="1d", auto_adjust=True)
            if df is None or df.empty:
                continue
            close = df["Close"].dropna()
            close.index = pd.to_datetime(close.index).tz_localize(None)
            log_ret = np.log(close / close.shift(1)).dropna()
            if len(log_ret) < max(lookback_days, 10):
                continue
            frames[peer.upper()] = log_ret
            labels.append(peer.upper())
        except Exception:
            continue

    if len(frames) < 3:
        return pd.DataFrame(), []

    aligned = pd.DataFrame(frames).dropna(how="any")
    return aligned, labels


def _build_nerve_edges(m: int, corr: np.ndarray, connectivity: float) -> List[Dict[str, int]]:
    """Ring cover + correlation chords (mimics the mock nerve)."""
    edge_set: set = set()
    edges: List[Dict[str, int]] = []

    def add_edge(a: int, b: int) -> None:
        if a == b:
            return
        key = (min(a, b), max(a, b))
        if key in edge_set:
            return
        edge_set.add(key)
        edges.append({"i": key[0], "j": key[1]})

    for i in range(m):
        add_edge(i, (i + 1) % m)

    n_chords = max(1, min(m - 2, int(round(m * connectivity * 0.9))))
    pairs = [
        (i, j, abs(corr[i, j]))
        for i in range(m)
        for j in range(i + 2, m)
        if not (i == 0 and j == m - 1)
    ]
    pairs.sort(key=lambda x: x[2], reverse=True)
    for i, j, _ in pairs[:n_chords]:
        add_edge(i, j)

    return edges


def _compute_cohomology(
    returns: pd.DataFrame,
    labels: List[str],
    window: int,
    end_idx: Optional[int] = None,
    connectivity: float = 0.5,
) -> Dict[str, Any]:
    """Čech H¹ obstruction from a return matrix slice."""
    if end_idx is None:
        end_idx = len(returns)
    start = max(0, end_idx - window)
    slice_df = returns.iloc[start:end_idx]
    if len(slice_df) < max(5, window // 2):
        slice_df = returns.iloc[-window:]

    m = len(labels)
    log_r = slice_df.to_numpy(dtype=np.float64)
    # Node sections (annualized % for display); transitions use daily % for T-invariance.
    daily_sections = (log_r.mean(axis=0) * 100.0).tolist()
    sections = (log_r.mean(axis=0) * 252.0 * 100.0).tolist()

    corr = np.corrcoef(log_r.T)
    if not np.all(np.isfinite(corr)):
        corr = np.nan_to_num(corr, nan=0.0)

    edges = _build_nerve_edges(m, corr, connectivity)

    # Edge transitions: daily coboundary + mean daily β-hedged friction (window-invariant).
    for e in edges:
        i, j = e["i"], e["j"]
        ri, rj = log_r[:, i], log_r[:, j]
        vi = float(np.var(ri, ddof=1))
        beta_ij = float(np.cov(ri, rj, ddof=1)[0, 1] / vi) if vi > 1e-14 else 0.0

        coboundary = daily_sections[j] - daily_sections[i]
        rho = float(corr[i, j])
        friction_scale = max(0.2, 1.0 - abs(rho) * 0.75)
        hedge_res = rj - beta_ij * ri
        # Mean daily friction (% per day), not cumulative sum over the window.
        pair_residual = float(hedge_res.mean() * 100.0) * friction_scale

        e["transition"] = _round(coboundary + pair_residual)
        e["obstruction"] = 0.0
        e["_residual"] = _round(pair_residual)

    # Spanning tree gauge (BFS).
    adj: List[List[Dict]] = [[] for _ in range(m)]
    for idx, e in enumerate(edges):
        adj[e["i"]].append({"to": e["j"], "idx": idx, "sign": 1})
        adj[e["j"]].append({"to": e["i"], "idx": idx, "sign": -1})

    phi = [None] * m
    tree_edge = [False] * len(edges)
    components = 0

    for start in range(m):
        if phi[start] is not None:
            continue
        components += 1
        phi[start] = 0.0
        queue = [start]
        while queue:
            u = queue.pop(0)
            for nb in adj[u]:
                v, idx, sign = nb["to"], nb["idx"], nb["sign"]
                if phi[v] is None:
                    phi[v] = phi[u] + sign * edges[idx]["transition"]
                    tree_edge[idx] = True
                    queue.append(v)

    cocycles = []
    for idx, e in enumerate(edges):
        if tree_edge[idx]:
            e["obstruction"] = 0.0
            continue
        hol = e["transition"] - (phi[e["j"]] - phi[e["i"]])
        e["obstruction"] = _round(hol)
        cocycles.append({
            "edge": idx,
            "i": e["i"],
            "j": e["j"],
            "holonomy": _round(hol),
        })

    h1_dim = len(edges) - m + components
    obstruction_raw = sum(abs(c["holonomy"]) for c in cocycles)
    # Map mean |holonomy| per cocycle → [0, 1] without window-length saturation.
    if cocycles:
        avg_hol = obstruction_raw / len(cocycles)
        obstruction_index = _round(_clamp01(math.tanh(avg_hol / 0.75)))
    else:
        obstruction_index = 0.0

    pos = _circle_layout(m)
    return {
        "m": m,
        "nodes": [
            {
                "id": i,
                "label": labels[i],
                "x": pos[i]["x"],
                "y": pos[i]["y"],
                "section": _round(sections[i]),
            }
            for i in range(m)
        ],
        "edges": edges,
        "cocycles": cocycles,
        "metrics": {
            "h0_dim": components,
            "h1_dim": h1_dim,
            "euler_char": components - h1_dim,
            "obstruction_index": obstruction_index,
            "n_overlaps": len(edges),
            "arbitrage": obstruction_index > 0.55,
        },
    }


def _degraded_sheaf_response(
    sym: str,
    horizon: str,
    window: int,
    peers_requested: List[str],
    labels_fetched: List[str],
) -> Dict[str, Any]:
    """Graceful payload when the primary asset is missing from aligned data."""
    base = degraded_flag(PRIMARY_ANCHOR_ERROR)
    return {
        **base,
        "m": 0,
        "nodes": [],
        "edges": [],
        "cocycles": [],
        "series": [{"t": 1, "mag": 0.0}],
        "metrics": {
            "h0_dim": 0,
            "h1_dim": 0,
            "euler_char": 0,
            "obstruction_index": 0.0,
            "n_overlaps": 0,
            "arbitrage": False,
        },
        "meta": {
            "ticker": sym,
            "horizon": horizon,
            "days": window,
            "n_observations": 0,
            "peers_used": labels_fetched,
            "peers_requested": peers_requested,
            "live": False,
        },
    }


def run_sheaf_cohomology(
    ticker: str,
    days: int = 30,
    horizon: str = "medium",
    connectivity: float = 0.5,
) -> Dict[str, Any]:
    """
    Compute sheaf cohomology obstruction from live Yahoo Finance peer returns.

    Parameters
    ----------
    ticker : str
        Primary instrument (UI symbol, e.g. ETH, SWDA).
    days : int
        Observation window in trading days (from global horizon selector).
    horizon : str
        Regime id (short/medium/long) — used for metadata only.
    connectivity : float
        Baseline edge density for the nerve graph.
    """
    sym = (ticker or "SPY").strip().upper()
    peers, _peer_err = resolve_peers_safe(sym, n_peers=12)
    window = max(5, int(days))

    returns, labels = _fetch_peer_returns(peers, window)
    if not anchor_in_labels(sym, labels) or returns.empty or len(labels) < 3:
        return _degraded_sheaf_response(sym, horizon, window, peers, labels)

    # Cap graph size (6–8 nodes); anchor must remain in the basket.
    m_target = max(6, min(8, len(labels)))
    if len(labels) > m_target:
        vols = returns.std().sort_values(ascending=False)
        keep = [sym] if sym in vols.index else []
        for p in vols.index:
            if p not in keep:
                keep.append(p)
            if len(keep) >= m_target:
                break
        if sym not in keep:
            return _degraded_sheaf_response(sym, horizon, window, peers, labels)
        labels = keep[:m_target]
        returns = returns[labels]

    snapshot = _compute_cohomology(returns, labels, window, connectivity=connectivity)

    # Rolling obstruction magnitude time series.
    series = []
    min_t = window
    n_obs = len(returns)
    step = max(1, (n_obs - min_t) // 39) if n_obs > min_t else 1
    for t_idx in range(min_t, n_obs, step):
        snap_t = _compute_cohomology(
            returns, labels, window, end_idx=t_idx + 1, connectivity=connectivity,
        )
        series.append({"t": len(series) + 1, "mag": snap_t["metrics"]["obstruction_index"]})

    if not series:
        series.append({"t": 1, "mag": snapshot["metrics"]["obstruction_index"]})

    snapshot["series"] = series
    snapshot["meta"] = {
        "ticker": sym,
        "horizon": horizon,
        "days": window,
        "n_observations": n_obs,
        "peers_used": labels,
        "live": True,
    }
    return snapshot
