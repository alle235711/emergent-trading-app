"""
alert_engine.py — Scheduled alert checks with journal integration.
Runs every check_interval_hours via APScheduler.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from alerts.email_sender import send_alert_email
from journal import journal_store
from models.convergence import compute_convergence, get_model_metric

logger = logging.getLogger("quant.alerts")

CONFIG_PATH = Path(__file__).resolve().parent / "alert_config.json"

_scheduler = None


def _load_config() -> Dict[str, Any]:
    if CONFIG_PATH.exists():
        return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    return {"rules": [], "check_interval_hours": 4}


def save_config(config: Dict[str, Any]) -> None:
    CONFIG_PATH.write_text(json.dumps(config, indent=2), encoding="utf-8")


def get_rules() -> List[Dict[str, Any]]:
    return _load_config().get("rules", [])


def _metric_value(snapshot: Dict[str, Any], model: str, metric: str) -> Optional[float]:
    if metric == "obstruction_index":
        return snapshot.get("metrics", {}).get("obstruction_index")
    if metric == "smoothness_score":
        return snapshot.get("smoothness_score")
    if metric == "solenoidal_pct":
        return snapshot.get("solenoidal_pct")
    if metric == "n_signal_ratio":
        n_signal = int(snapshot.get("n_signal", 0))
        n_assets = max(1, int(snapshot.get("n_assets", 30)))
        return n_signal / n_assets
    if metric == "max_beta1_norm":
        max_b1 = float(snapshot.get("max_beta1", 0))
        n_peers = max(1, int(snapshot.get("n_peers", 10)))
        return max_b1 / (n_peers / 2)
    return get_model_metric(model, snapshot)


def _threshold_crossed(value: float, threshold: float, direction: str) -> bool:
    if direction == "above":
        return value >= threshold
    return value <= threshold


def _cooldown_expired(last_fired: Optional[str], cooldown_hours: int) -> bool:
    if not last_fired:
        return True
    try:
        fired = datetime.fromisoformat(last_fired.replace("Z", "+00:00"))
        if fired.tzinfo is None:
            fired = fired.replace(tzinfo=timezone.utc)
        return datetime.now(timezone.utc) >= fired + timedelta(hours=cooldown_hours)
    except Exception:
        return True


async def _fetch_model_snapshot(ticker: str, model: str, horizon: str = "medium") -> Optional[Dict]:
    """Fetch a single model snapshot via convergence (runs all models but we extract one)."""
    conv = await compute_convergence(ticker=ticker, days=90, horizon=horizon)
    return conv.get("model_snapshots", {}).get(model)


async def check_rule(rule: Dict[str, Any], config: Dict[str, Any]) -> bool:
    """Evaluate one rule. Returns True if alert fired."""
    if not rule.get("enabled", True):
        return False

    ticker = rule.get("ticker", "SPY")
    model = rule.get("model", "sheaf")
    metric = rule.get("metric", "obstruction_index")
    threshold = float(rule.get("threshold", 0.5))
    direction = rule.get("direction", "above")
    cooldown = int(rule.get("cooldown_hours", 24))

    if not _cooldown_expired(rule.get("last_fired"), cooldown):
        return False

    snapshot = await _fetch_model_snapshot(ticker, model)
    if not snapshot:
        logger.warning("[alert] no snapshot for %s/%s", ticker, model)
        return False

    value = _metric_value(snapshot, model, metric)
    if value is None:
        return False

    if not _threshold_crossed(value, threshold, direction):
        return False

    # Fire alert
    send_alert_email(ticker, model, metric, value, threshold)

    conv = await compute_convergence(ticker=ticker, days=90, horizon="medium")
    journal_store.create_entry(
        ticker=ticker,
        horizon="medium",
        trigger="alert",
        note=f"Alert: {model}.{metric} = {round(value, 3)} ({direction} {threshold})",
        convergence_snapshot=conv,
        model_snapshots=conv.get("model_snapshots"),
    )

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
    for r in config.get("rules", []):
        if r.get("id") == rule.get("id"):
            r["last_fired"] = now
    save_config(config)

    logger.info("[alert] fired rule %s: %s %s=%.3f", rule.get("id"), ticker, metric, value)
    return True


async def run_alert_checks() -> Dict[str, Any]:
    """Run all enabled alert rules."""
    config = _load_config()
    fired = 0
    for rule in config.get("rules", []):
        try:
            if await check_rule(rule, config):
                fired += 1
        except Exception as exc:
            logger.exception("[alert] rule %s failed: %s", rule.get("id"), exc)
    return {"checked": len(config.get("rules", [])), "fired": fired}


async def check_auto_thresholds(ticker: str, conv: Dict[str, Any]) -> int:
    """Create journal entries for auto_threshold hits (with 6h cooldown per ticker)."""
    hits = conv.get("auto_threshold_hits") or []
    if not hits:
        return 0

    config = _load_config()
    cooldown_key = f"_auto_{ticker}"
    for r in config.get("rules", []):
        if r.get("id") == cooldown_key:
            if not _cooldown_expired(r.get("last_fired"), 6):
                return 0

    journal_store.create_entry(
        ticker=ticker,
        horizon=conv.get("horizon", "medium"),
        trigger="auto_threshold",
        note=f"Auto-snapshot: estremi rilevati — {', '.join(hits)}",
        convergence_snapshot=conv,
        model_snapshots=conv.get("model_snapshots"),
    )

    # Track cooldown in a pseudo-rule
    found = False
    for r in config.get("rules", []):
        if r.get("id") == cooldown_key:
            r["last_fired"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
            found = True
    if not found:
        config.setdefault("rules", []).append({
            "id": cooldown_key,
            "ticker": ticker,
            "model": "_system",
            "metric": "auto_threshold",
            "threshold": 0,
            "direction": "above",
            "cooldown_hours": 6,
            "enabled": False,
            "last_fired": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S"),
        })
    save_config(config)
    return 1


def add_rule(rule_data: Dict[str, Any]) -> Dict[str, Any]:
    config = _load_config()
    rule = {
        "id": rule_data.get("id") or f"r{uuid.uuid4().hex[:6]}",
        "ticker": rule_data.get("ticker", "SPY").upper(),
        "model": rule_data.get("model", "sheaf"),
        "metric": rule_data.get("metric", "obstruction_index"),
        "threshold": float(rule_data.get("threshold", 0.5)),
        "direction": rule_data.get("direction", "above"),
        "cooldown_hours": int(rule_data.get("cooldown_hours", 24)),
        "enabled": rule_data.get("enabled", True),
        "last_fired": None,
    }
    config.setdefault("rules", []).append(rule)
    save_config(config)
    return rule


def update_rule(rule_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    config = _load_config()
    for r in config.get("rules", []):
        if r.get("id") == rule_id:
            for k, v in updates.items():
                if k == "ticker" and v:
                    r[k] = str(v).upper()
                elif k in ("threshold",):
                    r[k] = float(v)
                elif k in ("cooldown_hours",):
                    r[k] = int(v)
                elif k in ("enabled", "direction", "model", "metric"):
                    r[k] = v
            save_config(config)
            return r
    return None


def delete_rule(rule_id: str) -> bool:
    config = _load_config()
    rules = [r for r in config.get("rules", []) if r.get("id") != rule_id]
    if len(rules) == len(config.get("rules", [])):
        return False
    config["rules"] = rules
    save_config(config)
    return True


def _sync_run_checks():
    """Wrapper for APScheduler (sync context)."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.ensure_future(run_alert_checks())
        else:
            loop.run_until_complete(run_alert_checks())
    except RuntimeError:
        asyncio.run(run_alert_checks())


def start_scheduler() -> None:
    """Start APScheduler background job."""
    global _scheduler
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
    except ImportError:
        logger.warning("[alert] APScheduler not installed — alerts will only run on manual trigger")
        return

    if _scheduler is not None:
        return

    config = _load_config()
    interval = int(config.get("check_interval_hours", 4))

    _scheduler = BackgroundScheduler()
    _scheduler.add_job(
        _sync_run_checks,
        "interval",
        hours=interval,
        id="alert_check",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info("[alert] scheduler started — interval %dh", interval)


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler:
        _scheduler.shutdown(wait=False)
        _scheduler = None
