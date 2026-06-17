# FILE: backend/models/tda_fnn.py
# Dipendenze: numpy, scipy

import numpy as np
from scipy.spatial import KDTree


def delay_embedding_fnn(series: np.ndarray, d: int, tau: int) -> np.ndarray:
    """Embedding in R^d con delay tau."""
    N_eff = len(series) - (d - 1) * tau
    return np.array([
        series[i : i + d * tau : tau]
        for i in range(N_eff)
    ])  # (N_eff, d)


def fnn_kennel(series: np.ndarray,
               tau: int,
               d_max: int = 10,
               R_tol: float = 15.0,
               theta_fnn: float = 0.05) -> dict:
    """
    Criterio di Kennel (1992).
    Per ogni d in [1, d_max]:
      1. Costruisce embedding in R^d
      2. Trova nearest neighbor via KDTree (k=2: se stesso + NN)
      3. Calcola R_t per ogni punto
      4. Conta quanti R_t > R_tol → FNN%
    """
    fnn_pcts   = np.zeros(d_max)
    E1_cao     = np.zeros(d_max)

    for d in range(1, d_max + 1):
        X_d   = delay_embedding_fnn(series, d,     tau)  # (N_d, d)
        X_d1  = delay_embedding_fnn(series, d + 1, tau)  # (N_d1, d+1)

        # Allinea lunghezze (X_d1 è più corto di tau punti)
        N_min = min(len(X_d), len(X_d1))
        X_d   = X_d[:N_min]
        X_d1  = X_d1[:N_min]

        # KDTree in R^d, k=2 (punto stesso + 1° NN)
        tree  = KDTree(X_d)
        dists, idx = tree.query(X_d, k=2)   # dists[:,0]=0, dists[:,1]=r_NN

        r_NN  = dists[:, 1]          # distanza al nearest neighbor in R^d
        nn_idx = idx[:, 1]           # indice del nearest neighbor

        # Numeratore: distanza nella (d+1)-esima coordinata
        delta_coord = np.abs(
            series[d * tau : d * tau + N_min]
            - series[d * tau + (nn_idx * 1) : d * tau + N_min]
            # Nota: accesso diretto alla coord extra
        )

        # Calcolo più robusto via embedding d+1 diretto
        extra_self = X_d1[:, -1]           # (d+1)-esima coordinata di x_t
        extra_nn   = X_d1[nn_idx, -1]      # (d+1)-esima coordinata di NN(t)
        delta_coord = np.abs(extra_self - extra_nn)

        # Ratio R_t
        r_safe = np.where(r_NN > 1e-10, r_NN, np.nan)
        R_t    = delta_coord / r_safe

        # FNN: quanti punti hanno R_t > R_tol
        fnn_mask      = R_t > R_tol
        fnn_pcts[d-1] = np.nanmean(fnn_mask)

        # Criterio Cao: E1(d)
        # Distanza in R^{d+1} / distanza in R^d
        dist_d1   = np.linalg.norm(X_d1 - X_d1[nn_idx], axis=1)
        E1_cao[d-1] = np.nanmean(dist_d1 / r_safe)

    # E*(d) = E1(d+1)/E1(d)  — vettore lunghezza d_max-1
    Estar = E1_cao[1:] / (E1_cao[:-1] + 1e-12)

    # d* Kennel: primo d con FNN% < theta_fnn
    d_star_kennel = d_max  # default: massimo
    for d in range(d_max):
        if fnn_pcts[d] < theta_fnn:
            d_star_kennel = d + 1
            break

    # d* Cao: primo d dove E*(d) ~ 1 (variazione < 5%)
    d_star_cao = d_max
    for d in range(len(Estar)):
        if abs(Estar[d] - 1.0) < 0.05:
            d_star_cao = d + 2   # 1-indexed, E*(d) = E1(d+1)/E1(d)
            break

    d_recommended = max(d_star_kennel, d_star_cao)

    return {
        "fnn_percentages" : fnn_pcts,         # shape (d_max,)
        "E1_cao"          : E1_cao,           # shape (d_max,)
        "Estar_cao"       : Estar,            # shape (d_max-1,)
        "d_star_kennel"   : int(d_star_kennel),
        "d_star_cao"      : int(d_star_cao),
        "d_recommended"   : int(d_recommended),
        "tau_used"        : int(tau),
    }


def estimate_embedding_dimension_fnn(prices: np.ndarray,
                                     tau: int = None,
                                     d_max: int = 10) -> dict:
    """
    Entry point pubblico. Se tau è None, usa AMI interno minimale.
    Ritorna d_recommended pronto per passarlo a run_tda_local_neighborhoods.
    """
    log_p = np.log(prices)

    if tau is None:
        # Stima veloce tau: prima autocorrelazione sotto soglia
        from scipy.stats import pearsonr
        for lag in range(1, 30):
            r, _ = pearsonr(log_p[:-lag], log_p[lag:])
            if r < 1/np.e:
                tau = lag
                break
        tau = tau or 5  # fallback

    result = fnn_kennel(log_p, tau=tau, d_max=d_max)
    return result