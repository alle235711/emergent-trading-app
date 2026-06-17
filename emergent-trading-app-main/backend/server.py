"""
Quant Analysis Dashboard - FastAPI Backend
-------------------------------------------
Provides market data + statistical metrics derived from Yahoo Finance.
"""

from fastapi import FastAPI, APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import asyncio
import logging
from pathlib import Path
from typing import List, Literal, Optional
from datetime import datetime, timezone

# ── TDA imports ────────────────────────────────────────────────────────────
from models.tda_neighborhoods import run_tda_local_neighborhoods
from models.tda_mapper        import run_mapper_analysis
from models.tda_fnn           import estimate_embedding_dimension_fnn
from models.tda_serializer    import build_tda_response
from models.tda_validator     import (
    validate_prices,
    validate_hyperparams,
    validate_mapper_params,
    safe_run,
)
from models.ensemble_sde_forecast import (
    EnsembleSDEConfig,
    build_inputs_from_arrays,
    run_ensemble_sde_forecast,
)
from models.sheaf_cohomology import run_sheaf_cohomology
from models.tda_clique import run_tda_clique
from models.affine_scheme import run_affine_scheme
from models.hodge_decomposition import run_hodge_decomposition
from models.quantum_graph_spectrum import run_quantum_graph_spectrum
# ──────────────────────────────────────────────────────────────────────────

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")


import numpy as np
import pandas as pd
import yfinance as yf
from pydantic import BaseModel, Field

from routes.user import router as user_router
from routes.backtest import router as backtest_router
from routes.ticker import router as ticker_router
from routes.convergence import router as convergence_router
from routes.journal import router as journal_router
from routes.alerts import router as alerts_router
from alerts.alert_engine import start_scheduler, stop_scheduler
from services.support_matrix import build_support_probability_matrix
from services.market_data import market_router
from execution.PaperBroker import paper_broker

# ---------------------------------------------------------------------------
# Bootstrap
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("quant.api")

app        = FastAPI(title="Quant Analysis API", version="0.1.0")
api_router = APIRouter(prefix="/api")


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------
class PricePoint(BaseModel):
    date:  str   = Field(..., description="ISO formatted trading date (YYYY-MM-DD)")
    close: float = Field(..., description="Adjusted close price")


class Metrics(BaseModel):
    volatility_annualized: float = Field(...)
    return_annualized:     float = Field(...)
    sharpe_ratio:          float = Field(...)
    max_drawdown:          float = Field(...)
    risk_free_rate:        float = Field(...)
    observations:          int   = Field(...)


class MarketDataResponse(BaseModel):
    ticker:      str
    period:      str
    currency:    Optional[str] = None
    name:        Optional[str] = None
    last_price:  float
    first_price: float
    start_date:  str
    end_date:    str
    series:      List[PricePoint]
    metrics:     Metrics


# ---------------------------------------------------------------------------
# Analytics layer  (invariato)
# ---------------------------------------------------------------------------
TRADING_DAYS_PER_YEAR  = 252
DEFAULT_RISK_FREE_RATE = 0.02


def _annualized_volatility(log_returns: pd.Series) -> float:
    if log_returns.empty:
        return 0.0
    return float(log_returns.std(ddof=1) * np.sqrt(TRADING_DAYS_PER_YEAR))


def _annualized_return(close: pd.Series) -> float:
    if len(close) < 2:
        return 0.0
    first, last = float(close.iloc[0]), float(close.iloc[-1])
    if first <= 0:
        return 0.0
    days = (close.index[-1] - close.index[0]).days
    if days <= 0:
        return 0.0
    years = days / 365.25
    return float((last / first) ** (1 / years) - 1)


def _max_drawdown(close: pd.Series) -> float:
    if close.empty:
        return 0.0
    running_max = close.cummax()
    drawdown    = close / running_max - 1.0
    return float(drawdown.min())


def _sharpe_ratio(cagr: float, vol: float, risk_free_rate: float) -> float:
    if vol <= 0:
        return 0.0
    return float((cagr - risk_free_rate) / vol)


