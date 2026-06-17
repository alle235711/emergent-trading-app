"""
Backtest API routes with in-memory cache (1h TTL) and progress tracking.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import time
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from backtesting.engine import run_backtest

logger = logging.getLogger("quant.backtest.api")

router = APIRouter(prefix="/backtest", tags=["backtest"])

CACHE_TTL_SECONDS = 3600

_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_progress: dict[str, Any] = {
    "status": "idle",
    "progress": 0.0,
    "message": "",
    "job_key": None,
}


def _cache_key(ticker: str, model: str, start: str, end: str, horizon: int) -> str:
    raw = f"{ticker.upper()}|{model.lower()}|{start}|{end}|{horizon}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def _lookup_cache(key: str) -> dict[str, Any] | None:
    entry = _cache.get(key)
    if not entry:
        return None
    expires, payload = entry
    if time.time() > expires:
        _cache.pop(key, None)
        return None
    return payload


def _store_cache(key: str, payload: dict[str, Any]) -> None:
    _cache[key] = (time.time() + CACHE_TTL_SECONDS, payload)


def _set_progress(status: str, progress: float, message: str = "", job_key: str | None = None) -> None:
    _progress["status"] = status
    _progress["progress"] = round(max(0.0, min(1.0, progress)), 4)
    _progress["message"] = message
    if job_key is not None:
        _progress["job_key"] = job_key


@router.get("/progress")
async def backtest_progress():
    """Return current backtest job progress."""
    return {
        "status": _progress["status"],
        "progress": _progress["progress"],
        "message": _progress.get("message", ""),
    }


@router.get("")
async def get_backtest(
    ticker: str = Query("SPY"),
    model: str = Query("ensemble_sde", description="ensemble_sde | sheaf"),
    start: str = Query("2022-01-01"),
    end: str = Query("2024-12-31"),
    horizon: int = Query(5, ge=1, le=60),
):
    """
    Run walk-forward backtest (or return cached result if fresh).
    """
    model_norm = model.strip().lower()
    if model_norm not in ("ensemble_sde", "sheaf"):
        raise HTTPException(status_code=400, detail="model must be ensemble_sde or sheaf")

    key = _cache_key(ticker, model_norm, start, end, horizon)
    cached = _lookup_cache(key)
    if cached:
        return {"status": "ok", "cached": True, **cached}

    if _progress["status"] == "running":
        raise HTTPException(
            status_code=409,
            detail="A backtest is already running. Poll /api/backtest/progress.",
        )

    _set_progress("running", 0.0, "Starting backtest…", job_key=key)

    def on_progress(p: float, msg: str) -> None:
        _set_progress("running", p, msg, job_key=key)

    try:
        result = await asyncio.to_thread(
            run_backtest,
            ticker,
            model_norm,
            start,
            end,
            horizon,
            progress_callback=on_progress,
        )
        _store_cache(key, result)
        _set_progress("idle", 1.0, "Complete")
        return {"status": "ok", "cached": False, **result}
    except ValueError as exc:
        _set_progress("idle", 0.0, "")
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("[backtest] failed")
        _set_progress("idle", 0.0, "")
        raise HTTPException(status_code=500, detail=f"Backtest error: {exc}") from exc


@router.get("/summary")
async def get_backtest_summary(
    ticker: str = Query("SPY"),
    model: str = Query("ensemble_sde"),
    years: int = Query(2, ge=1, le=5),
    horizon: int = Query(5, ge=1, le=60),
):
    """
    Lightweight summary for model pages (last N years, cached).
    """
    from datetime import datetime, timedelta

    end_dt = datetime.utcnow().date()
    start_dt = end_dt - timedelta(days=int(years * 365.25))
    start = start_dt.strftime("%Y-%m-%d")
    end = end_dt.strftime("%Y-%m-%d")

    key = _cache_key(ticker, model, start, end, horizon)
    cached = _lookup_cache(key)
    if cached:
        return {
            "status": "ok",
            "cached": True,
            "win_rate": cached["win_rate"],
            "sharpe_ratio": cached["sharpe_ratio"],
            "hit_rate_range": cached["hit_rate_range"],
            "model_return": cached["model_return"],
            "benchmark_return": cached["benchmark_return"],
            "n_trades": cached["n_trades"],
            "cumulative_series": cached.get("cumulative_series", []),
            "updated_at": cached.get("updated_at"),
            "period": cached["period"],
        }

    if _progress["status"] == "running":
        return {"status": "running", "progress": _progress["progress"]}

    _set_progress("running", 0.0, "Summary backtest…", job_key=key)

    def on_progress(p: float, msg: str) -> None:
        _set_progress("running", p, msg, job_key=key)

    try:
        result = await asyncio.to_thread(
            run_backtest,
            ticker,
            model.strip().lower(),
            start,
            end,
            horizon,
            progress_callback=on_progress,
        )
        _store_cache(key, result)
        _set_progress("idle", 1.0, "Complete")
        return {
            "status": "ok",
            "cached": False,
            "win_rate": result["win_rate"],
            "sharpe_ratio": result["sharpe_ratio"],
            "hit_rate_range": result["hit_rate_range"],
            "model_return": result["model_return"],
            "benchmark_return": result["benchmark_return"],
            "n_trades": result["n_trades"],
            "cumulative_series": result.get("cumulative_series", []),
            "updated_at": result.get("updated_at"),
            "period": result["period"],
        }
    except Exception as exc:
        _set_progress("idle", 0.0, "")
        logger.warning("[backtest/summary] %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
