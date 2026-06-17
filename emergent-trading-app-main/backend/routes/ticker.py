"""Ticker validation and search routes."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query

from services.ticker_lookup import search_tickers, validate_ticker

logger = logging.getLogger("quant.api")

router = APIRouter(prefix="/ticker", tags=["ticker"])


@router.get("/validate")
async def endpoint_validate_ticker(ticker: str = Query(..., min_length=1)):
    """Validate a Yahoo Finance symbol and return metadata."""
    logger.info("[ticker-validate] ticker=%s", ticker)
    result = validate_ticker(ticker)
    if not result.get("valid"):
        return result
    return result


@router.get("/search")
async def endpoint_search_tickers(q: str = Query(..., min_length=1)):
    """Search Yahoo Finance for matching symbols (top 8)."""
    logger.info("[ticker-search] q=%s", q)
    return search_tickers(q, limit=8)