def compute_metrics(close: pd.Series,
                    risk_free_rate: float = DEFAULT_RISK_FREE_RATE) -> Metrics:
    log_returns = np.log(close / close.shift(1)).dropna()
    vol    = _annualized_volatility(log_returns)
    cagr   = _annualized_return(close)
    mdd    = _max_drawdown(close)
    sharpe = _sharpe_ratio(cagr, vol, risk_free_rate)
    return Metrics(
        volatility_annualized=round(vol,    6),
        return_annualized    =round(cagr,   6),
        sharpe_ratio         =round(sharpe, 6),
        max_drawdown         =round(mdd,    6),
        risk_free_rate       =risk_free_rate,
        observations         =int(len(close)),
    )


# ---------------------------------------------------------------------------
# Data ingestion layer  (invariato)
# ---------------------------------------------------------------------------
ALLOWED_PERIODS = {"1d","5d","1mo","3mo","6mo","1y","2y","5y","max"}


def fetch_history(ticker: str, period: str) -> tuple[pd.DataFrame, dict]:
    ticker = ticker.strip().upper()
    if not ticker:
        raise HTTPException(status_code=400, detail="Ticker symbol is required")

    start_date = end_date = None
    if period.startswith("custom:"):
        parts = period.split(":")
        if len(parts) != 3:
            raise HTTPException(status_code=400,
                detail="Formato custom non valido. Usa custom:YYYY-MM-DD:YYYY-MM-DD")
        _, start_str, end_str = parts
        try:
            start_date = datetime.strptime(start_str, "%Y-%m-%d")
            end_date   = datetime.strptime(end_str,   "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=400,
                detail="Date non valide. Usa formato YYYY-MM-DD")
        if start_date >= end_date:
            raise HTTPException(status_code=400,
                detail="La data iniziale deve precedere quella finale")
    elif period not in ALLOWED_PERIODS:
        raise HTTPException(status_code=400,
            detail=f"Periodo non valido '{period}'.")

    logger.info("[fetch_history] ticker=%s period=%s", ticker, period)
    try:
        tk = yf.Ticker(ticker)
        if start_date and end_date:
            df = tk.history(
                start=start_date.strftime("%Y-%m-%d"),
                end  =end_date.strftime("%Y-%m-%d"),
                interval="1d", auto_adjust=True,
            )
        else:
            df = tk.history(period=period, interval="1d", auto_adjust=True)
    except Exception as exc:
        raise HTTPException(status_code=502,
            detail=f"Upstream data error: {exc}") from exc

    if df is None or df.empty:
        raise HTTPException(status_code=404,
            detail=f"No data for ticker '{ticker}' (period={period})")

    df = df[["Close"]].dropna().copy()
    df.index = pd.to_datetime(df.index).tz_localize(None)
    df.sort_index(inplace=True)

    meta: dict = {"currency": None, "name": None}
    try:
        fast = getattr(tk, "fast_info", None)
        if fast:
            meta["currency"] = getattr(fast, "currency", None)
        info = getattr(tk, "info", None) or {}
        meta["name"] = info.get("longName") or info.get("shortName") or ticker
        if not meta["currency"]:
            meta["currency"] = info.get("currency")
    except Exception:
        pass

    return df, meta


# ---------------------------------------------------------------------------
# Routes — mercato (invariate)
# ---------------------------------------------------------------------------
@api_router.get("/")
async def root():
    return {"service": "quant-api", "status": "ok"}


@api_router.get("/health")
async def health():
    return {"status": "healthy",
            "timestamp": datetime.now(timezone.utc).isoformat()}


