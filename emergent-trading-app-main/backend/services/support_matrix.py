"""
support_matrix.py
-----------------
Core quantitative engine: Support/Resistance Probability Matrix.

Dipendenze: numpy, scipy, lifelines
Nessuna dipendenza da FastAPI o dal layer HTTP.
"""

import numpy as np
from scipy.signal import argrelextrema
from scipy.cluster.hierarchy import linkage, fcluster
from scipy.spatial.distance import pdist
from scipy.stats import bootstrap as scipy_bootstrap
from lifelines import KaplanMeierFitter


# ============================================================
# STEP 1 — Peak Detection
# ============================================================

def detect_levels(
    highs: np.ndarray,
    lows: np.ndarray,
    w: int = 10
) -> np.ndarray:
    """
    Individua massimi e minimi locali di ordine w.
    Restituisce array 1D dei candidati livelli grezzi.
    """
    idx_max = argrelextrema(highs, np.greater_equal, order=w)[0]
    idx_min = argrelextrema(lows,  np.less_equal,    order=w)[0]
    candidates = np.concatenate([highs[idx_max], lows[idx_min]])
    return np.unique(candidates)


# ============================================================
# STEP 2 — Clustering volume-weighted (distanza relativa)
# ============================================================

def cluster_levels(
    candidates:  np.ndarray,
    epsilon:     float = 0.015,
    prices:      np.ndarray | None = None,
    volumes:     np.ndarray | None = None,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Aggrega i candidati in K livelli rappresentativi.

    Se prices e volumes sono forniti, il rappresentante di ogni
    cluster è la media ponderata per Volume Profile: per ogni
    candidato p_c si cerca l'indice temporale t* = argmin|S_t - p_c|
    e si usa V_{t*} come peso. Questo implementa una versione
    discreta del Volume-Weighted Price Level (VWPL).

    Restituisce
    -----------
    levels   : (K,) float64  — livelli rappresentativi ordinati
    strengths: (K,) float64  — volume cumulato normalizzato per cluster
                               (proxy della "forza" del livello)
    """
    if len(candidates) < 2:
        ones = np.ones(len(candidates))
        return candidates, ones / max(ones.sum(), 1)

    dist_mat = pdist(
        candidates.reshape(-1, 1),
        metric=lambda u, v: abs(u[0] - v[0]) / (0.5 * (u[0] + v[0]))
    )
    Z      = linkage(dist_mat, method='complete')
    labels = fcluster(Z, t=epsilon, criterion='distance')

    levels, strengths = [], []

    for k in np.unique(labels):
        mask            = labels == k
        cluster_prices  = candidates[mask]

        if prices is not None and volumes is not None:
            # Per ogni candidato nel cluster, trova l'indice
            # temporale più vicino nella serie prezzi
            weights = np.array([
                volumes[int(np.argmin(np.abs(prices - p)))]
                for p in cluster_prices
            ], dtype=np.float64)

            total_w = weights.sum()
            if total_w > 0:
                level = float(np.average(cluster_prices, weights=weights))
                # Forza = volume cumulato del cluster (somma dei pesi)
                strength = float(total_w)
            else:
                level    = float(np.median(cluster_prices))
                strength = 1.0
        else:
            level    = float(np.median(cluster_prices))
            strength = float(len(cluster_prices))  # fallback: frequenza

        levels.append(level)
        strengths.append(strength)

    levels_arr    = np.array(levels)
    strengths_arr = np.array(strengths)

    # Normalizza strengths in [0, 1]
    s_max = strengths_arr.max()
    if s_max > 0:
        strengths_arr = strengths_arr / s_max

    # Ordina per prezzo
    order         = np.argsort(levels_arr)
    return levels_arr[order], strengths_arr[order]
# ============================================================
# STEP 3 — Touch Events
# ============================================================

def find_touches(
    prices: np.ndarray,
    level: float,
    delta: float = 0.005,
    w_cool: int = 5
) -> np.ndarray:
    """
    Restituisce gli indici temporali dei tocchi al livello,
    con cooldown w_cool per evitare doppi conteggi.
    """
    in_band    = np.abs(prices - level) <= delta * level
    touches    = []
    last_touch = -w_cool - 1

    for t in np.where(in_band)[0]:
        if t - last_touch > w_cool:
            touches.append(t)
            last_touch = t

    return np.array(touches, dtype=int)


# ============================================================
# STEP 4 — Classificazione Esiti Y_k(tau, T)
# ============================================================

def classify_outcomes(
    prices:     np.ndarray,
    touches:    np.ndarray,
    level:      float,
    delta:      float,
    T_horizons: np.ndarray
) -> np.ndarray:
    """
    Output: matrice (n_touches, m_horizons) con valori {0, 1, NaN}.
    1 = rimbalzo, 0 = rottura, NaN = censurato (prezzo mai uscito dalla banda)
    """
    n, m = len(touches), len(T_horizons)
    Y    = np.full((n, m), np.nan)
    N    = len(prices)

    band_lo = level * (1 - delta)
    band_hi = level * (1 + delta)

    for i, tau in enumerate(touches):
        for j, T in enumerate(T_horizons):
            t_end = tau + int(T)
            if t_end >= N:
                continue  # censurato per fine serie

            window = prices[tau : t_end + 1]
            up     = np.any(window > band_hi)
            down   = np.any(window < band_lo)

            if up and not down:
                Y[i, j] = 1.0
            elif down and not up:
                Y[i, j] = 0.0
            elif up and down:
                first_up   = np.argmax(window > band_hi)
                first_down = np.argmax(window < band_lo)
                Y[i, j]   = 1.0 if first_up < first_down else 0.0
            # else: NaN — censurato

    return Y


# ============================================================
# STEP 5 — Bootstrap BCa
# ============================================================

def estimate_probability_bca(
    Y_col: np.ndarray,
    B:     int   = 2000,
    alpha: float = 0.05
) -> tuple[float, tuple[float, float], int]:
    """
    Stima P_hat e CI BCa per una singola colonna di esiti.
    Filtra i NaN prima del bootstrap.
    Ritorna (p_hat, (ci_low, ci_high), n_valid)
    """
    valid = Y_col[~np.isnan(Y_col)]
    if len(valid) < 2:
        return np.nan, (np.nan, np.nan), 0

    p_hat = float(np.mean(valid))
    rng   = np.random.default_rng(42)

    res = scipy_bootstrap(
        (valid,),
        statistic=np.mean,
        n_resamples=B,
        confidence_level=1 - alpha,
        method='BCa',
        random_state=rng
    )
    ci = (
        float(res.confidence_interval.low),
        float(res.confidence_interval.high)
    )
    return p_hat, ci, int(len(valid))


# ============================================================
# STEP 6 — Kaplan-Meier (correzione per censura)
# ============================================================

def kaplan_meier_bounce_prob(
    prices:    np.ndarray,
    touches:   np.ndarray,
    level:     float,
    delta:     float,
    T_horizon: int
) -> float:
    """
    Stima la probabilità di rimbalzo corretta per censura
    via stimatore di Kaplan-Meier.
    """
    band_lo  = level * (1 - delta)
    band_hi  = level * (1 + delta)
    N        = len(prices)

    durations, events, bounce_flags = [], [], []

    for tau in touches:
        exit_t    = None
        is_bounce = False

        for s in range(1, T_horizon + 1):
            if tau + s >= N:
                break
            p = prices[tau + s]
            if p > band_hi:
                exit_t    = s
                is_bounce = True
                break
            elif p < band_lo:
                exit_t    = s
                is_bounce = False
                break

        if exit_t is not None:
            durations.append(exit_t)
            events.append(1)
            bounce_flags.append(float(is_bounce))
        else:
            durations.append(T_horizon)
            events.append(0)
            bounce_flags.append(np.nan)

    if len(durations) < 2:
        return np.nan

    kmf = KaplanMeierFitter()
    kmf.fit(durations, events, timeline=np.arange(T_horizon + 1))

    prob_exit = float(
        1 - kmf.survival_function_at_times(T_horizon).values[0]
    )

    # proporzione di uscite che sono rimbalzi (esclude censurati)
    bounce_arr    = np.array(bounce_flags)
    valid_bounces = bounce_arr[~np.isnan(bounce_arr)]
    bounce_rate   = float(np.mean(valid_bounces)) if len(valid_bounces) > 0 else 0.5

    return float(prob_exit * bounce_rate)


# ============================================================
# STEP 7 — Decadimento Temporale
# ============================================================

def apply_temporal_decay(
    P_matrix:         np.ndarray,
    touches_per_level: list[np.ndarray],
    t_now_idx:        int
) -> np.ndarray:
    """
    D_{k,j} = P_{k,j} * exp(-lambda_k * delta_tau_k)
    lambda_k = log(2) / mediana_inter_tocco_k
    """
    D = P_matrix.copy()

    for k, touches in enumerate(touches_per_level):
        if len(touches) < 2:
            continue
        inter_touch  = np.diff(touches).astype(float)
        half_life    = float(np.median(inter_touch))
        lambda_k     = np.log(2) / max(half_life, 1.0)
        delta_tau    = float(t_now_idx - touches[-1])
        decay_factor = float(np.exp(-lambda_k * delta_tau))
        D[k, :]     *= decay_factor

    return D



# ============================================================
# STEP 8 — ORCHESTRATORE PRINCIPALE
# ============================================================

def build_support_probability_matrix(
    prices:      np.ndarray,
    highs:       np.ndarray,
    lows:        np.ndarray,
    T_horizons:  np.ndarray,
    volumes:     np.ndarray | None = None,
    w:           int   = 10,
    epsilon:     float = 0.015,
    delta:       float = 0.005,
    w_cool:      int   = 5,
    B:           int   = 2000,
    alpha:       float = 0.05,
    min_touches: int   = 3
) -> dict:
    """
    Entry point principale del modulo.

    Input
    -----
    prices     : (N,)  float64 — prezzi di chiusura
    highs      : (N,)  float64 — prezzi High
    lows       : (N,)  float64 — prezzi Low
    T_horizons : (m,)  int32   — orizzonti in giorni es. [1,3,5,10,20]
    volumes    : (N,)  float64 — volumi giornalieri (opzionale)
                                 se forniti attiva il VWPL clustering

    Output (dict)
    -------------
    levels      : (K,)    livelli S/R (volume-weighted se volumes forniti)
    level_strength:(K,)   forza relativa del livello [0,1] (vol. cumulato)
    P           : (K, m)  probabilità rimbalzo (bootstrap BCa)
    CI_low      : (K, m)  CI BCa lower bound
    CI_high     : (K, m)  CI BCa upper bound
    P_KM        : (K, m)  probabilità KM (censura-corretta)
    P_decay     : (K, m)  P con decadimento temporale
    n_touches   : (K,)    numero tocchi per livello
    risk_score  : (K,)    segnale di rischio aggregato [0,1]
    T_horizons  : (m,)    orizzonti (echo)
    """
    m = len(T_horizons)

    # --- Peak detection ---
    candidates = detect_levels(highs, lows, w)

    # --- Clustering volume-weighted ---
    levels, level_strength = cluster_levels(
        candidates,
        epsilon,
        prices  = prices,
        volumes = volumes,
    )
    K = len(levels)

    # --- Allocazione output ---
    P        = np.full((K, m), np.nan)
    CI_low   = np.full((K, m), np.nan)
    CI_high  = np.full((K, m), np.nan)
    P_KM     = np.full((K, m), np.nan)
    n_touch  = np.zeros(K, dtype=int)
    all_touches: list[np.ndarray] = []

    for k, lk in enumerate(levels):
        touches = find_touches(prices, lk, delta, w_cool)
        all_touches.append(touches)

        if len(touches) < min_touches:
            continue

        n_touch[k] = len(touches)
        Y = classify_outcomes(prices, touches, lk, delta, T_horizons)

        for j in range(m):
            p_hat, ci, _ = estimate_probability_bca(Y[:, j], B, alpha)
            P[k, j]       = p_hat
            CI_low[k, j]  = ci[0]
            CI_high[k, j] = ci[1]

            P_KM[k, j] = kaplan_meier_bounce_prob(
                prices, touches, lk, delta, int(T_horizons[j])
            )

    # --- Decadimento temporale ---
    P_decay = apply_temporal_decay(P, all_touches, len(prices) - 1)

    # --- Risk Score volume-aware ---
    # Incorpora la forza del livello (volume) nel risk score:
    # rho_k = (1 - P_decay_k,j*) * (n_k / n_max) * strength_k
    j_star = m // 2
    n_max  = max(int(n_touch.max()), 1)

    risk_score = np.array([
        (1 - (P_decay[k, j_star] if not np.isnan(P_decay[k, j_star]) else 0.5))
        * (n_touch[k] / n_max)
        * float(level_strength[k])          # ← peso volumetrico
        for k in range(K)
    ])

    return {
        "levels":         levels.tolist(),
        "level_strength": level_strength.tolist(),
        "P":              np.where(np.isnan(P),       None, P).tolist(),
        "CI_low":         np.where(np.isnan(CI_low),  None, CI_low).tolist(),
        "CI_high":        np.where(np.isnan(CI_high), None, CI_high).tolist(),
        "P_KM":           np.where(np.isnan(P_KM),    None, P_KM).tolist(),
        "P_decay":        np.where(np.isnan(P_decay), None, P_decay).tolist(),
        "n_touches":      n_touch.tolist(),
        "risk_score":     risk_score.tolist(),
        "T_horizons":     T_horizons.tolist(),
    }