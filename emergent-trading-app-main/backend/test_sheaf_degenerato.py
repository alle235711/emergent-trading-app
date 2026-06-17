#!/usr/bin/env python3
"""
test_sheaf_degenerato.py
────────────────────────────────────────────────────────────────────────────
Stress test isolato per Sheaf Cohomology (Čech H¹ / Obstruction Index).

Inietta rendimenti logaritmici pre-calcolati in _compute_cohomology senza
Yahoo, rete o FastAPI. Mostra correlazione/covarianza e parsing del nervo.

Scenari:
  1. Sezione globale perfetta  → friction nulle, obstruction_index == 0
  2. Ostruzione circolare       → olonomia alta sui cocicli, OI > 0.5

Uso:
    cd backend && python test_sheaf_degenerato.py
"""

from __future__ import annotations

import math
import sys
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd

BACKEND = Path(__file__).resolve().parent
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from models.sheaf_cohomology import _build_nerve_edges, _compute_cohomology

N_OBS = 40
WINDOW = 30
CONNECTIVITY = 0.5
OI_HIGH_THRESHOLD = 0.08
HOLONOMY_MIN = 0.05


def _window_slice(returns: pd.DataFrame, window: int) -> np.ndarray:
    sl = returns.iloc[-window:]
    return sl.to_numpy(dtype=np.float64)


def _precomputed_stats(returns: pd.DataFrame, window: int) -> Tuple[np.ndarray, np.ndarray]:
    """Correlazione e covarianza sulla finestra (come in _compute_cohomology)."""
    log_r = _window_slice(returns, window)
    cov = np.cov(log_r.T, ddof=1)
    corr = np.corrcoef(log_r.T)
    if not np.all(np.isfinite(corr)):
        corr = np.nan_to_num(corr, nan=0.0)
    if not np.all(np.isfinite(cov)):
        cov = np.nan_to_num(cov, nan=0.0)
    return corr, cov


def _edge_betas(returns: pd.DataFrame, window: int, edges: List[Dict]) -> List[Dict]:
    log_r = _window_slice(returns, window)
    out = []
    for e in edges:
        i, j = e["i"], e["j"]
        ri, rj = log_r[:, i], log_r[:, j]
        vi = float(np.var(ri, ddof=1))
        beta = float(np.cov(ri, rj, ddof=1)[0, 1] / vi) if vi > 1e-14 else 0.0
        out.append({"i": i, "j": j, "beta_ij": round(beta, 4)})
    return out


def perfect_global_returns(
    labels: List[str] | None = None,
    n_obs: int = N_OBS,
) -> Tuple[pd.DataFrame, List[str]]:
    """
    Tutti gli asset replicano lo stesso fattore di mercato → ρᵢⱼ = 1, βᵢⱼ = 1.
    """
    names = labels or ["MKT", "A", "B", "C"]
    t = np.linspace(-0.015, 0.015, n_obs, dtype=np.float64)
    market = 0.008 * np.sin(np.linspace(0, 4 * math.pi, n_obs)) + 0.001 * t
    return pd.DataFrame({name: market for name in names}), names


def circular_frustration_returns(
    labels: List[str] | None = None,
    n_obs: int = N_OBS,
) -> Tuple[pd.DataFrame, List[str]]:
    """
    Anello di 4 asset in quadratura di fase: correlazioni alternate ±1,
    residui β-hedged non si annullano lungo il ciclo → olonomia ≠ 0.
    """
    names = labels or ["A", "B", "C", "D"]
    m = len(names)
    theta = np.linspace(0, 4 * math.pi, n_obs, dtype=np.float64)
    amp = 0.01
    cols = {
        names[i]: amp * np.sin(theta + 2 * math.pi * i / m)
        for i in range(m)
    }
    return pd.DataFrame(cols), names


