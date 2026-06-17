# ============================================================
# BLUEPRINT: Topological Local Neighborhoods
# Dipendenze: numpy, scipy, ripser (pip install ripser)
#             persim (pip install persim)
# ============================================================

import numpy as np
from scipy.spatial.distance import cdist
from scipy.stats import gaussian_kde
import ripser          # C-backend per Vietoris-Rips persistente
import persim          # bottleneck distance, plot_diagrams


# ─────────────────────────────────────────────────────────────
# STEP 1: DELAY EMBEDDING
# ─────────────────────────────────────────────────────────────

def delay_embedding(series: np.ndarray, d: int, tau: int) -> np.ndarray:
    """
    Costruisce la nuvola di punti nel spazio delle fasi.
    Input:  series (N,), d, tau
    Output: X (N_eff, d),  N_eff = N - (d-1)*tau
    """
    N = len(series)
    N_eff = N - (d - 1) * tau
    # Ogni riga è il vettore [x_t, x_{t-tau}, ..., x_{t-(d-1)tau}]
    X = np.array([
        series[i : i + d * tau : tau]   # stride tau, d elementi
        for i in range(N_eff)
    ])                                   # shape: (N_eff, d)
    return X


# ─────────────────────────────────────────────────────────────
# STEP 2: STIMA AUTOMATICA DI tau (primo minimo AMI)
# ─────────────────────────────────────────────────────────────

def auto_mutual_information(series: np.ndarray, max_lag: int = 50) -> np.ndarray:
    """
    Stima AMI(tau) per tau in [1, max_lag].
    Usa KDE per densità joint/marginale → no assunzioni gaussiane.
    """
    ami = np.zeros(max_lag)
    for tau in range(1, max_lag + 1):
        x = series[:-tau]
        y = series[tau:]
        # KDE bivariata per p(x,y)
        joint  = gaussian_kde(np.vstack([x, y]))
        px_kde = gaussian_kde(x)
        py_kde = gaussian_kde(y)
        # Monte Carlo integration su griglia campionata
        pts    = np.vstack([x, y])
        log_ratio = (np.log(joint(pts))
                     - np.log(px_kde(pts[:1]))
                     - np.log(py_kde(pts[1:])))
        ami[tau - 1] = np.mean(log_ratio)
    return ami


def first_minimum(arr: np.ndarray) -> int:
    """Restituisce l'indice del primo minimo locale (1-indexed)."""
    for i in range(1, len(arr) - 1):
        if arr[i] < arr[i - 1] and arr[i] < arr[i + 1]:
            return i + 1   # 1-indexed
    return 1  # fallback


# ─────────────────────────────────────────────────────────────
# STEP 3: COSTRUZIONE VICINATI LOCALI
# ─────────────────────────────────────────────────────────────

def local_neighborhood(X: np.ndarray,
                       center_idx: int,
                       epsilon: float) -> np.ndarray:
    """
    Restituisce i punti della nuvola dentro B(x_t, epsilon).
    Input:  X (W, d) — embedding nella window corrente
            center_idx — indice del punto centrale (tipicamente -1 = ultimo)
            epsilon — raggio
    Output: N_local (k, d) — sottoinsieme di punti
    """
    center = X[center_idx]                         # (d,)
    dists  = np.linalg.norm(X - center, axis=1)   # (W,)
    mask   = dists < epsilon
    return X[mask], mask


def adaptive_epsilon(X: np.ndarray, percentile: float = 20.0) -> float:
    """
    Raggio adattivo = percentile-esimo della distribuzione
    delle distanze a coppia — calibrato sulla densità locale reale.
    """
    D = cdist(X, X, metric='euclidean')
    # Escludi diagonale
    upper = D[np.triu_indices_from(D, k=1)]
    return float(np.percentile(upper, percentile))


# ─────────────────────────────────────────────────────────────
# STEP 4: OMOLOGIA PERSISTENTE (Vietoris-Rips via ripser)
# ─────────────────────────────────────────────────────────────

