"""
convergence.py — Multi-model signal synthesis (descriptive only, no trading advice).
Runs all 5 geometry models in parallel and normalizes their primary metrics.
"""

from __future__ import annotations

import asyncio
import json
import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from statistics import pstdev
from typing import Any, Dict, List, Optional, Tuple

from models.sheaf_cohomology import run_sheaf_cohomology
from models.tda_clique import run_tda_clique
from models.affine_scheme import run_affine_scheme
from models.hodge_decomposition import run_hodge_decomposition
from models.quantum_graph_spectrum import run_quantum_graph_spectrum

logger = logging.getLogger("quant.convergence")

ROOT = Path(__file__).resolve().parent.parent
METRIC_CACHE_PATH = ROOT / "journal" / "metric_ranges.json"

_EXECUTOR = ThreadPoolExecutor(max_workers=5)


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, float(x)))


def _round(x: float, n: int = 3) -> float:
    return round(float(x), n)


# ── Label helpers ────────────────────────────────────────────────────────────

def _sheaf_label(raw: float) -> Tuple[str, str]:
    if raw < 0.3:
        return "LOW", "Residuo cross-asset contenuto"
    if raw > 0.6:
        return "HIGH", "Ostruzione informativa elevata"
    return "MID", "Residuo cross-asset moderato"


def _clique_label(raw: float) -> Tuple[str, str]:
    if raw < 0.33:
        return "TREE", "Struttura correlazione ad albero"
    if raw > 0.66:
        return "CYCLIC", "Cicli persistenti nella rete peer"
    return "MIXED", "Topologia correlazione intermedia"


def _affine_label(singularity: str, raw: float) -> Tuple[str, str]:
    if singularity == "cusp" or raw < 0.3:
        return "CUSP", "Singolarità di tipo cusp — regime instabile"
    if singularity == "node" or raw < 0.6:
        return "NODE", "Microstruttura multi-regime"
    return "SMOOTH", "Superficie prezzo-volume liscia"


def _hodge_label(interp: str, raw: float) -> Tuple[str, str]:
    if interp == "trend_dominant" or raw < 0.33:
        return "TREND", "Flusso dominante direzionale"
    if interp == "cyclic_dominant" or raw > 0.66:
        return "CYCLIC", "Componente rotazionale dominante"
    return "MIXED", "Mix gradiente / solenoidale / armonico"


def _quantum_label(raw: float, n_signal: int) -> Tuple[str, str]:
    if raw < 0.12:
        return "NOISY", "Spettro prevalentemente rumore RMT"
    if raw >= 0.25 or n_signal >= 5:
        return "STRUCTURED", f"{n_signal} fattori sistemici isolati"
    return "MIXED", "Segnale e rumore in equilibrio"


def _convergence_label(stddev: float) -> str:
    if stddev < 0.12:
        return "LOW"
    if stddev < 0.22:
        return "MEDIUM"
    return "HIGH"


# ── Metric cache for auto_threshold ──────────────────────────────────────────