def run_scenario(
    title: str,
    returns: pd.DataFrame,
    labels: List[str],
    *,
    expect_zero: bool,
    window: int = WINDOW,
    connectivity: float = CONNECTIVITY,
) -> bool:
    print(f"\n{'─' * 72}")
    print(f"  SCENARIO: {title}")
    print(f"  Asset: {', '.join(labels)}  (m={len(labels)}, T={len(returns)}, window={window})")
    print(f"{'─' * 72}")

    corr, cov = _precomputed_stats(returns, window)
    print("\n  Matrice correlazione (finestra):")
    _print_matrix(corr, labels)
    print("\n  Matrice covarianza (finestra):")
    _print_matrix(cov, labels, decimals=6)

    edges_nerve = _build_nerve_edges(len(labels), corr, connectivity)
    print(f"\n  Nervo topologico ({len(edges_nerve)} overlap, connectivity={connectivity}):")
    for e in edges_nerve:
        i, j = e["i"], e["j"]
        print(f"    arco {labels[i]}—{labels[j]}  |ρ|={abs(corr[i, j]):.4f}")

    betas = _edge_betas(returns, window, edges_nerve)
    print("\n  βᵢⱼ sugli archi del nervo:")
    for b in betas:
        print(f"    {labels[b['i']]}→{labels[b['j']]}: β={b['beta_ij']}")

    snapshot = _compute_cohomology(
        returns, labels, window, connectivity=connectivity,
    )
    oi = snapshot["metrics"]["obstruction_index"]
    h1 = snapshot["metrics"]["h1_dim"]
    frictions = [e["_residual"] for e in snapshot["edges"]]
    holonomies = [c["holonomy"] for c in snapshot["cocycles"]]

    print("\n  Friction (residui β-hedged per arco):")
    for e in snapshot["edges"]:
        i, j = e["i"], e["j"]
        print(
            f"    {labels[i]}—{labels[j]}: friction={e['_residual']:+.3f}  "
            f"transition={e['transition']:+.3f}"
        )

    print(f"\n  Cocicli H¹ (dim={h1}):")
    if holonomies:
        for c in snapshot["cocycles"]:
            i, j = c["i"], c["j"]
            print(f"    arco {labels[i]}—{labels[j]}: olonomia={c['holonomy']:+.3f}")
    else:
        print("    (nessun cociclo non banale)")

    print(f"\n  obstruction_index (OI) = {oi}")
    print(f"  somma |olonomia| = {sum(abs(h) for h in holonomies):.3f}")

    if expect_zero:
        ok = oi == 0 and all(abs(f) < 1e-9 for f in frictions)
        criterion = "OI == 0 e friction nulle (sezione globale perfetta)"
    else:
        ok = oi > OI_HIGH_THRESHOLD and any(abs(h) > HOLONOMY_MIN for h in holonomies)
        criterion = (
            f"OI > {OI_HIGH_THRESHOLD} e |olonomia| > {HOLONOMY_MIN} "
            "(frustrazione circolare, scala giornaliera)"
        )

    print(f"  Criterio: {criterion}")
    print(f"  ESITO: {'PASS ✓' if ok else 'FAIL ✗'}")
    return ok


def _print_matrix(mat: np.ndarray, labels: List[str], decimals: int = 4) -> None:
    w = max(len(l) for l in labels) + 2
    hdr = " " * w + "".join(f"{l:>{w}}" for l in labels)
    print(f"    {hdr}")
    for i, row in enumerate(mat):
        cells = "".join(f"{v:>{w}.{decimals}f}" for v in row)
        print(f"    {labels[i]:>{w}}{cells}")


def main() -> int:
    print("=" * 72)
    print("  STRESS TEST — Sheaf Cohomology · Obstruction Index")
    print("  (nessun mercato, nessun FastAPI — rendimenti sintetici)")
    print("=" * 72)

    ret_ok, labels_ok = perfect_global_returns()
    ok_perfect = run_scenario(
        "Sezione Globale Perfetta (movimento all'unisono)",
        ret_ok,
        labels_ok,
        expect_zero=True,
    )

    ret_bad, labels_bad = circular_frustration_returns()
    ok_circular = run_scenario(
        "Ostruzione Massima (anello in quadratura di fase)",
        ret_bad,
        labels_bad,
        expect_zero=False,
    )

    print("\n" + "=" * 72)
    results = {
        "sezione globale (OI=0)": ok_perfect,
        "frustrazione circolare (OI>0.08)": ok_circular,
    }
    for label, ok in results.items():
        print(f"  {'✓' if ok else '✗'} {label}")
    print("=" * 72)

    if all(results.values()):
        print("  RISULTATO COMPLESSIVO: PASS")
        return 0
    print("  RISULTATO COMPLESSIVO: FAIL")
    return 1


if __name__ == "__main__":
    sys.exit(main())
