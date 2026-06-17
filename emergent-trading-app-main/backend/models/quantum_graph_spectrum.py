"""
quantum_graph_spectrum.py — Random Matrix Theory / Marchenko–Pastur spectral analysis.
"""

from __future__ import annotations

from typing import Any, Dict, List

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


def _mp_density(lam: float, q: float, sigma2: float) -> float:
    if q <= 0 or sigma2 <= 0 or lam <= 0:
        return 0.0
    lam_min = sigma2 * (1.0 - np.sqrt(q)) ** 2
    lam_max = sigma2 * (1.0 + np.sqrt(q)) ** 2
    if lam <= lam_min or lam >= lam_max:
        return 0.0
    return float(np.sqrt((lam_max - lam) * (lam - lam_min)) / (2.0 * np.pi * sigma2 * q * lam))


def _mp_curve(q: float, sigma2: float, n_points: int = 80) -> List[List[float]]:
    lam_min = sigma2 * (1.0 - np.sqrt(q)) ** 2
    lam_max = sigma2 * (1.0 + np.sqrt(q)) ** 2
    if lam_max <= lam_min:
        return []
    grid = np.linspace(lam_min * 1.001, lam_max * 0.999, n_points)
    return [[_round(float(l), 4), _round(_mp_density(float(l), q, sigma2), 5)] for l in grid]


def _interpretation(n_signal: int, q: float, spectral_gap: float) -> str:
    if n_signal >= 5 or spectral_gap > 2.0:
        return "concentrated"
    if n_signal <= 1 and spectral_gap < 0.5:
        return "noisy"
    return "structured"


def _degraded_quantum_response(
    sym: str,
    horizon: str,
    labels: List[str],
    universe_requested: List[str],
) -> Dict[str, Any]:
    base = degraded_flag(PRIMARY_ANCHOR_ERROR)
    return {
        **base,
        "ticker": sym,
        "assets": labels,
        "n_assets": len(labels),
        "T": 0,
        "q": 0.0,
        "lambda_min": 0.0,
        "lambda_max": 0.0,
        "eigenvalues": [],
        "n_signal": 0,
        "n_noise": 0,
        "spectral_gap": 0.0,
        "bulk_variance": 0.0,
        "interpretation": "noisy",
        "mp_curve": [],
        "horizon": horizon,
        "days_used": 0,
        "universe_requested": universe_requested,
    }


def run_quantum_graph_spectrum(
    ticker: str,
    days: int = 180,
    horizon: str = "medium",
    n_assets: int = 30,
) -> Dict[str, Any]:
    sym = (ticker or "SPY").strip().upper()
    n_assets = max(20, min(64, int(n_assets)))
    days = max(120, min(320, int(days)))

    universe, _peer_err = resolve_peers_safe(sym, large=True, n_assets=n_assets)
    try:
        closes, labels, days_used = fetch_aligned_closes(
            universe, lookback_days=days, buffer_days=60, min_rows=60,
        )
    except ValueError:
        return _degraded_quantum_response(sym, horizon, [], universe)

    if not anchor_in_labels(sym, labels):
        return _degraded_quantum_response(sym, horizon, labels, universe)
    rets = log_returns(closes[labels])
    t_obs, n = rets.shape
    if t_obs < 60 or n < 5:
        raise ValueError("Insufficient data for spectral analysis.")

    x = rets.to_numpy(dtype=np.float64)
    corr = np.corrcoef(x.T)
    if not np.all(np.isfinite(corr)):
        corr = np.nan_to_num(corr, nan=0.0)

    evals = np.linalg.eigvalsh(corr)
    evals = np.sort(evals)[::-1]
    evals_list = [_round(float(v), 4) for v in evals]

    q = n / t_obs
    # Bulk variance σ²: mean eigenvalue of the noise bulk (exclude top decile).
    skip = max(1, int(round(n * 0.08)))
    bulk_evals = evals[skip:]
    sigma2 = float(np.mean(bulk_evals)) if len(bulk_evals) else 1.0
    sigma2 = max(sigma2, 0.05)

    lam_min = sigma2 * (1.0 - np.sqrt(q)) ** 2
    lam_max = sigma2 * (1.0 + np.sqrt(q)) ** 2

    n_signal = int(np.sum(evals > lam_max))
    n_noise = int(np.sum((evals >= lam_min) & (evals <= lam_max)))
    signal_evals = [e for e in evals if e > lam_max]
    spectral_gap = _round(float(signal_evals[0] - lam_max), 4) if signal_evals else 0.0

    return {
        "ticker": sym,
        "assets": labels,
        "n_assets": n,
        "T": t_obs,
        "q": _round(q, 4),
        "lambda_min": _round(lam_min),
        "lambda_max": _round(lam_max),
        "eigenvalues": evals_list,
        "n_signal": n_signal,
        "n_noise": n_noise,
        "spectral_gap": spectral_gap,
        "bulk_variance": _round(sigma2),
        "interpretation": _interpretation(n_signal, q, spectral_gap),
        "mp_curve": _mp_curve(q, sigma2),
        "horizon": horizon,
        "days_used": days_used,
        "warnings": [],
    }
