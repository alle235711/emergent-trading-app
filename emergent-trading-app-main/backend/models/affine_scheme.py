"""
affine_scheme.py — Affine Scheme Microstructure (Weierstrass cubic on price–volume).

Curve model:  y² = x³ + a·x² + b·x
Discriminant: Δ = -4a³ - 27b²  (cusp when |Δ| ≈ 0)

Pre-processing uses path-relative anchors and a single isotropic scale λ
so that independent min-max on price and volume does not destroy the geometry.
"""

from __future__ import annotations

from typing import Any, Dict, List, Tuple, Union

import numpy as np
import pandas as pd

from utils.geometry_guard import PRIMARY_ANCHOR_ERROR, degraded_flag
from utils.market_fetch import fetch_ohlcv


def _round(x: float, n: int = 4) -> float:
    return round(float(x), n)


def _to_weierstrass_coords(
    close: Union[pd.Series, np.ndarray],
    volume: Union[pd.Series, np.ndarray],
) -> Tuple[np.ndarray, np.ndarray, float]:
    """
    Map raw Close / Volume to Weierstrass (x, y) preserving curve geometry.

    1. Path-relative raw coordinates (linked — no independent min-max):
         x_raw = P / P_ref − 1
         y_raw = √(V / V_ref)          with y² ∝ volume

       P_ref = Close[0], V_ref = Volume[0]  (path anchor; fallback first positive volume).

    2. Unified scale λ from joint spread (single number for both axes):
         λ = max(p90(|x_raw|), p90(y_raw), ε)

    3. Isotropic conditioning (same λ on x and y — preserves x:y proportion):
         x = x_raw / λ
         y = y_raw / λ

    λ = 1 for typical O(1) microstructure so Δ is unchanged on real feeds.
    For large-amplitude series (|x_raw| or y_raw ≫ 10) λ > 1 stabilises LSQ
    without independent min-max on price and volume.
    """
    p = np.asarray(close, dtype=np.float64).ravel()
    v = np.asarray(volume, dtype=np.float64).ravel()
    n = min(len(p), len(v))
    if n == 0:
        return np.array([]), np.array([]), 1.0

    p, v = p[:n], v[:n]
    p_pos = p[p > 0]
    v_pos = v[v > 0]

    # Path anchor: first bar pairs price and volume (no independent min-max).
    p_ref = float(p[0]) if p[0] > 0 else (float(p_pos[0]) if len(p_pos) else 1.0)
    if v[0] > 0:
        v_ref = float(v[0])
    elif len(v_pos):
        v_ref = float(v_pos[0])
    else:
        v_ref = 1.0
    p_ref = max(p_ref, 1e-12)
    v_ref = max(v_ref, 1e-12)

    x_raw = p / p_ref - 1.0
    y_raw = np.zeros_like(v, dtype=np.float64)
    pos = v > 0
    y_raw[pos] = np.sqrt(v[pos] / v_ref)

    # Unified λ — one scale derived from both coordinates jointly.
    lam = float(max(
        np.percentile(np.abs(x_raw), 90),
        np.percentile(y_raw, 90),
        1e-8,
    ))
    # Keep λ = 1 for typical O(1) microstructure; only condition huge ranges.
    if lam < 10.0:
        lam = 1.0

    x = x_raw / lam
    y = y_raw / lam

    mask = np.isfinite(x) & np.isfinite(y)
    return x[mask], y[mask], lam


def _dpdv_slope(close: pd.Series, volume: pd.Series, window: int = 5) -> np.ndarray:
    dp = close.diff()
    dv = volume.diff().replace(0, np.nan)
    ratio = (dp / dv).replace([np.inf, -np.inf], np.nan)
    rolled = ratio.rolling(window, min_periods=3).mean()
    return rolled.fillna(0.0).to_numpy(dtype=np.float64)


def _fit_weierstrass(x: np.ndarray, y: np.ndarray) -> Tuple[float, float, float]:
    """Fit y² ≈ x³ + a·x² + b·x via least squares."""
    mask = np.isfinite(x) & np.isfinite(y)
    x, y = x[mask], y[mask]
    if len(x) < 10:
        return 0.0, 0.0, 0.0

    target = y ** 2 - x ** 3
    design = np.column_stack([x ** 2, x])
    try:
        coef, _, _, _ = np.linalg.lstsq(design, target, rcond=None)
    except (np.linalg.LinAlgError, ValueError):
        return 0.0, 0.0, 0.0

    a, b = float(coef[0]), float(coef[1])
    if not (np.isfinite(a) and np.isfinite(b)):
        return 0.0, 0.0, 0.0

    disc = -4.0 * a ** 3 - 27.0 * b ** 2
    if not np.isfinite(disc):
        return a, b, 0.0
    return a, b, float(disc)


