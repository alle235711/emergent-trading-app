"""
journal_store.py — Persistent analysis journal (JSON file storage).
Entries link convergence snapshots, model data, alerts, and user notes.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

ROOT = Path(__file__).resolve().parent
ENTRIES_PATH = ROOT / "entries.json"


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")


def _load_entries() -> List[Dict[str, Any]]:
    if ENTRIES_PATH.exists():
        try:
            data = json.loads(ENTRIES_PATH.read_text(encoding="utf-8"))
            return data if isinstance(data, list) else []
        except Exception:
            pass
    return []


def _save_entries(entries: List[Dict[str, Any]]) -> None:
    ENTRIES_PATH.parent.mkdir(parents=True, exist_ok=True)
    ENTRIES_PATH.write_text(json.dumps(entries, indent=2, default=str), encoding="utf-8")


def create_entry(
    ticker: str,
    horizon: str = "medium",
    trigger: str = "manual",
    note: str = "",
    tags: Optional[List[str]] = None,
    convergence_snapshot: Optional[Dict[str, Any]] = None,
    model_snapshots: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Create a new journal entry and persist it."""
    conv = convergence_snapshot or {}
    snaps = model_snapshots or conv.get("model_snapshots") or {}

    entry = {
        "id": str(uuid.uuid4()),
        "created_at": _now_iso(),
        "ticker": (ticker or "SPY").strip().upper(),
        "horizon": horizon,
        "trigger": trigger,
        "convergence_snapshot": {
            k: v for k, v in conv.items() if k != "model_snapshots"
        },
        "model_snapshots": snaps,
        "note": note or "",
        "tags": tags or [],
        "outcome": None,
    }

    entries = _load_entries()
    entries.insert(0, entry)
    _save_entries(entries)
    return entry


def list_entries(
    ticker: Optional[str] = None,
    trigger: Optional[str] = None,
    tag: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """List entries newest first, with optional filters."""
    entries = _load_entries()

    if ticker:
        sym = ticker.strip().upper()
        entries = [e for e in entries if e.get("ticker") == sym]
    if trigger:
        entries = [e for e in entries if e.get("trigger") == trigger]
    if tag:
        entries = [e for e in entries if tag in (e.get("tags") or [])]
    if date_from:
        entries = [e for e in entries if (e.get("created_at") or "") >= date_from]
    if date_to:
        entries = [e for e in entries if (e.get("created_at") or "") <= date_to]

    return entries


def get_entry(entry_id: str) -> Optional[Dict[str, Any]]:
    for e in _load_entries():
        if e.get("id") == entry_id:
            return e
    return None


def update_entry(
    entry_id: str,
    note: Optional[str] = None,
    tags: Optional[List[str]] = None,
    outcome: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    entries = _load_entries()
    for i, e in enumerate(entries):
        if e.get("id") == entry_id:
            if note is not None:
                entries[i]["note"] = note
            if tags is not None:
                entries[i]["tags"] = tags
            if outcome is not None:
                entries[i]["outcome"] = outcome
            _save_entries(entries)
            return entries[i]
    return None


def delete_entry(entry_id: str) -> bool:
    entries = _load_entries()
    new_entries = [e for e in entries if e.get("id") != entry_id]
    if len(new_entries) == len(entries):
        return False
    _save_entries(new_entries)
    return True


def export_csv(entries: Optional[List[Dict[str, Any]]] = None) -> str:
    """Export entries as CSV string."""
    rows = entries if entries is not None else list_entries()
    cols = [
        "date", "ticker", "trigger", "convergence_score",
        "sheaf", "clique", "affine", "hodge", "quantum",
        "note", "outcome", "tags",
    ]
    lines = [",".join(cols)]

    for e in rows:
        conv = e.get("convergence_snapshot") or {}
        sigs = conv.get("signals") or {}
        tags_str = ";".join(e.get("tags") or [])
        note = (e.get("note") or "").replace('"', '""').replace("\n", " ")

        def _raw(model: str) -> str:
            s = sigs.get(model) or {}
            v = s.get("raw")
            return "" if v is None else str(v)

        row = [
            e.get("created_at", ""),
            e.get("ticker", ""),
            e.get("trigger", ""),
            str(conv.get("convergence_score", "")),
            _raw("sheaf"), _raw("clique"), _raw("affine"), _raw("hodge"), _raw("quantum"),
            f'"{note}"',
            e.get("outcome") or "",
            f'"{tags_str}"',
        ]
        lines.append(",".join(row))

    return "\n".join(lines)
