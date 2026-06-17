"""Email alert management API."""

import os
import re
from pathlib import Path
from typing import List, Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from alerts import alert_engine
from alerts.email_sender import send_test_email

router = APIRouter(prefix="/alerts", tags=["alerts"])

ROOT_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = ROOT_DIR / ".env"


class EmailSettingsBody(BaseModel):
    email_to: str


class RuleBody(BaseModel):
    ticker: str = "SPY"
    model: str = "sheaf"
    metric: str = "obstruction_index"
    threshold: float = 0.5
    direction: Literal["above", "below"] = "above"
    cooldown_hours: int = 24
    enabled: bool = True


class RuleUpdateBody(BaseModel):
    ticker: Optional[str] = None
    model: Optional[str] = None
    metric: Optional[str] = None
    threshold: Optional[float] = None
    direction: Optional[Literal["above", "below"]] = None
    cooldown_hours: Optional[int] = None
    enabled: Optional[bool] = None


def _update_env_var(key: str, value: str) -> None:
    """Update or append a key in backend/.env."""
    lines: List[str] = []
    if ENV_PATH.exists():
        lines = ENV_PATH.read_text(encoding="utf-8").splitlines()

    pattern = re.compile(rf"^{re.escape(key)}=")
    found = False
    new_lines = []
    for line in lines:
        if pattern.match(line):
            new_lines.append(f"{key}={value}")
            found = True
        else:
            new_lines.append(line)
    if not found:
        new_lines.append(f"{key}={value}")

    ENV_PATH.write_text("\n".join(new_lines) + "\n", encoding="utf-8")
    os.environ[key] = value


@router.get("/config")
async def get_alert_config():
    config = alert_engine._load_config()
    visible_rules = [r for r in config.get("rules", []) if not str(r.get("id", "")).startswith("_")]
    return {
        "status": "ok",
        "rules": visible_rules,
        "check_interval_hours": config.get("check_interval_hours", 4),
        "email_to": os.getenv("ALERT_EMAIL_TO", ""),
        "email_configured": bool(os.getenv("ALERT_EMAIL_FROM") and os.getenv("ALERT_EMAIL_PASSWORD")),
    }


@router.post("/rules")
async def create_rule(body: RuleBody):
    rule = alert_engine.add_rule(body.model_dump())
    return {"status": "ok", "rule": rule}


@router.patch("/rules/{rule_id}")
async def patch_rule(rule_id: str, body: RuleUpdateBody):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    rule = alert_engine.update_rule(rule_id, updates)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    return {"status": "ok", "rule": rule}


@router.delete("/rules/{rule_id}")
async def remove_rule(rule_id: str):
    if not alert_engine.delete_rule(rule_id):
        raise HTTPException(status_code=404, detail="Rule not found")
    return {"status": "ok", "deleted": rule_id}


@router.post("/test-email")
async def test_email():
    from models.convergence import compute_convergence
    from journal import journal_store

    ok = send_test_email()
    conv = await compute_convergence(ticker="SPY", days=90, horizon="medium")
    entry = journal_store.create_entry(
        ticker="SPY",
        horizon="medium",
        trigger="alert",
        note="Test alert email da Settings",
        tags=["test"],
        convergence_snapshot=conv,
        model_snapshots=conv.get("model_snapshots"),
    )
    return {
        "status": "ok",
        "sent": ok,
        "journal_entry_id": entry["id"],
        "message": "Email inviata" if ok else "SMTP non configurato — journal entry creata comunque",
    }


@router.put("/email-settings")
async def update_email_settings(body: EmailSettingsBody):
    email = body.email_to.strip()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Email non valida")
    _update_env_var("ALERT_EMAIL_TO", email)
    return {"status": "ok", "email_to": email}


@router.post("/run-checks")
async def run_checks_now():
    """Manually trigger alert evaluation (for testing)."""
    result = await alert_engine.run_alert_checks()
    return {"status": "ok", **result}
