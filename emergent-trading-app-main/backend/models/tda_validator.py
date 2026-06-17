# FILE: backend/models/tda_validator.py
# Dipendenze: numpy only
# Chiamato da server.py PRIMA di qualsiasi calcolo TDA

import numpy as np
from dataclasses import dataclass, field
from typing import Optional


# ─────────────────────────────────────────────────────────────
# STRUTTURA DATI RISULTATO VALIDAZIONE
# ─────────────────────────────────────────────────────────────

@dataclass
class ValidationResult:
    valid:       bool
    errors:      list = field(default_factory=list)
    warnings:    list = field(default_factory=list)
    prices_clean: Optional[np.ndarray] = None  # serie sanificata

    def add_error(self, code: str, message: str, detail: str = "",
                  recoverable: bool = False):
        self.errors.append({
            "code":        code,
            "layer":       "input_validation",
            "message":     message,
            "detail":      detail,
            "recoverable": recoverable
        })
        self.valid = False

    def add_warning(self, code: str, message: str, detail: str = ""):
        self.warnings.append({
            "code":    code,
            "message": message,
            "detail":  detail
        })

    def to_response(self) -> dict:
        return {
            "valid":    self.valid,
            "errors":   self.errors,
            "warnings": self.warnings
        }


# ─────────────────────────────────────────────────────────────
# VALIDATORI PER PARAMETRI IPERGEOMETRICI
# ─────────────────────────────────────────────────────────────

def validate_hyperparams(d: int, tau: int, W: int,
                         n_prices: int) -> ValidationResult:
    """
    Verifica la consistenza geometrica dei parametri di embedding
    rispetto alla lunghezza della serie disponibile.

    Condizione necessaria per delay embedding:
      N_eff = n_prices - (d-1)*tau  ≥  W  ≥  d*tau + 1

    Se violata, il tensore di embedding è vuoto o troppo corto
    per costruire la filtrazione di Vietoris-Rips.
    """
    vr = ValidationResult(valid=True)

    # Guardie sui tipi
    for name, val in [("d", d), ("tau", tau), ("W", W)]:
        if not isinstance(val, int) or val < 1:
            vr.add_error(
                code="PARAM_TYPE_ERROR",
                message=f"Parametro '{name}' deve essere intero ≥ 1.",
                detail=f"Ricevuto: {val} (tipo: {type(val).__name__})",
                recoverable=True
            )

    if not vr.valid:
        return vr

    # Condizione embedding non vuoto
    N_eff = n_prices - (d - 1) * tau
    if N_eff <= 0:
        vr.add_error(
            code="EMBEDDING_EMPTY",
            message="La serie è troppo corta per il delay embedding scelto.",
            detail=(f"N={n_prices}, d={d}, tau={tau} → "
                    f"N_eff = N-(d-1)*tau = {N_eff} ≤ 0. "
                    f"Riduci d o tau, oppure usa una finestra temporale più lunga."),
            recoverable=True
        )

    # Condizione window ≤ N_eff
    if W > N_eff:
        vr.add_error(
            code="WINDOW_TOO_LARGE",
            message="La sliding window W supera il numero di punti embedded.",
            detail=(f"W={W} > N_eff={N_eff}. "
                    f"Imposta W ≤ {N_eff} oppure riduci d/tau."),
            recoverable=True
        )

    # Condizione minima per omologia (almeno d+2 punti per H_1)
    min_pts_for_homology = max(d + 2, 5)
    if W < min_pts_for_homology:
        vr.add_error(
            code="WINDOW_TOO_SMALL",
            message=f"Window W={W} troppo piccola per calcolare H_1.",
            detail=(f"Con d={d}, servono almeno {min_pts_for_homology} punti "
                    f"nella window per costruire il complesso di Vietoris-Rips."),
            recoverable=True
        )

    # Warning: d alto senza abbastanza dati
    if d >= 6 and N_eff < 200:
        vr.add_warning(
            code="HIGH_DIM_FEW_POINTS",
            message=f"d={d} elevato con N_eff={N_eff} punti: risultati instabili.",
            detail="Con d≥6 è consigliabile N_eff≥500 per stime topologiche robuste."
        )

    # Warning: tau troppo grande
    if tau > n_prices // 10:
        vr.add_warning(
            code="TAU_LARGE",
            message=f"tau={tau} è >10% della serie: possibile perdita di struttura.",
            detail="Un tau eccessivo può distruggere la continuità della traiettoria embedded."
        )

    return vr


