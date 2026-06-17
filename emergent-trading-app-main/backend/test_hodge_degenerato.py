#!/usr/bin/env python3
"""
test_hodge_degenerato.py
────────────────────────────────────────────────────────────────────────────
Stress test isolato per Discrete Hodge Decomposition.

Costruisce matrici di incidenza B e vettori di flusso x sintetici su un
grafo a 4 nodi (anello + corda centrale) e invoca _hodge_decompose /
_energy_shares senza rete né FastAPI.

Scenari:
  1. Flusso gradiente puro  → gradient_pct = 1.0, solenoidal_pct = 0.0
  2. Flusso solenoidale puro → solenoidal_pct = 1.0, gradient_pct = 0.0

Uso:
    cd backend && python test_hodge_degenerato.py
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np

BACKEND = Path(__file__).resolve().parent
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from models.hodge_decomposition import (
    _energy_shares,
    _hodge_decompose,
    _incidence_matrix,
    _interpretation,
    _round,
)

N_NODES = 4
NODE_LABELS = ["N0", "N1", "N2", "N3"]
# Anello 0→1→2→3→0 più corda diagonale 0—2.
EDGES: List[Tuple[int, int]] = [(0, 1), (1, 2), (2, 3), (3, 0), (0, 2)]
EDGE_LABELS = ["0→1", "1→2", "2→3", "3→0", "0→2 (corda)"]
POTENTIAL_GRADIENT = np.array([10.0, 5.0, 2.0, 0.0])
RING_FLUX = 1.0
TOL = 1e-9


def _flow_from_potential(phi: np.ndarray, edges: List[Tuple[int, int]]) -> np.ndarray:
    """Flusso orientato x_ij = φ_i − φ_j."""
    return np.array([phi[i] - phi[j] for i, j in edges], dtype=np.float64)


def _pure_solenoidal_flow(
    edges: List[Tuple[int, int]],
    ring_value: float = RING_FLUX,
) -> np.ndarray:
    """k costante sul perimetro; corda (0,2) azzerata."""
    flow = np.zeros(len(edges), dtype=np.float64)
    for k, (i, j) in enumerate(edges):
        if (i, j) == (0, 2):
            continue
        flow[k] = ring_value
    return flow


def decompose_synthetic(
    flow: np.ndarray,
    edges: List[Tuple[int, int]],
    labels: List[str],
) -> Dict:
    """Pipeline identica a run_hodge_decomposition dopo costruzione di B e x."""
    n = len(labels)
    b_inc = _incidence_matrix(n, edges)
    x_grad, x_curl, x_harm, phi = _hodge_decompose(flow, b_inc)
    g_pct, s_pct, h_pct = _energy_shares(flow, x_grad, x_curl, x_harm)

    return {
        "b_inc": b_inc,
        "gradient_pct": _round(g_pct, 6),
        "solenoidal_pct": _round(s_pct, 6),
        "harmonic_pct": _round(h_pct, 6),
        "node_potentials": {labels[i]: _round(float(phi[i]), 4) for i in range(n)},
        "edge_flows": [
            {
                "edge": EDGE_LABELS[k],
                "i": i,
                "j": j,
                "x": _round(float(flow[k]), 4),
                "gradient": _round(float(x_grad[k]), 4),
                "solenoidal": _round(float(x_curl[k]), 4),
                "harmonic": _round(float(x_harm[k]), 4),
            }
            for k, (i, j) in enumerate(edges)
        ],
        "divergence_bx": (b_inc @ flow).tolist(),
        "interpretation": _interpretation(g_pct, s_pct, h_pct),
        "x_grad": x_grad,
        "x_curl": x_curl,
        "x_harm": x_harm,
    }


def _print_incidence(b_inc: np.ndarray, labels: List[str]) -> None:
    print("\n  Matrice di incidenza B (righe=nodi, colonne=archi):")
    hdr = "         " + "  ".join(f"{e:>10}" for e in EDGE_LABELS)
    print(f"    {hdr}")
    for i, row in enumerate(b_inc):
        cells = "  ".join(f"{v:>10.0f}" for v in row)
        print(f"    {labels[i]:>6} {cells}")


def run_scenario(
    title: str,
    flow: np.ndarray,
    *,
    expect_gradient: float,
    expect_solenoidal: float,
) -> bool:
    print(f"\n{'─' * 72}")
    print(f"  SCENARIO: {title}")
    print(f"  Grafo: {N_NODES} nodi, {len(EDGES)} archi (anello + corda 0—2)")
    print(f"{'─' * 72}")

    result = decompose_synthetic(flow, EDGES, NODE_LABELS)
    _print_incidence(result["b_inc"], NODE_LABELS)

    print("\n  Flusso x sugli archi:")
    for ef in result["edge_flows"]:
        print(f"    {ef['edge']}: x = {ef['x']:+.4f}")

    print(f"\n  Divergenza nodale Bx: {result['divergence_bx']}")

    print("\n  Scomposizione di Hodge per arco (x = grad + sol + harm):")
    for ef in result["edge_flows"]:
        print(
            f"    {ef['edge']}: grad={ef['gradient']:+.4f}  "
            f"sol={ef['solenoidal']:+.4f}  harm={ef['harmonic']:+.4f}"
        )

    g = result["gradient_pct"]
    s = result["solenoidal_pct"]
    h = result["harmonic_pct"]
    print(f"\n  Potenziali nodali φ (ricostruiti): {result['node_potentials']}")
    print(f"\n  Quote energetiche:")
    print(f"    gradient_pct   = {g:.6f}  ({100*g:.2f}%)")
    print(f"    solenoidal_pct = {s:.6f}  ({100*s:.2f}%)")
    print(f"    harmonic_pct   = {h:.6f}  ({100*h:.2f}%)")
    print(f"    interpretazione  = {result['interpretation']}")

    ok_g = abs(g - expect_gradient) <= TOL
    ok_s = abs(s - expect_solenoidal) <= TOL
    ok = ok_g and ok_s

    print(f"\n  Atteso: gradient_pct={expect_gradient}, solenoidal_pct={expect_solenoidal}")
    print(f"  ESITO: {'PASS ✓' if ok else 'FAIL ✗'}")
    if not ok_g:
        print(f"    ✗ gradient_pct fuori tolleranza (|Δ|={abs(g - expect_gradient):.2e})")
    if not ok_s:
        print(f"    ✗ solenoidal_pct fuori tolleranza (|Δ|={abs(s - expect_solenoidal):.2e})")
    return ok


def main() -> int:
    print("=" * 72)
    print("  STRESS TEST — Discrete Hodge Decomposition")
    print("  (nessun mercato, nessun FastAPI — B e x sintetici)")
    print("=" * 72)

    flow_grad = _flow_from_potential(POTENTIAL_GRADIENT, EDGES)
    ok_grad = run_scenario(
        f"Flusso Gradiente Puro (φ = {POTENTIAL_GRADIENT.tolist()})",
        flow_grad,
        expect_gradient=1.0,
        expect_solenoidal=0.0,
    )

    flow_sol = _pure_solenoidal_flow(EDGES, ring_value=RING_FLUX)
    ok_sol = run_scenario(
        f"Flusso Solenoidale Puro (anello k={RING_FLUX}, corda=0)",
        flow_sol,
        expect_gradient=0.0,
        expect_solenoidal=1.0,
    )

    print("\n" + "=" * 72)
    results = {
        "gradiente puro (100% trend)": ok_grad,
        "solenoidale puro (100% rotazione)": ok_sol,
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