def _load_metric_cache() -> Dict[str, Any]:
    if METRIC_CACHE_PATH.exists():
        try:
            return json.loads(METRIC_CACHE_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def _save_metric_cache(cache: Dict[str, Any]) -> None:
    METRIC_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    METRIC_CACHE_PATH.write_text(json.dumps(cache, indent=2), encoding="utf-8")


def _cache_key(ticker: str, model: str) -> str:
    return f"{ticker.upper()}:{model}"


def record_metric_reading(ticker: str, model: str, value: float) -> Optional[str]:
    """
    Append a reading and return 'low' | 'high' if value is in bottom/top 10%
    of the cached 90-day range (needs ≥10 readings), else None.
    """
    cache = _load_metric_cache()
    key = _cache_key(ticker, model)
    now = datetime.now(timezone.utc).isoformat()
    entries: List[Dict] = cache.get(key, [])
    entries.append({"t": now, "v": value})
    # Keep last 500 readings (~90 days at 4h intervals)
    entries = entries[-500:]
    cache[key] = entries
    _save_metric_cache(cache)

    if len(entries) < 10:
        return None

    values = [e["v"] for e in entries]
    values.sort()
    p10 = values[max(0, int(len(values) * 0.1) - 1)]
    p90 = values[min(len(values) - 1, int(len(values) * 0.9))]
    if value <= p10:
        return "low"
    if value >= p90:
        return "high"
    return None


# ── Model runners (sync, executed in thread pool) ──────────────────────────

def _run_sheaf(ticker: str, days: int, horizon: str) -> Dict[str, Any]:
    return run_sheaf_cohomology(ticker=ticker, days=days, horizon=horizon)


def _run_clique(ticker: str, days: int, horizon: str) -> Dict[str, Any]:
    return run_tda_clique(ticker=ticker, days=days, horizon=horizon)


def _run_affine(ticker: str, days: int, horizon: str) -> Dict[str, Any]:
    return run_affine_scheme(ticker=ticker, days=max(days, 60), horizon=horizon)


def _run_hodge(ticker: str, days: int, horizon: str) -> Dict[str, Any]:
    return run_hodge_decomposition(ticker=ticker, days=min(max(days, 30), 90), horizon=horizon)


def _run_quantum(ticker: str, days: int, horizon: str) -> Dict[str, Any]:
    return run_quantum_graph_spectrum(
        ticker=ticker, days=max(days, 120), horizon=horizon,
    )


def _extract_signal(model: str, result: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize primary metric → {raw, label, description}."""
    if result.get("degraded") or result.get("error"):
        msg = str(result.get("error") or "Dati insufficienti")
        return {"raw": 0.0, "label": "N/A", "description": msg}

    if model == "sheaf":
        raw = _clamp01(result.get("metrics", {}).get("obstruction_index", 0))
        label, desc = _sheaf_label(raw)
    elif model == "clique":
        max_b1 = float(result.get("max_beta1", 0))
        n_peers = max(1, int(result.get("n_peers", 10)))
        raw = _clamp01(max_b1 / (n_peers / 2))
        label, desc = _clique_label(raw)
    elif model == "affine":
        raw = _clamp01(result.get("smoothness_score", 0))
        label, desc = _affine_label(result.get("singularity_type", "smooth"), raw)
    elif model == "hodge":
        raw = _clamp01(result.get("solenoidal_pct", 0))
        label, desc = _hodge_label(result.get("interpretation", ""), raw)
    elif model == "quantum":
        n_signal = int(result.get("n_signal", 0))
        n_assets = max(1, int(result.get("n_assets", 30)))
        raw = _clamp01(n_signal / n_assets)
        label, desc = _quantum_label(raw, n_signal)
    else:
        raw, label, desc = 0.0, "N/A", "Modello sconosciuto"

    return {"raw": _round(raw), "label": label, "description": desc}


async def _run_model_async(fn, ticker: str, days: int, horizon: str) -> Tuple[str, Optional[Dict], Optional[str]]:
    loop = asyncio.get_event_loop()
    name = fn.__name__.replace("_run_", "")
    try:
        result = await loop.run_in_executor(_EXECUTOR, fn, ticker, days, horizon)
        return name, result, None
    except Exception as exc:
        logger.warning("[convergence] %s failed: %s", name, exc)
        return name, None, str(exc)


async def compute_convergence(
    ticker: str,
    days: int = 90,
    horizon: str = "medium",
) -> Dict[str, Any]:
    """
    Run all 5 models in parallel and return the convergence synthesis payload.
    Purely descriptive — NOT a buy/sell signal.
    """
    sym = (ticker or "SPY").strip().upper()
    days = max(5, min(365, int(days)))

    runners = [_run_sheaf, _run_clique, _run_affine, _run_hodge, _run_quantum]
    results = await asyncio.gather(
        *[_run_model_async(fn, sym, days, horizon) for fn in runners]
    )

    signals: Dict[str, Any] = {}
    model_snapshots: Dict[str, Any] = {}
    warnings: List[str] = []
    models_failed = 0
    normalized_scores: List[float] = []
    auto_threshold_hits: List[str] = []

    for name, result, err in results:
        if result is None:
            models_failed += 1
            signals[name] = {"raw": None, "label": "ERROR", "description": err or "Computation failed"}
            warnings.append(f"{name}: {err}")
            continue

        sig = _extract_signal(name, result)
        signals[name] = sig
        model_snapshots[name] = result
        normalized_scores.append(sig["raw"])

        for w in result.get("warnings") or []:
            warnings.append(f"{name}: {w}")

        extreme = record_metric_reading(sym, name, sig["raw"])
        if extreme:
            auto_threshold_hits.append(f"{name}:{extreme}")

    models_available = 5 - models_failed
    convergence_score = _round(pstdev(normalized_scores)) if len(normalized_scores) >= 2 else 0.0

    payload = {
        "ticker": sym,
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S"),
        "horizon": horizon,
        "days": days,
        "signals": signals,
        "convergence_score": convergence_score,
        "convergence_label": _convergence_label(convergence_score),
        "models_available": models_available,
        "models_failed": models_failed,
        "warnings": warnings,
        "model_snapshots": model_snapshots,
        "auto_threshold_hits": auto_threshold_hits,
    }
    return payload


def get_model_metric(model: str, snapshot: Dict[str, Any]) -> Optional[float]:
    """Extract the primary metric value from a model snapshot for alert checks."""
    if not snapshot:
        return None
    if model == "sheaf":
        return snapshot.get("metrics", {}).get("obstruction_index")
    if model == "clique":
        max_b1 = float(snapshot.get("max_beta1", 0))
        n_peers = max(1, int(snapshot.get("n_peers", 10)))
        return _clamp01(max_b1 / (n_peers / 2))
    if model == "affine":
        return snapshot.get("smoothness_score")
    if model == "hodge":
        return snapshot.get("solenoidal_pct")
    if model == "quantum":
        n_signal = int(snapshot.get("n_signal", 0))
        n_assets = max(1, int(snapshot.get("n_assets", 30)))
        return _clamp01(n_signal / n_assets)
    return None
