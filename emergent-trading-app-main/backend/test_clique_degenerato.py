#!/usr/bin/env python3
"""
test_clique_degenerato.py
────────────────────────────────────────────────────────────────────────────
Stress test topologico isolato per Clique Complex (Vietoris–Rips).

Inietta matrici di correlazione sintetiche in _distance_matrix e
_betti_curves senza fetch di mercato né FastAPI.

Scenari:
  1. Albero lineare (catena)  → max_beta1 == 0
  2. Anello chiuso (pentagono) → max_beta1 > 0

Distanza: d_ij = 1 − |ρ_ij|

Uso:
    cd backend && python test_clique_degenerato.py
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import List, Tuple

import numpy as np

BACKEND = Path(__file__).resolve().parent
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from models.tda_clique import _betti_curves, _distance_matrix

# Correlazione forte sugli archi del grafo; tutto il resto ≈ 0.
RHO_EDGE = 0.99
RHO_BACKGROUND = 0.0
STEPS = 50
EPS_TOL = 1e-12


def _symmetrize(corr: np.ndarray) -> np.ndarray:
    c = np.asarray(corr, dtype=np.float64)
    c = 0.5 * (c + c.T)
    np.fill_diagonal(c, 1.0)
    return np.clip(c, -1.0, 1.0)


def chain_correlation(n: int, labels: List[str] | None = None) -> Tuple[np.ndarray, List[str]]:
    """Catena A—B—C—… : solo archi consecutivi ad alta correlazione."""
    names = labels or [chr(ord("A") + i) for i in range(n)]
    corr = np.full((n, n), RHO_BACKGROUND, dtype=np.float64)
    np.fill_diagonal(corr, 1.0)
    for i in range(n - 1):
        corr[i, i + 1] = RHO_EDGE
        corr[i + 1, i] = RHO_EDGE
    return _symmetrize(corr), names


def ring_correlation(n: int, labels: List[str] | None = None) -> Tuple[np.ndarray, List[str]]:
    """Anello chiuso: ogni nodo correlato solo con i due vicini sul ciclo."""
    names = labels or [chr(ord("A") + i) for i in range(n)]
    corr = np.full((n, n), RHO_BACKGROUND, dtype=np.float64)
    np.fill_diagonal(corr, 1.0)
    for i in range(n):
        j = (i + 1) % n
        corr[i, j] = RHO_EDGE
        corr[j, i] = RHO_EDGE
    return _symmetrize(corr), names


def max_beta1_from_corr(corr: np.ndarray, steps: int = STEPS) -> Tuple[int, float, List[List[float]]]:
    """Pipeline produzione: correlazione → distanza → curve di Betti."""
    dist = _distance_matrix(corr)
    dist = np.clip(dist, 0.0, 1.0)
    dist = 0.5 * (dist + dist.T)
    np.fill_diagonal(dist, 0.0)

    _, beta1_series = _betti_curves(dist, steps=steps)

    max_b1 = 0
    eps_star = 0.0
    for eps, b1 in beta1_series:
        bi = int(round(b1))
        if bi > max_b1:
            max_b1 = bi
            eps_star = float(eps)
    return max_b1, eps_star, beta1_series


def _optional_ripser_beta1(dist: np.ndarray) -> int | None:
    """Confronto opzionale con ripser (non richiesto dal modello)."""
    try:
        import ripser
    except ImportError:
        return None

    try:
        d = np.clip(dist.astype(np.float64), 0.0, 1.0)
        result = ripser.ripser(d, maxdim=1, distance_matrix=True)
        lifetimes = result["dgms"][1]
        if len(lifetimes) == 0:
            return 0
        finite = lifetimes[np.isfinite(lifetimes[:, 1])]
        if len(finite) == 0:
            return 0
        return int(np.sum(finite[:, 1] - finite[:, 0] > EPS_TOL))
    except Exception:
        return None


def run_scenario(
    name: str,
    corr: np.ndarray,
    labels: List[str],
    expect_zero: bool,
) -> bool:
    print(f"\n{'─' * 72}")
    print(f"  SCENARIO: {name}")
    print(f"  Nodi: {', '.join(labels)}  (n={len(labels)})")
    print(f"{'─' * 72}")

    max_b1, eps_star, beta1_series = max_beta1_from_corr(corr)
    dist = _distance_matrix(corr)
    edge_d = 1.0 - abs(RHO_EDGE)
    print(f"  d_arco = 1−|ρ| = {edge_d:.4f}")
    print(f"  max_beta1 = {max_b1}   ε* = {eps_star:.4f}")

    peak = [(eps, b1) for eps, b1 in beta1_series if b1 > 0]
    if peak:
        print(f"  picchi β₁: {peak[:5]}{'…' if len(peak) > 5 else ''}")
    else:
        print("  picchi β₁: nessuno (β₁=0 su tutta la filtrazione)")

    ripser_b1 = _optional_ripser_beta1(dist)
    if ripser_b1 is not None:
        print(f"  ripser β₁ (opzionale): {ripser_b1}")

    if expect_zero:
        ok = max_b1 == 0
        criterion = "max_beta1 == 0 (topologia ad albero)"
    else:
        ok = max_b1 > 0
        criterion = "max_beta1 > 0 (ciclo 1-dimensionale persistente)"

    print(f"  Criterio: {criterion}")
    print(f"  ESITO: {'PASS ✓' if ok else 'FAIL ✗'}")
    return ok


def main() -> int:
    print("=" * 72)
    print("  STRESS TEST — Clique Complex · filtrazione Vietoris–Rips")
    print("  (nessun mercato, nessun FastAPI — correlazioni sintetiche)")
    print("=" * 72)

    # Scenario 1 — catena lineare (5 nodi)
    corr_tree, labels_tree = chain_correlation(5)
    ok_tree = run_scenario(
        "Topologia ad Albero (catena A→B→C→D→E)",
        corr_tree,
        labels_tree,
        expect_zero=True,
    )

    # Scenario 2 — pentagono chiuso (5 nodi)
    corr_ring, labels_ring = ring_correlation(5)
    ok_ring = run_scenario(
        "Topologia ad Anello (pentagono A—B—C—D—E—A)",
        corr_ring,
        labels_ring,
        expect_zero=False,
    )

    print("\n" + "=" * 72)
    results = {
        "albero (catena)": ok_tree,
        "anello (pentagono)": ok_ring,
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