# ─────────────────────────────────────────────────────────────
# VALIDATORI PER LA SERIE TEMPORALE DEI PREZZI
# ─────────────────────────────────────────────────────────────

# Soglie minime per ciascun modulo
MIN_PRICES = {
    "fnn":    50,    # AMI + FNN richiedono almeno 50 punti
    "mapper": 100,   # Embedding + copertura: almeno 100
    "tda":    150,   # Sliding window TDA: almeno 150
}

def validate_prices(prices: np.ndarray,
                    module: str = "tda") -> ValidationResult:
    """
    Validazione completa della serie prezzi in ingresso.
    Copre: tipo, lunghezza, NaN/Inf, valori negativi,
    stazionarietà grossolana, varianza zero.
    """
    vr = ValidationResult(valid=True)

    # ── 1. Tipo e forma
    if not isinstance(prices, np.ndarray):
        try:
            prices = np.asarray(prices, dtype=np.float64)
        except Exception as e:
            vr.add_error(
                code="TYPE_ERROR",
                message="prices non è convertibile in np.ndarray float64.",
                detail=str(e),
                recoverable=False
            )
            return vr

    if prices.ndim != 1:
        vr.add_error(
            code="SHAPE_ERROR",
            message=f"prices deve essere 1D, ricevuto shape={prices.shape}.",
            detail="Usa prices.ravel() o prices.squeeze() prima di passare la serie.",
            recoverable=True
        )
        return vr

    # ── 2. Lunghezza minima
    min_len = MIN_PRICES.get(module, 100)
    if len(prices) < min_len:
        vr.add_error(
            code="INSUFFICIENT_DATA",
            message=(f"Serie troppo corta per il modulo '{module}': "
                     f"{len(prices)} punti < minimo {min_len}."),
            detail=(f"Aumenta il periodo di download (es. '1y' invece di '1mo') "
                    f"o usa un intervallo più fine."),
            recoverable=True
        )
        return vr

    # ── 3. NaN e Inf
    n_nan = int(np.sum(np.isnan(prices)))
    n_inf = int(np.sum(np.isinf(prices)))

    if n_inf > 0:
        vr.add_error(
            code="INF_VALUES",
            message=f"Serie contiene {n_inf} valori Inf.",
            detail="Controlla la pipeline yfinance — possibili errori nel download.",
            recoverable=False
        )

    if n_nan > 0:
        nan_pct = n_nan / len(prices)
        if nan_pct > 0.1:   # > 10% NaN → errore bloccante
            vr.add_error(
                code="EXCESSIVE_NAN",
                message=f"Serie contiene {n_nan} NaN ({nan_pct:.1%}) — troppi per interpolare.",
                detail="Usa un ticker diverso o un periodo con dati più completi.",
                recoverable=False
            )
        else:
            # NaN < 10% → warning + interpolazione lineare automatica
            vr.add_warning(
                code="NAN_INTERPOLATED",
                message=f"{n_nan} NaN ({nan_pct:.1%}) interpolati linearmente.",
                detail="Verifica la qualità dei dati sorgente."
            )
            # Sanificazione in-place
            idx  = np.arange(len(prices))
            mask = ~np.isnan(prices)
            prices = np.interp(idx, idx[mask], prices[mask])

    if not vr.valid:
        return vr

    # ── 4. Prezzi non positivi (log non definito)
    if np.any(prices <= 0):
        n_neg = int(np.sum(prices <= 0))
        vr.add_error(
            code="NON_POSITIVE_PRICES",
            message=f"Serie contiene {n_neg} valori ≤ 0: log-transform impossibile.",
            detail="I prezzi devono essere strettamente positivi. "
                   "Controlla il ticker o filtra gli zeri.",
            recoverable=False
        )

    # ── 5. Varianza zero (serie costante — embedding degenere)
    if np.std(prices) < 1e-10:
        vr.add_error(
            code="ZERO_VARIANCE",
            message="Serie a varianza zero: embedding degenere.",
            detail="Tutti i prezzi sono identici. La serie non contiene informazione.",
            recoverable=False
        )

    # ── 6. Warning: possibile non-stazionarietà grossolana
    #    (check rapido senza ADF test — evita scipy.stats in validazione)
    mid     = len(prices) // 2
    mean_h1 = np.mean(prices[:mid])
    mean_h2 = np.mean(prices[mid:])
    rel_drift = abs(mean_h2 - mean_h1) / (mean_h1 + 1e-10)
    if rel_drift > 0.3:
        vr.add_warning(
            code="POSSIBLE_NONSTATIONARITY",
            message=f"Drift rilevato tra prima e seconda metà ({rel_drift:.1%}).",
            detail="Considera di lavorare sui log-ritorni invece che sui prezzi grezzi. "
                   "Il delay embedding assume una certa stazionarietà locale."
        )

    # ── 7. Warning: outliers estremi (> 5 sigma nei log-ritorni)
    log_r   = np.diff(np.log(prices + 1e-10))
    sigma   = np.std(log_r)
    n_out   = int(np.sum(np.abs(log_r) > 5 * sigma))
    if n_out > 0:
        vr.add_warning(
            code="EXTREME_OUTLIERS",
            message=f"{n_out} ritorni > 5σ rilevati.",
            detail="Possibili spike di dati o eventi estremi. "
                   "Il modello TDA è robusto per costruzione, ma verifica i dati."
        )

    vr.prices_clean = prices
    return vr


