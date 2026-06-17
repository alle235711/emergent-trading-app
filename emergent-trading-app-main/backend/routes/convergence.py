"""Convergence dashboard API."""

from fastapi import APIRouter, Query

from models.convergence import compute_convergence
from alerts.alert_engine import check_auto_thresholds

router = APIRouter(prefix="/convergence", tags=["convergence"])


@router.get("")
async def get_convergence(
    ticker: str = Query("SPY"),
    days: int = Query(90, ge=5, le=365),
    horizon: str = Query("medium"),
):
    """
    Multi-model convergence synthesis. Descriptive only — no trading advice.
    """
    conv = await compute_convergence(ticker=ticker, days=days, horizon=horizon)
    await check_auto_thresholds(conv["ticker"], conv)
    # Strip internal fields from response
    response = {k: v for k, v in conv.items() if k not in ("model_snapshots", "auto_threshold_hits")}
    return response
