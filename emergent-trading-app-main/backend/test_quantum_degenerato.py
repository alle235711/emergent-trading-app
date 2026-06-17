#!/usr/bin/env python3
"""
test_quantum_degenerato.py
────────────────────────────────────────────────────────────────────────────
Stress test isolato per Quantum Graph Spectrum (Marchenko–Pastur).

Genera rendimenti sintetici (N=30 asset, T=252 giorni, q=30/252) e invoca
la pipeline spettrale del modello senza fetch di mercato né FastAPI.

Scenari:
  1. Rumore bianco puro     → n_signal == 0, tutti λ ≤ λ_max
  2. Singolo fattore sistemico → n_signal ≥ 1, λ₁ ≫ λ_max, spectral_gap ampio

Uso:
    cd backend && python test_quantum_degenerato.py
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Dict, List

import numpy as np

BACKEND = Path(__file__).resolve().parent
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from models.quantum_graph_spectrum import _interpretation, _mp_curve, _round

N_ASSETS = 30
T_DAYS = 252
Q = N_ASSETS / T_DAYS
SEED_WHITE = 42
SEED_FACTOR = 7
FACTOR_NOISE = 0.10
LAM_TOL = 1e-6
MIN_SPECTRAL_GAP = 1.0


def analyze_returns(x: np.ndarray) -> Dict:
    """
    Pipeline spettrale identica a run_quantum_graph_spectrum (post-fetch).
    x: (T, N) matrice dei rendimenti.
    """
    t_obs, n = x.shape
    corr = np.corrcoef(x.T)
    if not np.all(np.isfinite(corr)):
        corr = np.nan_to_num(corr, nan=0.0)

    evals = np.linalg.eigvalsh(corr)
    evals = np.sort(evals)[::-1]
    evals_list = [_round(float(v), 4) for v in evals]

    q = n / t_obs
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
        "n_assets": n,
        "T": t_obs,
        "q": _round(q, 4),
        "lambda_min": _round(lam_min),
        "lambda_max": _round(lam_max),
        "eigenvalues": evals_list,
        "evals_raw": evals,
        "n_signal": n_signal,
        "n_noise": n_noise,
        "spectral_gap": spectral_gap,
        "bulk_variance": _round(sigma2),
        "interpretation": _interpretation(n_signal, q, spectral_gap),
        "mp_curve": _mp_curve(q, sigma2),
    }


def white_noise_returns(
    n: int = N_ASSETS,
    t: int = T_DAYS,
    seed: int = SEED_WHITE,
) -> np.ndarray:
    """Rendimenti i.i.d. N(0,1) — nessun fattore comune."""
    rng = np.random.default_rng(seed)
    return rng.standard_normal((t, n))


def single_factor_returns(
    n: int = N_ASSETS,
    t: int = T_DAYS,
    noise: float = FACTOR_NOISE,
    seed: int = SEED_FACTOR,
) -> np.ndarray:
    """Tutti gli asset seguono un indice comune + rumore gaussiano piccolo."""
    rng = np.random.default_rng(seed)
    market = rng.standard_normal(t)
    idio = rng.standard_normal((t, n))
    return np.outer(market, np.ones(n)) + noise * idio


def _mean_offdiag(corr: np.ndarray) -> float:
    n = corr.shape[0]
    mask = ~np.eye(n, dtype=bool)
    return float(np.mean(corr[mask]))


def run_scenario(
    title: str,
    returns: np.ndarray,
    *,
    expect_signal: int | None,
    expect_gap_min: float = 0.0,
    require_all_below_mp: bool = False,
    require_lambda1_above_mp: bool = False,
) -> bool:
    print(f"\n{'─' * 72}")
    print(f"  SCENARIO: {title}")
    print(f"  Forma rendimenti: T×N = {returns.shape[0]}×{returns.shape[1]}  "
          f"(q = {returns.shape[1]/returns.shape[0]:.4f})")
    print(f"{'─' * 72}")

    corr = np.corrcoef(returns.T)
    print(f"  Correlazione empirica: media off-diag = {_mean_offdiag(corr):.4f}")

    result = analyze_returns(returns)
    evals = result["evals_raw"]
    lam_max = float(result["lambda_max"])
    lam_min = float(result["lambda_min"])

    print(f"\n  Parametri MP:")
    print(f"    q            = {result['q']}")
    print(f"    bulk σ²      = {result['bulk_variance']}")
    print(f"    λ_min (MP)   = {lam_min:.4f}")
    print(f"    λ_max (MP)   = {lam_max:.4f}")

    print(f"\n  Top 5 autovalori (decrescenti):")
    for i, ev in enumerate(result["eigenvalues"][:5], start=1):
        flag = "  ← SIGNAL" if ev > lam_max else ""
        print(f"    λ_{i} = {ev:.4f}{flag}")

    print(f"\n  Esito spettrale:")
    print(f"    n_signal     = {result['n_signal']}")
    print(f"    n_noise      = {result['n_noise']}")
    print(f"    spectral_gap = {result['spectral_gap']}")
    print(f"    interpretazione = {result['interpretation']}")

    checks: Dict[str, bool] = {}

    if expect_signal is not None:
        checks[f"n_signal == {expect_signal}"] = result["n_signal"] == expect_signal

    if require_all_below_mp:
        checks["tutti λ ≤ λ_max"] = bool(np.all(evals <= lam_max + LAM_TOL))

    if require_lambda1_above_mp:
        checks["λ₁ > λ_max"] = float(evals[0]) > lam_max + LAM_TOL

    if expect_gap_min > 0:
        checks[f"spectral_gap ≥ {expect_gap_min}"] = result["spectral_gap"] >= expect_gap_min

    print("\n  Verifiche:")
    for name, ok in checks.items():
        print(f"    {'✓' if ok else '✗'} {name}")

    ok = all(checks.values()) if checks else False
    print(f"  ESITO: {'PASS ✓' if ok else 'FAIL ✗'}")
    return ok


def main() -> int:
    print("=" * 72)
    print("  STRESS TEST — Quantum Graph Spectrum · Marchenko–Pastur")
    print(f"  (N={N_ASSETS}, T={T_DAYS}, q={Q:.4f} — nessun mercato, nessun FastAPI)")
    print("=" * 72)

    ret_white = white_noise_returns()
    ok_white = run_scenario(
        "Puro Rumore Bianco (nessun segnale)",
        ret_white,
        expect_signal=0,
        require_all_below_mp=True,
    )

    ret_factor = single_factor_returns()
    ok_factor = run_scenario(
        f"Singolo Fattore Sistemico (rumore idiosincratico σ={FACTOR_NOISE})",
        ret_factor,
        expect_signal=1,
        require_lambda1_above_mp=True,
        expect_gap_min=MIN_SPECTRAL_GAP,
    )

    print("\n" + "=" * 72)
    results = {
        "rumore bianco (n_signal=0)": ok_white,
        "fattore sistemico (n_signal=1, gap ampio)": ok_factor,
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