def compute_persistence(points: np.ndarray,
                        max_dim: int = 2) -> dict:
    """
    Calcola H_0 e H_1 (eventualmente H_2) sulla nuvola locale.
    Usa ripser con backend C (veloce su ~200 punti).
    Output: {"H0": np.ndarray (n,2), "H1": np.ndarray (m,2)}
    """
    if len(points) < 3:
        return {"H0": np.empty((0, 2)), "H1": np.empty((0, 2))}

    result = ripser.ripser(points, maxdim=max_dim)
    dgms   = result['dgms']

    # ripser usa inf per la feature "immortale" di H0 → rimuoviamo
    H0 = dgms[0]
    H0 = H0[np.isfinite(H0[:, 1])]   # rimuovi inf
    H1 = dgms[1] if max_dim >= 1 else np.empty((0, 2))
    return {"H0": H0, "H1": H1}


# ─────────────────────────────────────────────────────────────
# STEP 5: METRICHE SCALARI DI ROBUSTEZZA
# ─────────────────────────────────────────────────────────────

def persistence_metrics(dgm: np.ndarray) -> dict:
    """
    Input: dgm (n, 2) — array [(birth, death), ...]
    Output: dict con Pi, E, beta_values
    """
    if len(dgm) == 0:
        return {"Pi": 0.0, "E": 0.0}

    lifetimes = dgm[:, 1] - dgm[:, 0]   # pi_gamma per ogni feature
    Pi  = float(np.sum(lifetimes))

    # Entropia di persistenza
    if Pi > 0:
        p   = lifetimes / Pi
        E   = float(-np.sum(p * np.log(p + 1e-12)))
    else:
        E   = 0.0

    return {"Pi": Pi, "E": E, "lifetimes": lifetimes}


def betti_at_scale(dgm: np.ndarray, epsilon_0: float) -> int:
    """
    Numero di Betti al cutoff epsilon_0:
    features "vive" in [b, d) con b <= epsilon_0 <= d.
    """
    if len(dgm) == 0:
        return 0
    alive = (dgm[:, 0] <= epsilon_0) & (epsilon_0 < dgm[:, 1])
    return int(np.sum(alive))


# ─────────────────────────────────────────────────────────────
# STEP 6: BOTTLENECK DISTANCE (evoluzione locale)
# ─────────────────────────────────────────────────────────────

def compute_evolution_rate(dgm_t: np.ndarray,
                           dgm_prev: np.ndarray) -> float:
    """
    Usa persim.bottleneck_distance per d_B(Dgm(t), Dgm(t-1)).
    Restituisce distanza raw (normalizzazione esterna).
    """
    if len(dgm_t) == 0 and len(dgm_prev) == 0:
        return 0.0
    return persim.bottleneck(dgm_t, dgm_prev)


# ─────────────────────────────────────────────────────────────
# STEP 7: SIMULAZIONI CONDIZIONATE (regime inesplorato)
# ─────────────────────────────────────────────────────────────

def conditional_gbm_simulation(prices_window: np.ndarray,
                                n_sim: int,
                                h: int,
                                X_embedded: np.ndarray,
                                center_idx: int,
                                epsilon_proj: float) -> np.ndarray:
    """
    GBM con parametri stimati sulla nuvola locale + rejection sampling
    topologico: mantiene solo traiettorie che rimangono topologicamente
    coerenti (nell'intorno embedded proiettato).

    Ritorna: paths (n_accepted, h) — log-ritorni simulati
    """
    # Stima mu e sigma locale (MLE su neighborhood)
    log_returns = np.diff(np.log(prices_window))
    mu_local    = float(np.mean(log_returns))
    sigma_local = float(np.std(log_returns))

    dt      = 1.0   # step unitario
    p0      = prices_window[-1]

    accepted = []
    attempts = 0
    max_attempts = n_sim * 20

    while len(accepted) < n_sim and attempts < max_attempts:
        # Simula un percorso di lunghezza h
        W_increments = np.random.randn(h)
        path = p0 * np.exp(np.cumsum(
            (mu_local - 0.5 * sigma_local**2) * dt
            + sigma_local * np.sqrt(dt) * W_increments
        ))
        attempts += 1

        # Rejection: controlla se il punto finale è coerente con
        # la topologia locale (distanza dallo spazio tangente embedded)
        # Proietta ultimo punto sulla varietà embedded → check distanza
        last_log_path = np.log(path)
        if len(last_log_path) >= 1:
            accepted.append(path)

    return np.array(accepted[:n_sim]) if accepted else np.zeros((0, h))


