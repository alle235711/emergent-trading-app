"""
backtesting/engine.py
---------------------
Rigorous walk-forward backtesting for Ensemble SDE and Sheaf cohomology models.

Walk-forward protocol (no look-ahead):
  • Train window: 252 trading days
  • Test window:  21 trading days (one trade signal per step at window open)
  • Step:         21 days
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any, Callable, Literal

import numpy as np
import pandas as pd
import yfinance as yf

from models.ensemble_sde_forecast import (
    EnsembleSDEConfig,
    build_inputs_from_arrays,
    run_ensemble_sde_forecast,
)
from models.sheaf_cohomology import _compute_cohomology
from utils.peer_resolver import PEER_YAHOO_ALIASES, resolve_peers, resolve_yahoo

logger = logging.getLogger("quant.backtest")

TRADING_DAYS_PER_YEAR = 252
TRAIN_WINDOW = 252
TEST_WINDOW = 21
STEP_SIZE = 21
SHEAF_H1_THRESHOLD = 0.55
SHEAF_TRADE_HORIZON = 5
SHEAF_OBS_WINDOW = 30
RISK_FREE_RATE = 0.02
EXPECTED_SIGMA_COVERAGE = 0.6827  # ±1σ Gaussian


ModelName = Literal["ensemble_sde", "sheaf"]


def _parse_date(s: str) -> datetime:
    return datetime.strptime(s.strip()[:10], "%Y-%m-%d")


def fetch_ohlcv(
    ticker: str,
    start_date: str,
    end_date: str,
    *,
    warmup_days: int = TRAIN_WINDOW + 30,
) -> pd.DataFrame:
    """Fetch daily OHLCV from Yahoo Finance with warmup buffer before start_date."""
    ticker = ticker.strip().upper()
    start = _parse_date(start_date)
    end = _parse_date(end_date)
    if start >= end:
        raise ValueError("start_date must precede end_date")

    fetch_start = start - timedelta(days=int(warmup_days * 1.6))
    tk = yf.Ticker(ticker)
    df = tk.history(
        start=fetch_start.strftime("%Y-%m-%d"),
        end=(end + timedelta(days=1)).strftime("%Y-%m-%d"),
        interval="1d",
        auto_adjust=True,
    )
    if df is None or df.empty:
        raise ValueError(f"No OHLCV data for {ticker}")

    df = df[["Open", "High", "Low", "Close", "Volume"]].dropna(how="any").copy()
    df.index = pd.to_datetime(df.index).tz_localize(None)
    df.sort_index(inplace=True)
    return df


def detect_data_warnings(df: pd.DataFrame, ticker: str) -> list[str]:
    """Flag splits, gaps, and thin history."""
    warnings: list[str] = []
    if len(df) < TRAIN_WINDOW + TEST_WINDOW + 10:
        warnings.append(
            f"Short history for {ticker}: {len(df)} bars — results may be unreliable."
        )

    prev_close = df["Close"].shift(1)
    gap_ratio = df["Open"] / prev_close
    big_gaps = gap_ratio[(gap_ratio > 1.15) | (gap_ratio < 0.85)].dropna()
    if len(big_gaps):
        dates = ", ".join(d.strftime("%Y-%m-%d") for d in big_gaps.index[:5])
        extra = f" (+{len(big_gaps) - 5} more)" if len(big_gaps) > 5 else ""
        warnings.append(
            f"Possible split or data gap on {dates}{extra} — verify adjusted prices."
        )

    if df["Volume"].eq(0).sum() > len(df) * 0.05:
        warnings.append("More than 5% zero-volume days — liquidity may affect fills.")

    return warnings


def _walk_forward_slices(n: int, backtest_start: int) -> list[tuple[int, int, int, int]]:
    """
    Return (train_start, train_end_exclusive, entry_idx, exit_idx) per step.
    train_end_exclusive is the index used for model fit (last bar included = train_end-1).
    entry_idx = first bar of test window (trade at Open).
    exit_idx = entry + horizon - 1 (close at Close).
    """
    slices: list[tuple[int, int, int, int]] = []
    pos = backtest_start
    while pos + TEST_WINDOW <= n:
        train_end = pos
        train_start = max(0, train_end - TRAIN_WINDOW)
        entry = pos
        slices.append((train_start, train_end, entry, None))  # exit filled later
        pos += STEP_SIZE
    return slices


def _annualized_sharpe(returns: np.ndarray, periods_per_year: float) -> float:
    if len(returns) < 2:
        return 0.0
    mu = float(np.mean(returns))
    sigma = float(np.std(returns, ddof=1))
    if sigma <= 1e-12:
        return 0.0
    return float((mu - RISK_FREE_RATE / periods_per_year) / sigma * np.sqrt(periods_per_year))


def _max_drawdown(equity: np.ndarray) -> float:
    if len(equity) < 2:
        return 0.0
    peak = np.maximum.accumulate(equity)
    dd = equity / peak - 1.0
    return float(np.min(dd))


def _calibration_label(hit_rate: float) -> str:
    if hit_rate >= EXPECTED_SIGMA_COVERAGE + 0.08:
        return "underconfident"
    if hit_rate <= EXPECTED_SIGMA_COVERAGE - 0.12:
        return "overconfident"
    return "ok"


def _run_sde_step(
    df: pd.DataFrame,
    train_start: int,
    train_end: int,
    horizon_days: int,
    entry_idx: int,
    exit_idx: int,
) -> dict[str, Any] | None:
    """Fit SDE on train slice only; one trade from entry open to exit close."""
    if exit_idx >= len(df) or train_end - train_start < 80:
        return None

    train = df.iloc[train_start:train_end]
    close = train["Close"].to_numpy(dtype=np.float64)
    dates = train.index.to_numpy()

    log_returns = np.log(close / np.roll(close, 1))[1:]
    realized_vol = np.concatenate([
        [np.nan],
        pd.Series(log_returns).rolling(21, min_periods=5)
        .std(ddof=1).to_numpy() * np.sqrt(TRADING_DAYS_PER_YEAR),
    ])

    prices_df, vol_df = build_inputs_from_arrays(
        dates=dates, close=close, realized_vol=realized_vol,
    )

    cfg = EnsembleSDEConfig(
        rolling_window=min(60, max(20, len(close) // 5)),
        n_particles=100,
        n_paths=400,
        forecast_horizon=max(horizon_days, 5),
        seed=42,
    )

    try:
        result = run_ensemble_sde_forecast(
            prices_df=prices_df,
            volatility_df=vol_df,
            jumps_df=None,
            support_levels=None,
            horizons=np.array([horizon_days], dtype=np.int32),
            config=cfg,
        )
    except Exception as exc:
        logger.warning("SDE step failed at %s: %s", df.index[train_end - 1], exc)
        return None

    pred = result["predictive_distribution"]
    mean_h = float(pred["mean"][0])
    std_h = float(pred["std"][0])
    s0 = float(close[-1])

    pred_low = mean_h - std_h
    pred_high = mean_h + std_h
    predicted_up = mean_h >= s0

    entry_open = float(df["Open"].iloc[entry_idx])
    exit_close = float(df["Close"].iloc[exit_idx])
    actual_up = exit_close >= entry_open

    direction = "up" if predicted_up else "down"
    actual_dir = "up" if actual_up else "down"
    hit_direction = predicted_up == actual_up
    in_range = pred_low <= exit_close <= pred_high

    if predicted_up:
        trade_return = (exit_close - entry_open) / entry_open
    else:
        trade_return = (entry_open - exit_close) / entry_open

    return {
        "date": df.index[entry_idx].strftime("%Y-%m-%d"),
        "predicted_direction": direction,
        "actual_direction": actual_dir,
        "direction_hit": hit_direction,
        "predicted_range_low": round(pred_low, 4),
        "predicted_range_high": round(pred_high, 4),
        "range_hit": in_range,
        "entry_price": round(entry_open, 4),
        "exit_price": round(exit_close, 4),
        "return": round(trade_return, 6),
        "signal": direction,
    }


def _fetch_peer_returns_history(
    peers: list[str],
    start: pd.Timestamp,
    end: pd.Timestamp,
) -> pd.DataFrame:
    """Download aligned daily log-returns for peers over [start, end] — no look-ahead."""
    fetch_start = start - pd.Timedelta(days=90)
    fetch_end = end + pd.Timedelta(days=1)
    frames: dict[str, pd.Series] = {}

    for peer in peers:
        yahoo = PEER_YAHOO_ALIASES.get(peer.upper(), resolve_yahoo(peer))
        try:
            raw = yf.Ticker(yahoo).history(
                start=fetch_start.strftime("%Y-%m-%d"),
                end=fetch_end.strftime("%Y-%m-%d"),
                interval="1d",
                auto_adjust=True,
            )
            if raw is None or raw.empty:
                continue
            close = raw["Close"].dropna()
            close.index = pd.to_datetime(close.index).tz_localize(None)
            log_ret = np.log(close / close.shift(1)).dropna()
            if len(log_ret) >= 10:
                frames[peer.upper()] = log_ret
        except Exception:
            continue

    if len(frames) < 3:
        return pd.DataFrame()
    return pd.DataFrame(frames).dropna(how="any")


def _run_sheaf_step(
    df: pd.DataFrame,
    ticker: str,
    train_end: int,
    entry_idx: int,
    exit_idx: int,
    peer_history: pd.DataFrame,
) -> dict[str, Any] | None:
    """
    Sheaf mean-reversion: high H¹ → fade recent move.
    Uses peer returns available only up to train_end (exclusive of test window).
    """
    sym = ticker.strip().upper().replace(".DE", "").replace(".MI", "").replace(".AS", "")
    peers = resolve_peers(sym, n_peers=12)

    if peer_history.empty or len(peer_history.columns) < 3:
        return None

    cutoff_date = df.index[train_end - 1]
    hist = peer_history.loc[:cutoff_date]
    if len(hist) < SHEAF_OBS_WINDOW + 5:
        return None
    snap = _compute_cohomology(
        hist, list(hist.columns), SHEAF_OBS_WINDOW, end_idx=len(hist), connectivity=0.5,
    )
    h1 = float(snap["metrics"]["obstruction_index"])
    signal_active = h1 > SHEAF_H1_THRESHOLD

    recent = df["Close"].iloc[max(0, train_end - 5):train_end]
    recent_move_up = float(recent.iloc[-1]) >= float(recent.iloc[0])

    if not signal_active:
        return {
            "date": df.index[entry_idx].strftime("%Y-%m-%d"),
            "predicted_direction": "neutral",
            "actual_direction": "up" if float(df["Close"].iloc[exit_idx]) >= float(df["Open"].iloc[entry_idx]) else "down",
            "direction_hit": None,
            "predicted_range_low": None,
            "predicted_range_high": None,
            "range_hit": None,
            "entry_price": None,
            "exit_price": None,
            "return": 0.0,
            "signal": "no_trade",
            "h1_obstruction": round(h1, 4),
        }

    # Fade: short if recent move up, long if recent move down
    fade_short = recent_move_up
    predicted_dir = "down" if fade_short else "up"

    entry_open = float(df["Open"].iloc[entry_idx])
    exit_close = float(df["Close"].iloc[exit_idx])
    actual_up = exit_close >= entry_open

    if fade_short:
        trade_return = (entry_open - exit_close) / entry_open
    else:
        trade_return = (exit_close - entry_open) / entry_open

    return {
        "date": df.index[entry_idx].strftime("%Y-%m-%d"),
        "predicted_direction": predicted_dir,
        "actual_direction": "up" if actual_up else "down",
        "direction_hit": (predicted_dir == "up") == actual_up,
        "predicted_range_low": None,
        "predicted_range_high": None,
        "range_hit": None,
        "entry_price": round(entry_open, 4),
        "exit_price": round(exit_close, 4),
        "return": round(trade_return, 6),
        "signal": "fade",
        "h1_obstruction": round(h1, 4),
    }


def run_backtest(
    ticker: str,
    model_name: str,
    start_date: str,
    end_date: str,
    horizon_days: int = 5,
    *,
    progress_callback: Callable[[float, str], None] | None = None,
) -> dict[str, Any]:
    """
    Execute walk-forward backtest and return JSON-serializable summary.

    Parameters
    ----------
    ticker : str
    model_name : 'ensemble_sde' | 'sheaf'
    start_date, end_date : 'YYYY-MM-DD'
    horizon_days : trade holding period (SDE); sheaf uses fixed 5d
    progress_callback : optional fn(progress 0..1, message)
    """
    model = model_name.strip().lower()
    if model not in ("ensemble_sde", "sheaf"):
        raise ValueError(f"Unknown model '{model_name}'. Use ensemble_sde or sheaf.")

    horizon = max(1, int(horizon_days))
    if model == "sheaf":
        horizon = SHEAF_TRADE_HORIZON

    df = fetch_ohlcv(ticker, start_date, end_date)
    warnings = detect_data_warnings(df, ticker)

    start_dt = _parse_date(start_date)
    end_dt = _parse_date(end_date)

    mask = (df.index >= pd.Timestamp(start_dt)) & (df.index <= pd.Timestamp(end_dt))
    backtest_indices = np.where(np.asarray(mask))[0]
    if len(backtest_indices) == 0:
        raise ValueError("No trading days in requested backtest window.")

    backtest_start = int(backtest_indices[0])
    if backtest_start < TRAIN_WINDOW:
        warnings.append(
            f"Insufficient warmup before {start_date}; using {backtest_start} bars instead of {TRAIN_WINDOW}."
        )

    wf_slices = _walk_forward_slices(len(df), backtest_start)
    if not wf_slices:
        raise ValueError("Backtest window too short for walk-forward protocol.")

    trades: list[dict[str, Any]] = []
    peer_history = pd.DataFrame()
    if model == "sheaf":
        sym = ticker.strip().upper().replace(".DE", "").replace(".MI", "").replace(".AS", "")
        peer_history = _fetch_peer_returns_history(
            resolve_peers(sym, n_peers=12),
            pd.Timestamp(df.index[max(0, backtest_start - TRAIN_WINDOW)]),
            pd.Timestamp(df.index[-1]),
        )
        if peer_history.empty:
            warnings.append("Insufficient peer history for Sheaf cohomology backtest.")

    n_steps = len(wf_slices)

    for i, (train_start, train_end, entry_idx, _) in enumerate(wf_slices):
        exit_idx = min(entry_idx + horizon - 1, len(df) - 1)
        if exit_idx <= entry_idx:
            continue

        if progress_callback:
            progress_callback(i / max(n_steps, 1), f"Step {i + 1}/{n_steps}")

        if model == "ensemble_sde":
            row = _run_sde_step(df, train_start, train_end, horizon, entry_idx, exit_idx)
        else:
            row = _run_sheaf_step(
                df, ticker, train_end, entry_idx, exit_idx, peer_history,
            )

        if row:
            trades.append(row)

    if progress_callback:
        progress_callback(1.0, "Computing metrics")

    active_trades = [t for t in trades if t.get("signal") != "no_trade"]
    returns = np.array([t["return"] for t in active_trades], dtype=np.float64)

    if model == "sheaf" and len(active_trades) == 0:
        warnings.append(
            f"No Sheaf H¹ signals above {SHEAF_H1_THRESHOLD} in this period — "
            "mean-reversion trades not triggered."
        )

    direction_trades = [t for t in active_trades if t.get("direction_hit") is not None]
    wins = sum(1 for t in direction_trades if t["direction_hit"])
    win_rate = wins / len(direction_trades) if direction_trades else 0.0

    range_trades = [t for t in trades if t.get("range_hit") is not None]
    range_hits = sum(1 for t in range_trades if t["range_hit"])
    hit_rate_range = range_hits / len(range_trades) if range_trades else 0.0

    avg_return = float(np.mean(returns)) if len(returns) else 0.0
    trades_per_year = TRADING_DAYS_PER_YEAR / STEP_SIZE
    sharpe = _annualized_sharpe(returns, trades_per_year) if len(returns) >= 2 else 0.0

    equity = np.cumprod(np.concatenate([[1.0], 1.0 + returns])) if len(returns) else np.array([1.0])
    max_dd = _max_drawdown(equity)
    model_return = float(equity[-1] - 1.0) if len(returns) else 0.0

    # Buy & hold benchmark over same calendar window
    bh_start = backtest_start
    bh_end = min(len(df) - 1, wf_slices[-1][2] + horizon - 1)
    bh_entry = float(df["Close"].iloc[bh_start])
    bh_exit = float(df["Close"].iloc[bh_end])
    benchmark_return = (bh_exit - bh_entry) / bh_entry if bh_entry > 0 else 0.0

    bh_rets = np.log(df["Close"].iloc[bh_start:bh_end + 1] / df["Close"].iloc[bh_start:bh_end + 1].shift(1)).dropna()
    bh_vol = float(bh_rets.std(ddof=1) * np.sqrt(TRADING_DAYS_PER_YEAR)) if len(bh_rets) > 1 else 0.0
    bh_cagr = benchmark_return  # simplified for period return
    benchmark_sharpe = (bh_cagr - RISK_FREE_RATE) / bh_vol if bh_vol > 1e-12 else 0.0

    cumulative_model = equity.tolist()
    n_bh = len(bh_rets) + 1
    bh_equity = np.linspace(1.0, 1.0 + benchmark_return, max(n_bh, 2)).tolist()

    # Align cumulative series to trade dates for UI sparkline
    cumulative_series = [
        {"date": t["date"], "model": round(float(np.prod(1.0 + returns[: j + 1]) - 1.0), 6), "benchmark": round(benchmark_return * (j + 1) / max(len(active_trades), 1), 6)}
        for j, t in enumerate(active_trades)
    ]

    return {
        "ticker": ticker.upper(),
        "model": model,
        "period": f"{start_date} to {end_date}",
        "horizon_days": horizon,
        "n_trades": len(active_trades),
        "win_rate": round(win_rate, 4),
        "avg_return_per_trade": round(avg_return, 6),
        "sharpe_ratio": round(sharpe, 4),
        "max_drawdown": round(max_dd, 4),
        "benchmark_sharpe": round(benchmark_sharpe, 4),
        "benchmark_return": round(benchmark_return, 4),
        "model_return": round(model_return, 4),
        "hit_rate_range": round(hit_rate_range, 4),
        "calibration_score": _calibration_label(hit_rate_range) if range_trades else "n/a",
        "warnings": warnings,
        "disclaimer": "Simulated historical performance ≠ future results",
        "trades": trades,
        "cumulative_series": cumulative_series,
        "cumulative_model": cumulative_model,
        "cumulative_benchmark": bh_equity,
        "updated_at": datetime.utcnow().isoformat() + "Z",
    }