def _singularity_type(disc: float, tol: float = 0.05) -> str:
    if not np.isfinite(disc):
        return "smooth"
    if abs(disc) <= tol:
        return "cusp"
    if disc > 0:
        return "node"
    return "smooth"


def _count_singular_windows(
    close: np.ndarray,
    volume: np.ndarray,
    window: int = 20,
) -> int:
    n = len(close)
    if n < window:
        return 0
    count = 0
    for start in range(0, n - window + 1, max(1, window // 2)):
        sl = slice(start, start + window)
        x, y, _ = _to_weierstrass_coords(close[sl], volume[sl])
        if len(x) < 10:
            continue
        _, _, disc = _fit_weierstrass(x, y)
        st = _singularity_type(disc)
        if st in ("cusp", "node"):
            count += 1
    return count


def _degraded_affine_response(sym: str, horizon: str) -> Dict[str, Any]:
    base = degraded_flag(PRIMARY_ANCHOR_ERROR)
    return {
        **base,
        "ticker": sym,
        "days_used": 0,
        "horizon": horizon,
        "a": 0.0,
        "b": 0.0,
        "discriminant": 0.0,
        "singularity_type": "smooth",
        "n_singular_windows": 0,
        "smoothness_score": 0.0,
        "coord_scale_lambda": 1.0,
        "variety_points": [],
        "sensitivity_surface": [],
    }


def run_affine_scheme(
    ticker: str,
    days: int = 120,
    horizon: str = "medium",
) -> Dict[str, Any]:
    sym = (ticker or "SPY").strip().upper()
    days = max(60, min(252, int(days)))

    try:
        ohlcv, days_used = fetch_ohlcv(sym, lookback_days=days, buffer_days=30)
    except ValueError:
        return _degraded_affine_response(sym, horizon)
    close = ohlcv["Close"]
    volume = ohlcv["Volume"].replace(0, np.nan).ffill().bfill()

    x, y, lam = _to_weierstrass_coords(close, volume)
    z = _dpdv_slope(close, volume, window=5)

    a, b, discriminant = _fit_weierstrass(x, y)
    singularity = _singularity_type(discriminant)
    n_singular = _count_singular_windows(
        close.to_numpy(dtype=np.float64),
        volume.to_numpy(dtype=np.float64),
        window=20,
    )

    n_windows = max(1, (len(close) - 20) // 10 + 1)
    smoothness = _round(max(0.0, min(1.0, 1.0 - n_singular / n_windows)), 3)

    # Align z with x,y length (coords may drop non-finite tail)
    n_pts = min(len(x), len(y), len(z))
    variety_points = [
        [_round(float(xi), 4), _round(float(yi), 4), _round(float(zi), 4)]
        for xi, yi, zi in zip(x[:n_pts], y[:n_pts], z[:n_pts])
        if np.isfinite(xi) and np.isfinite(yi) and np.isfinite(zi)
    ]
    sensitivity_surface = [
        [_round(float(xi), 4), _round(float(yi), 4), _round(float(zi), 4)]
        for xi, yi, zi in zip(x[:n_pts], y[:n_pts], z[:n_pts])
        if np.isfinite(zi)
    ]

    warnings: List[str] = []
    if singularity == "cusp":
        warnings.append("Discriminant near zero — cusp singularity; elevated crash/inversion risk.")
    elif singularity == "node":
        warnings.append("Positive discriminant — nodal singularity detected.")

    return {
        "ticker": sym,
        "days_used": days_used,
        "horizon": horizon,
        "a": _round(a),
        "b": _round(b),
        "discriminant": _round(discriminant),
        "singularity_type": singularity,
        "n_singular_windows": n_singular,
        "smoothness_score": smoothness,
        "coord_scale_lambda": _round(lam, 6),
        "variety_points": variety_points,
        "sensitivity_surface": sensitivity_surface,
        "warnings": warnings,
    }