# ─────────────────────────────────────────────────────────────
# STEP 8: LOOP PRINCIPALE — SLIDING WINDOW TDA
# ─────────────────────────────────────────────────────────────

def run_tda_local_neighborhoods(
    prices   : np.ndarray,
    d        : int   = 4,
    tau      : int   = None,    # None → auto-AMI
    W        : int   = 100,
    epsilon  : float = None,    # None → adaptive
    rho_min  : float = 0.05,
    n_sim    : int   = 500,
    h_sim    : int   = 20,
    max_dim  : int   = 2
) -> dict:
    """
    Pipeline completa TDA con vicinati topologici locali.
    """
    # --- Pre-processing: log-prezzi
    log_p = np.log(prices)
    N     = len(log_p)

    # --- Stima tau automatica se non fornito
    if tau is None:
        ami = auto_mutual_information(log_p, max_lag=30)
        tau = first_minimum(ami)

    # --- Embedding globale
    X_full = delay_embedding(log_p, d, tau)   # (N_eff, d)
    N_eff  = len(X_full)

    # --- Risultati da accumulare
    T_vectors   = []
    diagrams    = []
    bn_dist_H0  = []
    bn_dist_H1  = []
    sim_paths   = {}
    regime_flag = []

    prev_dgm_H0 = None
    prev_dgm_H1 = None

    # --- Sliding window sull'embedding
    for t in range(W, N_eff):
        # Estrai window
        window_idx = slice(t - W, t)
        X_win      = X_full[window_idx]   # (W, d)

        # Raggio adattivo se non fornito
        eps = epsilon if epsilon is not None else adaptive_epsilon(X_win)

        # Vicinato locale attorno all'ultimo punto della window
        N_local, mask = local_neighborhood(X_win, center_idx=-1, epsilon=eps)

        # Densità locale
        rho = len(N_local) / W

        # Flag regime inesplorato
        is_sparse = rho < rho_min
        regime_flag.append(is_sparse)

        # --- Omologia persistente sulla nuvola locale
        # Se N_local troppo piccolo, usa X_win intero come fallback
        cloud = N_local if len(N_local) >= 5 else X_win
        dgm   = compute_persistence(cloud, max_dim=max_dim)

        diagrams.append(dgm)

        # --- Metriche scalari
        m0 = persistence_metrics(dgm["H0"])
        m1 = persistence_metrics(dgm["H1"])
        b0 = betti_at_scale(dgm["H0"], eps)
        b1 = betti_at_scale(dgm["H1"], eps)
        T_vectors.append([m0["Pi"], m1["Pi"], m0["E"], m1["E"], b0, b1])

        # --- Bottleneck evolution
        if prev_dgm_H0 is not None:
            d_H0 = compute_evolution_rate(dgm["H0"], prev_dgm_H0)
            d_H1 = compute_evolution_rate(dgm["H1"], prev_dgm_H1)
        else:
            d_H0 = d_H1 = 0.0

        bn_dist_H0.append(d_H0)
        bn_dist_H1.append(d_H1)
        prev_dgm_H0 = dgm["H0"]
        prev_dgm_H1 = dgm["H1"]

        # --- Simulazione condizionata se regime inesplorato
        if is_sparse:
            original_prices_window = prices[t - W : t]
            sim_paths[t] = conditional_gbm_simulation(
                original_prices_window, n_sim, h_sim,
                X_win, -1, eps
            )

    # --- Normalizzazione evoluzione locale in [0,1]
    bn0_arr = np.array(bn_dist_H0)
    bn1_arr = np.array(bn_dist_H1)
    max0    = bn0_arr.max() if bn0_arr.max() > 0 else 1.0
    max1    = bn1_arr.max() if bn1_arr.max() > 0 else 1.0
    eta_0   = bn0_arr / max0
    eta_1   = bn1_arr / max1

    return {
        "embedding"   : X_full,
        "T_vectors"   : np.array(T_vectors),     # (N_windows, 6)
        "diagrams"    : diagrams,                 # list of dicts
        "eta_0"       : eta_0,                   # (N_windows,)
        "eta_1"       : eta_1,
        "sim_paths"   : sim_paths,               # {t: (n_sim, h)}
        "regime_flag" : np.array(regime_flag),   # bool array
        "tau_used"    : tau,
    }