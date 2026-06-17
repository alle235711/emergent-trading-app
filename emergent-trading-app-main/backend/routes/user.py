"""
User-scoped routes
------------------
These endpoints back the (frontend-mocked) user experience:

  • Personal watchlist (CRUD)
  • Broker integration credentials (UI only — never used to place real orders here)

Auth is mocked on the frontend: each client generates / persists a `user_id`
in localStorage and forwards it with every request as either a query param
or JSON body field. The backend simply scopes documents to that id.

Storage layer: MongoDB (motor) — collections:
  • watchlists      { user_id, tickers: [str], updated_at }
  • broker_keys     { user_id, broker, api_key, api_secret, updated_at }

Notes:
  - Broker secrets are stored as-is here because this is a UI-only mock.
  - When the real trading integration lands, swap to encrypted-at-rest
    storage (e.g. KMS-wrapped, or libsodium secretbox) before going prod.
"""
from __future__ import annotations

import logging
import os
import re
from datetime import datetime, timezone
from typing import List, Literal, Optional

from fastapi import APIRouter, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, field_validator

logger = logging.getLogger("quant.api.user")

# ---------------------------------------------------------------------------
# Mongo bootstrap (lazy — inizializzato solo alla prima richiesta)
# ---------------------------------------------------------------------------
_MONGO_URL = os.environ.get("MONGO_URL", "")
_DB_NAME   = os.environ.get("DB_NAME",   "trading_app")

_client      = None
_db          = None
_watchlists  = None
_broker_keys = None

_MONGO_UNAVAILABLE = not _MONGO_URL

if _MONGO_UNAVAILABLE:
    logger.warning(
        "MONGO_URL non configurata — endpoints watchlist/broker-keys "
        "non disponibili. Imposta MONGO_URL in backend/.env per abilitarli."
    )


def _get_collections():
    """Ritorna le collection Mongo, inizializzando il client se necessario."""
    global _client, _db, _watchlists, _broker_keys

    if _MONGO_UNAVAILABLE:
        raise HTTPException(
            status_code=503,
            detail=(
                "MongoDB non configurato. "
                "Imposta MONGO_URL e DB_NAME in backend/.env e riavvia il server."
            ),
        )

    if _client is None:
        _client      = AsyncIOMotorClient(_MONGO_URL)
        _db          = _client[_DB_NAME]
        _watchlists  = _db["watchlists"]
        _broker_keys = _db["broker_keys"]

    return _watchlists, _broker_keys


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
TICKER_RE = re.compile(r"^[A-Z0-9.\-^=]{1,16}$")


def _normalize_ticker(value: str) -> str:
    v = (value or "").strip().upper()
    if not v:
        raise HTTPException(status_code=400, detail="Ticker is required")
    if not TICKER_RE.match(v):
        raise HTTPException(
            status_code=400,
            detail="Invalid ticker format (allowed: A-Z 0-9 . - ^ =, max 16 chars)",
        )
    return v


def _normalize_user(value: str) -> str:
    v = (value or "").strip()
    if not v or len(v) > 64:
        raise HTTPException(status_code=400, detail="Valid user_id is required")
    return v


class WatchlistResponse(BaseModel):
    user_id: str
    tickers: List[str]
    updated_at: Optional[str] = None


class WatchlistItemBody(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=64)
    ticker: str = Field(..., min_length=1, max_length=16)


class BrokerKeysBody(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=64)
    broker: Literal["alpaca", "interactive_brokers", "binance", "other"] = "alpaca"
    api_key: str = Field(..., min_length=4, max_length=256)
    api_secret: str = Field(..., min_length=4, max_length=256)

    @field_validator("api_key", "api_secret")
    @classmethod
    def _strip(cls, v: str) -> str:
        return v.strip()


class BrokerKeysResponse(BaseModel):
    user_id: str
    broker: Optional[str] = None
    api_key_masked: Optional[str] = None
    api_secret_masked: Optional[str] = None
    configured: bool = False
    updated_at: Optional[str] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _mask(secret: str) -> str:
    """Return a masked representation of a credential (keep first/last 2)."""
    if not secret:
        return ""
    if len(secret) <= 4:
        return "•" * len(secret)
    return f"{secret[:2]}{'•' * (len(secret) - 4)}{secret[-2:]}"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------
router = APIRouter(prefix="/user", tags=["user"])