@api_router.get("/market/ohlc")
async def get_market_ohlc(
    ticker: str = Query(..., min_length=1),
    period: Literal["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "max"] = Query("2y"),
):
    """
    Full OHLCV history from Yahoo Finance + the latest live mark from the
    hybrid feed (WebSocket cache or on-demand quote).
    """
    history = await market_router.get_history(ticker, period=period, interval="1d")
    quote = await market_router.get_quote(ticker)
    return {
        "status": "ok",
        **history,
        "last_price": round(float(quote["price"]), 6),
        "live_source": quote.get("source"),
    }


@api_router.get("/market/data", response_model=MarketDataResponse)
async def get_market_data(
    ticker: str = Query(..., min_length=1),
    period: Literal["1d","5d","1mo","3mo","6mo","1y","2y","5y","max"] = Query("2y"),
    risk_free_rate: float = Query(DEFAULT_RISK_FREE_RATE, ge=0, le=0.25),
):
    df, meta = fetch_history(ticker, period)
    close    = df["Close"]
    metrics  = compute_metrics(close, risk_free_rate=risk_free_rate)
    series   = [
        PricePoint(date=idx.strftime("%Y-%m-%d"), close=round(float(val), 6))
        for idx, val in close.items()
    ]
    return MarketDataResponse(
        ticker     =ticker.upper(),
        period     =period,
        currency   =meta.get("currency"),
        name       =meta.get("name"),
        last_price =round(float(close.iloc[-1]), 6),
        first_price=round(float(close.iloc[0]),  6),
        start_date =series[0].date,
        end_date   =series[-1].date,
        series     =series,
        metrics    =metrics,
    )


@api_router.get("/market/support-matrix")
async def get_support_matrix(
    ticker:      str   = Query(..., min_length=1),
    period:      Literal["1d","5d","1mo","3mo","6mo","1y","2y","5y","max"] = Query("2y"),
    w:           int   = Query(10,    ge=3,  le=50),
    epsilon:     float = Query(0.015, ge=0.005, le=0.1),
    delta:       float = Query(0.005, ge=0.001, le=0.05),
    w_cool:      int   = Query(5,     ge=1,  le=30),
    B:           int   = Query(500,   ge=100, le=2000),
    min_touches: int   = Query(3,     ge=2,  le=20),
):
    df, meta = fetch_history(ticker, period)
    prices   = df["Close"].to_numpy(dtype=np.float64)

    tk  = yf.Ticker(ticker)
    raw = tk.history(period=period, interval="1d", auto_adjust=True)
    raw.index = pd.to_datetime(raw.index).tz_localize(None)
    raw.sort_index(inplace=True)

    highs   = raw["High"].to_numpy(dtype=np.float64)
    lows    = raw["Low"].to_numpy(dtype=np.float64)
    volumes = raw["Volume"].to_numpy(dtype=np.float64)

    N       = min(len(prices), len(highs), len(lows))
    prices  = prices[:N];  highs = highs[:N]
    lows    = lows[:N];    volumes = volumes[:N]

    result = build_support_probability_matrix(
        prices=prices, highs=highs, lows=lows, volumes=volumes,
        T_horizons=np.array([1, 3, 5, 10, 20]),
        w=w, epsilon=epsilon, delta=delta,
        w_cool=w_cool, B=B, min_touches=min_touches,
    )
    return {"ticker": ticker.upper(), "period": period,
            "name": meta.get("name"), "currency": meta.get("currency"),
            "result": result}


# ---------------------------------------------------------------------------
# Routes — Ensemble SDE Forecast
# ---------------------------------------------------------------------------

@api_router.get("/forecast/ensemble-sde")
async def endpoint_ensemble_sde_forecast(
    ticker:           str   = Query(..., min_length=1),
    period:           Literal["1d","5d","1mo","3mo","6mo","1y","2y","5y","max"] = Query("2y"),
    rolling_window:   int   = Query(60,   ge=20,  le=252),
    n_particles:      int   = Query(300,  ge=50,  le=1000),
    n_paths:          int   = Query(2000, ge=200, le=10000),
    forecast_horizon: int   = Query(20,   ge=5,   le=60),
    var_alpha:        float = Query(0.05, ge=0.01, le=0.20),
    include_support:  bool  = Query(True),
    w:                int   = Query(10,   ge=3,  le=50),
    epsilon:          float = Query(0.015, ge=0.005, le=0.1),
):
    """
    Previsione d'insieme SDE: GBM + mean-reverting OU + jump-diffusion
    con calibrazione rolling e particle filtering.

    Output: distribuzione predittiva, traiettorie campionate, probabilità
    di violazione supporti, VaR/CVaR dinamico, scenari bear/base/bull.
    """
    logger.info(
        "[ensemble-sde] request ticker=%s period=%s window=%d particles=%d paths=%d horizon=%d",
        ticker, period, rolling_window, n_particles, n_paths, forecast_horizon,
    )
    print(
        f"[ensemble-sde] >>> Avvio forecast {ticker.upper()} period={period} "
        f"(window={rolling_window}, particles={n_particles}, paths={n_paths})",
        flush=True,
    )

    df, meta = fetch_history(ticker, period)
    close    = df["Close"].to_numpy(dtype=np.float64)
    dates    = df.index.to_numpy()

    log_returns = np.log(close / np.roll(close, 1))[1:]
    realized_vol = np.concatenate([
        [np.nan],
        pd.Series(log_returns).rolling(21, min_periods=5)
          .std(ddof=1).to_numpy() * np.sqrt(TRADING_DAYS_PER_YEAR),
    ])

    prices_df, vol_df = build_inputs_from_arrays(
        dates=dates,
        close=close,
        realized_vol=realized_vol,
    )

    support_levels = None
    if include_support:
        try:
            tk  = yf.Ticker(ticker)
            raw = tk.history(period=period, interval="1d", auto_adjust=True)
            raw.index = pd.to_datetime(raw.index).tz_localize(None)
            raw.sort_index(inplace=True)
            highs = raw["High"].to_numpy(dtype=np.float64)
            lows  = raw["Low"].to_numpy(dtype=np.float64)
            vols  = raw["Volume"].to_numpy(dtype=np.float64)
            N = min(len(close), len(highs), len(lows))
            sm = build_support_probability_matrix(
                prices=close[:N], highs=highs[:N], lows=lows[:N],
                volumes=vols[:N],
                T_horizons=np.array([1, 3, 5, 10, 20]),
            )
            support_levels = sm.get("levels", [])
        except Exception as exc:
            logger.warning("[ensemble-sde] support levels fallback: %s", exc)
            support_levels = []

    config = EnsembleSDEConfig(
        rolling_window=rolling_window,
        n_particles=n_particles,
        n_paths=n_paths,
        forecast_horizon=forecast_horizon,
        var_alpha=var_alpha,
    )

    try:
        result = run_ensemble_sde_forecast(
            prices_df=prices_df,
            volatility_df=vol_df,
            jumps_df=None,
            support_levels=support_levels,
            horizons=np.array([1, 3, 5, 10, forecast_horizon]),
            config=config,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("[ensemble-sde] computation failed")
        raise HTTPException(status_code=500,
            detail=f"Ensemble SDE forecast error: {exc}") from exc

    return {
        "status":   "ok",
        "module":   "ensemble_sde_forecast",
        "ticker":   ticker.upper(),
        "period":   period,
        "name":     meta.get("name"),
        "currency": meta.get("currency"),
        "result":   result,
    }


# ---------------------------------------------------------------------------
# Routes — Sheaf Cohomology (Model 10)
# ---------------------------------------------------------------------------

@api_router.get("/sheaf/cohomology")
async def endpoint_sheaf_cohomology(
    ticker:       str   = Query(..., min_length=1),
    days:         int   = Query(30, ge=5, le=365),
    horizon:      str   = Query("medium"),
    connectivity: float = Query(0.5, ge=0.1, le=0.95),
):
    """
    Čech cohomology H¹(𝒳, ℱ) su un ricoprimento di peer correlati.
    Sezioni locali = rendimenti log giornalieri; olonomie = ostruzione
    informativa (arbitraggio) misurata su cicli del nervo.
    """
    logger.info("[sheaf-cohomology] ticker=%s days=%d horizon=%s", ticker, days, horizon)
    try:
        result = run_sheaf_cohomology(
            ticker=ticker,
            days=days,
            horizon=horizon,
            connectivity=connectivity,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("[sheaf-cohomology] computation failed")
        raise HTTPException(status_code=500,
            detail=f"Sheaf cohomology error: {exc}") from exc

    return {
        "status": "ok",
        "module": "sheaf_cohomology",
        "ticker": ticker.upper(),
        "result": result,
    }


# ---------------------------------------------------------------------------
# Routes — Geometry models (Clique, Affine Scheme, Hodge, Quantum Graph)
# ---------------------------------------------------------------------------

@api_router.get("/tda/clique")
async def endpoint_tda_clique(
    ticker:   str = Query("SPY"),
    days:     int = Query(90, ge=60, le=365),
    horizon:  str = Query("medium"),
    n_peers:  int = Query(10, ge=8, le=14),
):
    """Clique complex persistent homology on peer correlation graph."""
    logger.info("[tda-clique] ticker=%s days=%d n_peers=%d", ticker, days, n_peers)
    try:
        result = run_tda_clique(ticker=ticker, days=days, horizon=horizon, n_peers=n_peers)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("[tda-clique] computation failed")
        raise HTTPException(status_code=500, detail=f"TDA clique error: {exc}") from exc
    return {"status": "ok", "module": "tda_clique", "ticker": ticker.upper(), "result": result}


@api_router.get("/algebra/scheme")
async def endpoint_affine_scheme(
    ticker:  str = Query("SPY"),
    days:    int = Query(120, ge=60, le=252),
    horizon: str = Query("medium"),
):
    """Affine scheme microstructure via Weierstrass price–volume cubic."""
    logger.info("[affine-scheme] ticker=%s days=%d", ticker, days)
    try:
        result = run_affine_scheme(ticker=ticker, days=days, horizon=horizon)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("[affine-scheme] computation failed")
        raise HTTPException(status_code=500, detail=f"Affine scheme error: {exc}") from exc
    return {"status": "ok", "module": "affine_scheme", "ticker": ticker.upper(), "result": result}


@api_router.get("/hodge/decompose")
async def endpoint_hodge_decompose(
    ticker:   str = Query("SPY"),
    days:     int = Query(60, ge=30, le=90),
    horizon:  str = Query("medium"),
    n_assets: int = Query(8, ge=7, le=12),
):
    """Hodge decomposition of cross-asset return flows on correlation graph."""
    logger.info("[hodge-decompose] ticker=%s days=%d n_assets=%d", ticker, days, n_assets)
    try:
        result = run_hodge_decomposition(
            ticker=ticker, days=days, horizon=horizon, n_assets=n_assets,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("[hodge-decompose] computation failed")
        raise HTTPException(status_code=500, detail=f"Hodge decomposition error: {exc}") from exc
    return {"status": "ok", "module": "hodge_decomposition", "ticker": ticker.upper(), "result": result}


@api_router.get("/spectral/quantum-graph")
async def endpoint_quantum_graph(
    ticker:   str = Query("SPY"),
    days:     int = Query(180, ge=120, le=320),
    horizon:  str = Query("medium"),
    n_assets: int = Query(30, ge=20, le=64),
):
    """Marchenko–Pastur spectral analysis of cross-section correlation matrix."""
    logger.info("[quantum-graph] ticker=%s days=%d n_assets=%d", ticker, days, n_assets)
    try:
        result = run_quantum_graph_spectrum(
            ticker=ticker, days=days, horizon=horizon, n_assets=n_assets,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("[quantum-graph] computation failed")
        raise HTTPException(status_code=500, detail=f"Quantum graph spectrum error: {exc}") from exc
    return {"status": "ok", "module": "quantum_graph_spectrum", "ticker": ticker.upper(), "result": result}


# ---------------------------------------------------------------------------
# Routes — TDA  ← NUOVI, tutti su api_router, tutti con validazione
# ---------------------------------------------------------------------------

@api_router.get("/tda/fnn")
async def endpoint_fnn(
    ticker:   str   = Query("AAPL"),
    period:   str   = Query("1y"),
    interval: str   = Query("1d"),
    d_max:    int   = Query(10, ge=2, le=15),
):
    """
    Stima la dimensione ottimale di embedding d* via FNN (Kennel) e Cao.
    Usare GET con query params: /api/tda/fnn?ticker=AAPL&period=1y
    """
    try:
        tk     = yf.Ticker(ticker.upper())
        df_raw = tk.history(period=period, interval=interval, auto_adjust=True)
        prices = df_raw["Close"].dropna().to_numpy(dtype=np.float64)
    except Exception as exc:
        return JSONResponse(status_code=502,
            content={"status":"error","module":"fnn",
                     "error":{"code":"DOWNLOAD_ERROR","message":str(exc)}})

    vr = validate_prices(prices, module="fnn")
    if not vr.valid:
        return JSONResponse(status_code=422,
            content={"status":"error","module":"fnn",
                     "validation": vr.to_response()})

    result = safe_run(estimate_embedding_dimension_fnn,
                      vr.prices_clean, d_max=d_max, module="fnn")
    if not result["ok"]:
        return JSONResponse(status_code=500,
            content={"status":"error","module":"fnn", **result})

    payload             = build_tda_response("fnn", result["data"])
    payload["warnings"] = vr.warnings
    return payload


@api_router.get("/tda/mapper")
async def endpoint_mapper(
    ticker:      str   = Query("AAPL"),
    period:      str   = Query("1y"),
    interval:    str   = Query("1d"),
    d:           int   = Query(4,    ge=2, le=10),
    tau:         int   = Query(3,    ge=1, le=20),
    W:           int   = Query(None, ge=10),
    filter_type: str   = Query("pca1"),
    n_cubes:     int   = Query(10,   ge=2, le=50),
    overlap_pct: float = Query(0.5,  ge=0.1, le=0.9),
    cluster_algo:str   = Query("single"),
):
    """
    Analisi topologica Mapper: grafo nodi/archi colorato per regime.
    """
    try:
        tk     = yf.Ticker(ticker.upper())
        df_raw = tk.history(period=period, interval=interval, auto_adjust=True)
        prices = df_raw["Close"].dropna().to_numpy(dtype=np.float64)
    except Exception as exc:
        return JSONResponse(status_code=502,
            content={"status":"error","module":"mapper",
                     "error":{"code":"DOWNLOAD_ERROR","message":str(exc)}})

    vr_p = validate_prices(prices, module="mapper")
    if not vr_p.valid:
        return JSONResponse(status_code=422,
            content={"status":"error","module":"mapper",
                     "validation": vr_p.to_response()})

    W_eff = W if W is not None else min(200, len(vr_p.prices_clean) // 2)
    vr_h  = validate_hyperparams(d, tau, W_eff, len(vr_p.prices_clean))
    if not vr_h.valid:
        return JSONResponse(status_code=422,
            content={"status":"error","module":"mapper",
                     "validation": vr_h.to_response()})

    vr_m = validate_mapper_params(n_cubes, overlap_pct, filter_type)
    if not vr_m.valid:
        return JSONResponse(status_code=422,
            content={"status":"error","module":"mapper",
                     "validation": vr_m.to_response()})

    result = safe_run(run_mapper_analysis, vr_p.prices_clean,
                      d=d, tau=tau, W=W_eff,
                      filter_type=filter_type, n_cubes=n_cubes,
                      overlap_pct=overlap_pct, cluster_algo=cluster_algo,
                      module="mapper")
    if not result["ok"]:
        return JSONResponse(status_code=500,
            content={"status":"error","module":"mapper", **result})

    payload             = build_tda_response("mapper", result["data"])
    payload["warnings"] = vr_p.warnings + vr_h.warnings + vr_m.warnings
    return payload


@api_router.get("/tda/full")
async def endpoint_tda_full(
    ticker:  str   = Query("AAPL"),
    period:  str   = Query("1y"),
    interval:str   = Query("1d"),
    d:       int   = Query(4,   ge=2, le=10),
    tau:     int   = Query(3,   ge=1, le=20),
    W:       int   = Query(100, ge=20, le=500),
    max_dim: int   = Query(2,   ge=1, le=3),
):
    """
    Pipeline TDA completa: vicinati topologici locali, omologia persistente,
    evoluzione locale, simulazioni condizionate.
    """
    try:
        tk     = yf.Ticker(ticker.upper())
        df_raw = tk.history(period=period, interval=interval, auto_adjust=True)
        prices = df_raw["Close"].dropna().to_numpy(dtype=np.float64)
    except Exception as exc:
        return JSONResponse(status_code=502,
            content={"status":"error","module":"tda",
                     "error":{"code":"DOWNLOAD_ERROR","message":str(exc)}})

    vr = validate_prices(prices, module="tda")
    if not vr.valid:
        return JSONResponse(status_code=422,
            content={"status":"error","module":"tda",
                     "validation": vr.to_response()})

    vr_h = validate_hyperparams(d, tau, W, len(vr.prices_clean))
    if not vr_h.valid:
        return JSONResponse(status_code=422,
            content={"status":"error","module":"tda",
                     "validation": vr_h.to_response()})

    result = safe_run(run_tda_local_neighborhoods,
                      vr.prices_clean, d=d, tau=tau, W=W, max_dim=max_dim,
                      module="tda")
    if not result["ok"]:
        return JSONResponse(status_code=500,
            content={"status":"error","module":"tda", **result})

    payload             = build_tda_response("tda", result["data"])
    payload["warnings"] = vr.warnings + vr_h.warnings
    return payload

# ---------------------------------------------------------------------------
# Part 1 — Hybrid live feed: WebSocket market stream
# ---------------------------------------------------------------------------

@app.websocket("/ws/market-stream/{ticker}")
async def ws_market_stream(websocket: WebSocket, ticker: str):
    """
    Unified market stream for a single instrument:
      1. on connect → an OHLCV `snapshot` (deep history from yfinance) to seed
         the chart and calibrate the client;
      2. then a continuous flow of `tick` messages produced by the simulated
         IBKR paper account (services.market_data.IBKRPaperStream).

    One shared background stream per symbol fans out to every connected client.
    """
    await websocket.accept()
    queue = None
    try:
        snapshot = await market_router.get_history(ticker, period="6mo", interval="1d")
        await websocket.send_json({"type": "snapshot", **snapshot})

        _, queue = await market_router.subscribe(ticker)
        while True:
            try:
                tick = await asyncio.wait_for(queue.get(), timeout=15.0)
                await websocket.send_json(tick)
            except asyncio.TimeoutError:
                # Heartbeat so proxies don't drop an idle socket.
                await websocket.send_json({"type": "heartbeat", "ts": datetime.now(timezone.utc).isoformat()})
    except WebSocketDisconnect:
        logger.info("[ws] client disconnected from %s", ticker)
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("[ws] stream error for %s: %s", ticker, exc)
    finally:
        if queue is not None:
            await market_router.unsubscribe(ticker, queue)


# ---------------------------------------------------------------------------
# Part 2 — Paper Trading execution engine (PaperBroker)
# ---------------------------------------------------------------------------
class ExecuteOrder(BaseModel):
    ticker:      str
    side:        Literal["buy", "sell"]
    quantity:    float = Field(..., gt=0)
    order_type:  Literal["market", "limit", "stop"] = "market"
    limit_price: Optional[float] = Field(None, gt=0)


async def _portfolio_snapshot() -> dict:
    """Mark the simulated portfolio against the latest live prices."""
    prices: dict = {}
    for tk in paper_broker.held_tickers():
        px = market_router.last_price(tk)
        if px is None:
            try:
                px = (await market_router.get_quote(tk))["price"]
            except Exception:
                px = None
        if px is not None:
            prices[tk] = px
    return paper_broker.portfolio(prices)


@api_router.post("/execute")
async def execute_order(order: ExecuteOrder):
    """
    Submit a paper order. The fill price is the LIVE mark from the hybrid feed
    (market orders), or the supplied limit/stop price otherwise.
    """
    quote = await market_router.get_quote(order.ticker)
    live = float(quote["price"])
    fill = live if order.order_type == "market" else float(order.limit_price or live)

    result = paper_broker.execute(
        ticker=order.ticker,
        side=order.side,
        quantity=order.quantity,
        fill_price=fill,
        order_type=order.order_type,
        reference_price=live,
    )
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result["message"])

    portfolio = await _portfolio_snapshot()
    return {
        "status": "ok",
        "message": result["message"],
        "order": result["order"],
        "live_price": round(live, 6),
        "portfolio": portfolio,
    }


@api_router.get("/paper/portfolio")
async def get_paper_portfolio():
    return {"status": "ok", "portfolio": await _portfolio_snapshot()}


@api_router.get("/paper/orders")
async def get_paper_orders(limit: int = Query(50, ge=1, le=500)):
    return {"status": "ok", "orders": paper_broker.list_orders(limit=limit)}


@api_router.get("/paper/quote")
async def get_paper_quote(ticker: str = Query(...)):
    return {"status": "ok", **(await market_router.get_quote(ticker))}


@api_router.post("/paper/reset")
async def reset_paper_portfolio():
    result = paper_broker.reset()
    return {"status": "ok", "message": result["message"], "portfolio": await _portfolio_snapshot()}


@app.on_event("shutdown")
async def _shutdown_streams():
    stop_scheduler()
    await market_router.shutdown()


# ---------------------------------------------------------------------------
# App wiring
# ---------------------------------------------------------------------------
api_router.include_router(user_router)
api_router.include_router(backtest_router)
api_router.include_router(ticker_router)
api_router.include_router(convergence_router)
api_router.include_router(journal_router)
api_router.include_router(alerts_router)
app.include_router(api_router)


@app.on_event("startup")
async def _startup_alerts():
    start_scheduler()

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(HTTPException)
async def http_exception_handler(_, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code,
                        content={"detail": exc.detail})