# ─────────────────────────────────────────────────────────────
# VALIDATORE PER PARAMETRI MAPPER
# ─────────────────────────────────────────────────────────────

def validate_mapper_params(n_cubes: int,
                            overlap_pct: float,
                            filter_type: str) -> ValidationResult:
    vr = ValidationResult(valid=True)

    if n_cubes < 2 or n_cubes > 50:
        vr.add_error(
            code="N_CUBES_OUT_OF_RANGE",
            message=f"n_cubes={n_cubes} fuori range [2, 50].",
            detail="Con n_cubes<2 la copertura è triviale; >50 frammentazione eccessiva.",
            recoverable=True
        )

    if not (0.1 <= overlap_pct <= 0.9):
        vr.add_error(
            code="OVERLAP_OUT_OF_RANGE",
            message=f"overlap_pct={overlap_pct} fuori range [0.1, 0.9].",
            detail="overlap<0.1 → nodi disconnessi; overlap>0.9 → grafo degenere unico nodo.",
            recoverable=True
        )

    valid_filters = {"pca1", "density", "variance"}
    if filter_type not in valid_filters:
        vr.add_error(
            code="INVALID_FILTER",
            message=f"filter_type='{filter_type}' non riconosciuto.",
            detail=f"Valori accettati: {valid_filters}",
            recoverable=True
        )

    return vr


# ─────────────────────────────────────────────────────────────
# WRAPPER SICURO PER CHIAMATE AI MODULI TDA
# ─────────────────────────────────────────────────────────────

def safe_run(fn, *args, module: str = "tda", **kwargs) -> dict:
    """
    Esegue fn(*args, **kwargs) con gestione eccezioni completa.
    Ritorna sempre un dict con "ok" bool + payload o errore.

    Da usare in server.py come:
        result = safe_run(run_tda_local_neighborhoods,
                          prices, d=d, tau=tau, W=W,
                          module="tda")
        if not result["ok"]:
            return JSONResponse(status_code=422, content=result)
    """
    try:
        output = fn(*args, **kwargs)
        return {"ok": True, "data": output}

    except MemoryError:
        return {
            "ok": False,
            "error": {
                "code":        "MEMORY_ERROR",
                "layer":       "compute",
                "message":     "Memoria insufficiente per il calcolo TDA.",
                "detail":      (f"Riduci W, d, o usa un periodo più corto. "
                                f"Modulo: {module}"),
                "recoverable": True
            }
        }

    except ValueError as e:
        return {
            "ok": False,
            "error": {
                "code":        "VALUE_ERROR",
                "layer":       "compute",
                "message":     "Errore nei valori durante il calcolo.",
                "detail":      str(e),
                "recoverable": True
            }
        }

    except Exception as e:
        # Cattura errori ripser (nuvola degenere, matrice distanza singolare)
        err_str = str(e).lower()
        if "ripser" in err_str or "persistence" in err_str:
            return {
                "ok": False,
                "error": {
                    "code":        "RIPSER_ERROR",
                    "layer":       "compute",
                    "message":     "Il calcolo di omologia persistente è fallito.",
                    "detail":      (f"La nuvola di punti potrebbe essere degenere "
                                    f"(tutti i punti coincidenti o N<3). "
                                    f"Errore: {str(e)}"),
                    "recoverable": True
                }
            }
        return {
            "ok": False,
            "error": {
                "code":        "UNKNOWN_ERROR",
                "layer":       "compute",
                "message":     f"Errore imprevisto nel modulo '{module}'.",
                "detail":      str(e),
                "recoverable": False
            }
        }