# ----- Watchlist -----------------------------------------------------------
@router.get("/watchlist", response_model=WatchlistResponse)
async def get_watchlist(user_id: str = Query(..., min_length=1, max_length=64)):
    wl, _ = _get_collections()
    uid = _normalize_user(user_id)
    doc = await wl.find_one({"user_id": uid}, {"_id": 0})
    if not doc:
        return WatchlistResponse(user_id=uid, tickers=[], updated_at=None)
    return WatchlistResponse(
        user_id=uid,
        tickers=doc.get("tickers", []),
        updated_at=doc.get("updated_at"),
    )


@router.post("/watchlist", response_model=WatchlistResponse)
async def add_to_watchlist(body: WatchlistItemBody):
    wl, _ = _get_collections()
    uid = _normalize_user(body.user_id)
    ticker = _normalize_ticker(body.ticker)

    doc = await wl.find_one({"user_id": uid}, {"_id": 0})
    tickers: List[str] = list(doc.get("tickers", [])) if doc else []
    if ticker in tickers:
        raise HTTPException(status_code=409, detail=f"{ticker} is already in your watchlist")
    if len(tickers) >= 50:
        raise HTTPException(status_code=400, detail="Watchlist limit reached (50 tickers)")
    tickers.append(ticker)

    now = _now_iso()
    await wl.update_one(
        {"user_id": uid},
        {"$set": {"tickers": tickers, "updated_at": now}},
        upsert=True,
    )
    logger.info("[watchlist] add user=%s ticker=%s size=%d", uid, ticker, len(tickers))
    return WatchlistResponse(user_id=uid, tickers=tickers, updated_at=now)


@router.delete("/watchlist", response_model=WatchlistResponse)
async def remove_from_watchlist(
    user_id: str = Query(..., min_length=1, max_length=64),
    ticker: str = Query(..., min_length=1, max_length=16),
):
    wl, _ = _get_collections()
    uid = _normalize_user(user_id)
    tk = _normalize_ticker(ticker)

    doc = await wl.find_one({"user_id": uid}, {"_id": 0})
    tickers: List[str] = list(doc.get("tickers", [])) if doc else []
    if tk not in tickers:
        raise HTTPException(status_code=404, detail=f"{tk} is not in the watchlist")
    tickers = [t for t in tickers if t != tk]
    now = _now_iso()
    await wl.update_one(
        {"user_id": uid},
        {"$set": {"tickers": tickers, "updated_at": now}},
        upsert=True,
    )
    logger.info("[watchlist] remove user=%s ticker=%s size=%d", uid, tk, len(tickers))
    return WatchlistResponse(user_id=uid, tickers=tickers, updated_at=now)


# ----- Broker keys ---------------------------------------------------------
@router.get("/broker-keys", response_model=BrokerKeysResponse)
async def get_broker_keys(user_id: str = Query(..., min_length=1, max_length=64)):
    _, bk = _get_collections()
    uid = _normalize_user(user_id)
    doc = await bk.find_one({"user_id": uid}, {"_id": 0})
    if not doc:
        return BrokerKeysResponse(user_id=uid, configured=False)
    return BrokerKeysResponse(
        user_id=uid,
        broker=doc.get("broker"),
        api_key_masked=_mask(doc.get("api_key", "")),
        api_secret_masked=_mask(doc.get("api_secret", "")),
        configured=True,
        updated_at=doc.get("updated_at"),
    )


@router.post("/broker-keys", response_model=BrokerKeysResponse)
async def save_broker_keys(body: BrokerKeysBody):
    _, bk = _get_collections()
    uid = _normalize_user(body.user_id)
    now = _now_iso()
    await bk.update_one(
        {"user_id": uid},
        {
            "$set": {
                "broker": body.broker,
                "api_key": body.api_key,
                "api_secret": body.api_secret,
                "updated_at": now,
            }
        },
        upsert=True,
    )
    logger.info("[broker-keys] saved user=%s broker=%s", uid, body.broker)
    return BrokerKeysResponse(
        user_id=uid,
        broker=body.broker,
        api_key_masked=_mask(body.api_key),
        api_secret_masked=_mask(body.api_secret),
        configured=True,
        updated_at=now,
    )


@router.delete("/broker-keys", response_model=BrokerKeysResponse)
async def delete_broker_keys(user_id: str = Query(..., min_length=1, max_length=64)):
    _, bk = _get_collections()
    uid = _normalize_user(user_id)
    res = await bk.delete_one({"user_id": uid})
    logger.info("[broker-keys] deleted user=%s removed=%d", uid, res.deleted_count)
    return BrokerKeysResponse(user_id=uid, configured=False)
