#!/usr/bin/env python3
"""
test_affine_degenerato.py
────────────────────────────────────────────────────────────────────────────
Stress test isolato per Affine Scheme Microstructure.

Genera OHLCV sintetico che, passando per _to_weierstrass_coords (scaling λ
unificato), produce una cuspide con Δ ≈ 0.

Nessuna rete, nessun FastAPI, nessun patch su _normalize.

Uso:
    cd backend && python test_affine_degenerato.py
"""

from __future__ import annotations

import math
import sys
from pathlib import Path
from typing import Tuple

import numpy as np
import pandas as pd

BACKEND = Path(__file__).resolve().parent
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from models import affine_scheme
from models.affine_scheme import (
    _count_singular_windows,
    _fit_weierstrass,
    _singularity_type,
    _to_weierstrass_coords,
    run_affine_scheme,
)

A_CUSP = -1.0
B_CUSP = 2.0 / math.sqrt(27.0)
DISC_TARGET = -4.0 * A_CUSP ** 3 - 27.0 * B_CUSP ** 2
N_POINTS = 120
P_REF = 100.0
V_REF = 1_000_000.0
LAM = 1.0


def weierstrass_rhs(x: np.ndarray) -> np.ndarray:
    return x ** 3 + A_CUSP * x ** 2 + B_CUSP * x


def cusp_xy(n: int = N_POINTS) -> Tuple[np.ndarray, np.ndarray]:
    x = np.linspace(0.0, 0.98, n, dtype=np.float64)
    y = np.sqrt(np.maximum(weierstrass_rhs(x), 0.0))
    return x, y


def xy_to_ohlcv(x: np.ndarray, y: np.ndarray) -> pd.DataFrame:
    """Close = P_ref·(1+x); Volume = V_ref·y² (path-relative anchor al bar 0)."""
    close = P_REF * (1.0 + x)
    volume = np.maximum(V_REF * (y ** 2), 0.0)
    volume[0] = V_REF
    idx = pd.date_range("2024-01-01", periods=len(x), freq="B")
    spread = np.maximum(close * 0.001, 0.01)
    return pd.DataFrame(
        {
            "Open": close - spread * 0.3,
            "High": close + spread,
            "Low": close - spread,
            "Close": close,
            "Volume": volume,
        },
        index=idx,
    )


def _patch_fetch(ohlcv: pd.DataFrame):
    def _fake_fetch(ticker: str, lookback_days: int = 120, buffer_days: int = 30):
        del ticker, lookback_days, buffer_days
        return ohlcv.copy(), len(ohlcv)

    affine_scheme.fetch_ohlcv = _fake_fetch


def main() -> int:
    print("=" * 72)
    print("  STRESS TEST — Affine Scheme · cuspide via _to_weierstrass_coords")
    print("=" * 72)

    print(f"\n[1] Δ_target = {DISC_TARGET:.6e}  (a={A_CUSP}, b={B_CUSP:.6f})")

    x_star, y_star = cusp_xy()
    ohlcv = xy_to_ohlcv(x_star, y_star)

    x, y, lam = _to_weierstrass_coords(ohlcv["Close"], ohlcv["Volume"])
    a, b, disc = _fit_weierstrass(x, y)
    print(f"\n[2] Coordinate da OHLCV sintetico (λ={lam:.4f}, n={len(x)}):")
    print(f"    Δ_fit = {disc:.6e}  tipo={_singularity_type(disc)}")

    _patch_fetch(ohlcv)
    try:
        result = run_affine_scheme(ticker="CUSP_TEST", days=120, horizon="medium")
    except Exception as exc:
        print(f"\n[FAIL] {type(exc).__name__}: {exc}")
        return 1

    print(f"\n[3] run_affine_scheme:")
    print(f"    singularity_type   = {result['singularity_type']}")
    print(f"    smoothness_score   = {result['smoothness_score']}")
    print(f"    discriminant       = {result['discriminant']}")
    print(f"    coord_scale_lambda = {result.get('coord_scale_lambda')}")
    print(f"    n_singular_windows = {result['n_singular_windows']}")

    n_windows = max(1, (len(ohlcv) - 20) // 10 + 1)
    checks = {
        "finite": math.isfinite(result["smoothness_score"]),
        "cusp": result["singularity_type"] == "cusp",
        "disc": abs(result["discriminant"]) <= 0.05,
        "smooth_low": result["smoothness_score"] <= 0.1,
        "windows": result["n_singular_windows"] >= n_windows // 2,
    }

    print("\n" + "-" * 72)
    for k, ok in checks.items():
        print(f"  {'✓' if ok else '✗'} {k}")
    print("-" * 72)

    if all(checks.values()):
        print("  RISULTATO: PASS")
        return 0
    print("  RISULTATO: FAIL")
    return 1


if __name__ == "__main__":
    sys.exit(main())
