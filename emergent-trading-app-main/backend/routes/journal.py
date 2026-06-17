"""Analysis journal API."""

from typing import List, Literal, Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

from journal import journal_store
from models.convergence import compute_convergence

router = APIRouter(prefix="/journal", tags=["journal"])


class CreateEntryBody(BaseModel):
    ticker: str = "SPY"
    horizon: str = "medium"
    note: str = ""
    tags: List[str] = Field(default_factory=list)
    trigger: Literal["manual", "alert", "auto_threshold"] = "manual"
    include_snapshot: bool = True


class UpdateEntryBody(BaseModel):
    note: Optional[str] = None
    tags: Optional[List[str]] = None
    outcome: Optional[Literal["Confermato", "Sbagliato", "Neutro"]] = None


@router.post("/entry")
async def create_entry(body: CreateEntryBody):
    conv = None
    if body.include_snapshot:
        conv = await compute_convergence(
            ticker=body.ticker, days=90, horizon=body.horizon,
        )
    entry = journal_store.create_entry(
        ticker=body.ticker,
        horizon=body.horizon,
        trigger=body.trigger,
        note=body.note,
        tags=body.tags,
        convergence_snapshot=conv,
        model_snapshots=conv.get("model_snapshots") if conv else None,
    )
    return {"status": "ok", "entry": entry}


@router.get("/entries")
async def list_entries(
    ticker: Optional[str] = Query(None),
    trigger: Optional[str] = Query(None),
    tag: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
):
    entries = journal_store.list_entries(
        ticker=ticker, trigger=trigger, tag=tag,
        date_from=date_from, date_to=date_to,
    )
    # Summary view for list (omit heavy snapshots)
    summaries = []
    for e in entries:
        conv = e.get("convergence_snapshot") or {}
        summaries.append({
            "id": e["id"],
            "created_at": e["created_at"],
            "ticker": e["ticker"],
            "horizon": e.get("horizon"),
            "trigger": e["trigger"],
            "convergence_score": conv.get("convergence_score"),
            "convergence_label": conv.get("convergence_label"),
            "note": e.get("note", ""),
            "tags": e.get("tags", []),
            "outcome": e.get("outcome"),
        })
    return {"status": "ok", "entries": summaries, "count": len(summaries)}


@router.get("/entry/{entry_id}")
async def get_entry(entry_id: str):
    entry = journal_store.get_entry(entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"status": "ok", "entry": entry}


@router.patch("/entry/{entry_id}")
async def update_entry(entry_id: str, body: UpdateEntryBody):
    entry = journal_store.update_entry(
        entry_id,
        note=body.note,
        tags=body.tags,
        outcome=body.outcome,
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"status": "ok", "entry": entry}


@router.delete("/entry/{entry_id}")
async def delete_entry(entry_id: str):
    if not journal_store.delete_entry(entry_id):
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"status": "ok", "deleted": entry_id}


@router.get("/export/json")
async def export_json(ticker: Optional[str] = Query(None)):
    entries = journal_store.list_entries(ticker=ticker)
    return {"status": "ok", "entries": entries}


@router.get("/export/csv")
async def export_csv(ticker: Optional[str] = Query(None)):
    entries = journal_store.list_entries(ticker=ticker)
    csv_text = journal_store.export_csv(entries)
    return PlainTextResponse(
        content=csv_text,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=journal_export.csv"},
    )
