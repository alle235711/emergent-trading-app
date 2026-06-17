"""
geometry_guard.py — anchor-presence checks and degraded payloads for geometry models.
"""

from __future__ import annotations

from typing import Any, Dict, List

PRIMARY_ANCHOR_ERROR = "Dati storici insufficienti per l'asset primario"


def anchor_in_labels(anchor: str, labels: List[str]) -> bool:
    """True when the requested primary ticker survived alignment/fetch."""
    a = (anchor or "").strip().upper()
    if not a:
        return False
    return a in {(l or "").strip().upper() for l in labels}


def degraded_flag(error: str = PRIMARY_ANCHOR_ERROR) -> Dict[str, Any]:
    return {"degraded": True, "error": error, "warnings": [error]}


def resolve_peers_safe(
    ticker: str,
    n_peers: int = 10,
    *,
    large: bool = False,
    n_assets: int = 30,
) -> tuple[List[str], str | None]:
    """
    Resolve peer basket; on failure return anchor-only list + error message
    so geometry models can emit a degraded payload instead of raising.
    """
    from utils.peer_resolver import resolve_large_universe, resolve_peers

    sym = (ticker or "SPY").strip().upper()
    try:
        if large:
            return resolve_large_universe(sym, n_assets=n_assets), None
        return resolve_peers(sym, n_peers=n_peers), None
    except ValueError as exc:
        return [sym], str(exc)
