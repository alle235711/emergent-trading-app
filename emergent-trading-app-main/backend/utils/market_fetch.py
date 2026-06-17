"""
market_fetch.py — Yahoo Finance download helpers shared across quant models.
"""

from __future__ import annotations

from typing import List, Optional, Tuple

import numpy as np
import pandas as pd
import yfinance as yf

from utils.peer_resolver import resolve_yahoo


def fetch_aligned_closes(
    symbols: List[str],
    lookback_days: int,
    buffer_days: int = 60,
    min_rows: int = 60,
) -> Tuple[pd.DataFrame, List[str], int]:
    """
    Download adjusted daily Close prices for *symbols*, align on common dates.

    Returns (aligned_close_df, labels_used, days_used).
    Raises ValueError on insufficient history.

    Callers must verify the primary anchor survived alignment via
    ``anchor_in_labels(anchor, labels)`` before running geometry models.
    """
    period = f"{max(lookback_days + buffer_days, 90)}d"
    frames: dict = {}
    labels: List[str] = []

    for sym in symbols:
        label = sym.strip().upper()
        yahoo = resolve_yahoo(label)
        try:
            df = yf.Ticker(yahoo).history(period=period, interval="1d", auto_adjust=True)
            if df is None or df.empty:
                continue
            close = df["Close"].dropna()
            close.index = pd.to_datetime(close.index).tz_localize(None)
            if len(close) < max(min_rows // 2, 10):
                continue
            frames[label] = close
            labels.append(label)
        except Exception:
            continue

    if len(frames) < 3:
        raise ValueError(
            f"Could not fetch at least 3 symbols with valid history (got {len(frames)})."
        )

    aligned = pd.DataFrame(frames).dropna(how="any")
    if len(aligned) < min_rows:
        raise ValueError(
            f"Insufficient aligned history: {len(aligned)} rows after dropna, need ≥ {min_rows}."
        )

    if len(aligned) > lookback_days:
        aligned = aligned.iloc[-lookback_days:]

    return aligned, labels, len(aligned)


def fetch_ohlcv(
    ticker: str,
    lookback_days: int,
    buffer_days: int = 30,
) -> Tuple[pd.DataFrame, int]:
    """Single-ticker OHLCV; returns (df, days_used)."""
    period = f"{max(lookback_days + buffer_days, 90)}d"
    yahoo = resolve_yahoo(ticker)
    df = yf.Ticker(yahoo).history(period=period, interval="1d", auto_adjust=True)
    if df is None or df.empty:
        raise ValueError(f"No OHLCV data for {ticker.upper()}.")
    df = df[["Open", "High", "Low", "Close", "Volume"]].dropna()
    df.index = pd.to_datetime(df.index).tz_localize(None)
    if len(df) < 30:
        raise ValueError(f"Insufficient OHLCV history for {ticker.upper()}: {len(df)} rows.")
    if len(df) > lookback_days:
        df = df.iloc[-lookback_days:]
    return df, len(df)


def log_returns(close: pd.DataFrame) -> pd.DataFrame:
    return np.log(close / close.shift(1)).dropna(how="any")
