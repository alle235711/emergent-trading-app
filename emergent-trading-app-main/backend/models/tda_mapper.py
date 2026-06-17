# FILE: backend/models/tda_mapper.py
# Dipendenze: numpy, scipy, scikit-learn
# NON usa kmapper per controllo totale; implementazione from-scratch

import numpy as np
from scipy.cluster.hierarchy import linkage, fcluster
from scipy.spatial.distance import pdist
from sklearn.decomposition import PCA
from sklearn.neighbors import KernelDensity


# ─────────────────────────────────────────────────────────────
# STEP 1: FUNZIONE FILTRO
# ─────────────────────────────────────────────────────────────

def compute_filter(X: np.ndarray, filter_type: str = "pca1") -> np.ndarray:
    """
    f: R^d → R  — proiezione monodimensionale.

    "pca1"     : prima componente principale (cattura max varianza)
    "density"  : log-densità KDE (alta densità = regime consolidato)
    "variance" : varianza locale per riga (proxy di volatilità)
    """
    if filter_type == "pca1":
        pca = PCA(n_components=1)
        return pca.fit_transform(X).ravel()  # (N_eff,)

    elif filter_type == "density":
        kde = KernelDensity(kernel='gaussian',
                            bandwidth='scott').fit(X)
        return kde.score_samples(X)          # log-density, (N_eff,)

    elif filter_type == "variance":
        return np.var(X, axis=1)             # (N_eff,)

    else:
        raise ValueError(f"filter_type '{filter_type}' non supportato.")


# ─────────────────────────────────────────────────────────────
# STEP 2: COPERTURA DELL'IMMAGINE
# ─────────────────────────────────────────────────────────────

def build_cover(f_vals: np.ndarray,
                n_cubes: int = 10,
                overlap_pct: float = 0.5) -> list:
    """
    Costruisce copertura aperta di f(X) ⊆ R.
    Ritorna lista di tuple (lower, upper) per ogni intervallo U_alpha.

    overlap_pct ∈ (0,1): 0.5 = 50% sovrapposizione tra adiacenti.
    """
    f_min, f_max = f_vals.min(), f_vals.max()
    # Larghezza base di ogni cubo senza overlap
    base_width = (f_max - f_min) / n_cubes
    step       = base_width * (1 - overlap_pct)
    half       = base_width / 2.0

    # Centri degli intervalli
    centers = np.linspace(f_min + half, f_max - half, n_cubes)
    cover   = [(c - half - step/2, c + half + step/2) for c in centers]
    return cover  # list of (lower, upper), len = n_cubes


# ─────────────────────────────────────────────────────────────
# STEP 3: CLUSTERING LOCALE SU OGNI PREIMMAGINE
# ─────────────────────────────────────────────────────────────

def cluster_preimage(X_subset: np.ndarray,
                     indices: np.ndarray,
                     algo: str = "single",
                     eps: float = None) -> dict:
    """
    Applica clustering su f^{-1}(U_alpha).
    Ritorna dict {cluster_label: [original_indices]}
    """
    if len(indices) == 0:
        return {}
    if len(indices) == 1:
        return {0: list(indices)}

    if algo == "single":
        # Single-linkage: taglia all'altezza del gap massimo
        D = pdist(X_subset, metric='euclidean')
        Z = linkage(D, method='single')
        # Soglia automatica: 20° percentile delle altezze
        threshold = np.percentile(Z[:, 2], 20)
        labels    = fcluster(Z, t=threshold, criterion='distance') - 1

    elif algo == "dbscan":
        from sklearn.cluster import DBSCAN
        eps_val = eps or np.percentile(pdist(X_subset), 15)
        db      = DBSCAN(eps=eps_val, min_samples=2).fit(X_subset)
        labels  = db.labels_

    else:
        labels = np.zeros(len(indices), dtype=int)

    clusters = {}
    for lbl, orig_idx in zip(labels, indices):
        if lbl == -1:    # rumore DBSCAN → nodo singleton
            lbl = max(clusters.keys(), default=-1) + 1
        clusters.setdefault(int(lbl), []).append(int(orig_idx))
    return clusters


# ─────────────────────────────────────────────────────────────
# STEP 4: COSTRUZIONE GRAFO MAPPER (NERVE COMPLEX)
# ─────────────────────────────────────────────────────────────

def build_mapper_graph(X: np.ndarray,
                       f_vals: np.ndarray,
                       cover: list,
                       cluster_algo: str = "single",
                       color_by: np.ndarray = None) -> dict:
    """
    Costruisce il grafo Mapper completo.
    Nodi = cluster locali, Archi = intersezioni non vuote.
    """
    all_nodes  = {}   # node_id → list of point indices
    node_id    = 0

    # Mappa punto → lista di nodi che lo contengono
    point_to_nodes = {}   # int → list of node_ids

    for alpha, (lo, hi) in enumerate(cover):
        # Preimmagine f^{-1}(U_alpha)
        mask    = (f_vals >= lo) & (f_vals <= hi)
        indices = np.where(mask)[0]

        if len(indices) == 0:
            continue

        X_sub   = X[indices]
        clusters = cluster_preimage(X_sub, indices, algo=cluster_algo)

        for lbl, pts in clusters.items():
            all_nodes[node_id] = pts
            for p in pts:
                point_to_nodes.setdefault(p, []).append(node_id)
            node_id += 1

    # Archi: coppie di nodi che condividono almeno un punto
    edges_set = set()
    for p, nodes_containing_p in point_to_nodes.items():
        for i in range(len(nodes_containing_p)):
            for j in range(i + 1, len(nodes_containing_p)):
                u, v = sorted([nodes_containing_p[i], nodes_containing_p[j]])
                edges_set.add((u, v))

    edges = list(edges_set)

    # Colori nodi: media di color_by (es. volatilità) sui punti del nodo
    if color_by is None:
        color_by = f_vals   # fallback: usa i valori filtro

    node_colors = {}
    node_sizes  = {}
    for nid, pts in all_nodes.items():
        vals = color_by[pts]
        node_colors[nid] = float(np.mean(vals))
        node_sizes[nid]  = len(pts)

    return {
        "nodes"       : {k: v for k, v in all_nodes.items()},
        "edges"       : edges,
        "node_colors" : node_colors,
        "node_sizes"  : node_sizes,
        "filter_vals" : f_vals.tolist(),
        "n_nodes"     : len(all_nodes),
        "n_edges"     : len(edges),
    }


# ─────────────────────────────────────────────────────────────
# STEP 5: ENTRY POINT PUBBLICO
# ─────────────────────────────────────────────────────────────

def run_mapper_analysis(prices: np.ndarray,
                        d: int = 4,
                        tau: int = 3,
                        W: int = None,
                        filter_type: str = "pca1",
                        n_cubes: int = 10,
                        overlap_pct: float = 0.5,
                        cluster_algo: str = "single") -> dict:
    """
    Pipeline completa Mapper su serie temporale.
    Se W è None: usa tutta la serie (analisi globale).
    Se W è fornito: usa solo gli ultimi W punti (analisi locale/real-time).
    """
    from .tda_neighborhoods import delay_embedding

    log_p   = np.log(prices)
    X_full  = delay_embedding(log_p, d, tau)   # (N_eff, d)

    # Window: analisi sull'intera serie o su sliding window finale
    X = X_full[-W:] if W is not None else X_full

    # Volatilità rolling come metrica di colore (array allineato a X)
    log_r   = np.diff(log_p)
    vol     = np.array([
        np.std(log_r[max(0, i-20):i+1])
        for i in range(len(log_r))
    ])
    # Allinea vol a X (stessa lunghezza)
    vol_aligned = vol[-(len(X)):]
    if len(vol_aligned) < len(X):
        vol_aligned = np.pad(vol_aligned, (len(X)-len(vol_aligned), 0))

    # Funzione filtro
    f_vals  = compute_filter(X, filter_type=filter_type)

    # Copertura
    cover   = build_cover(f_vals, n_cubes=n_cubes, overlap_pct=overlap_pct)

    # Grafo Mapper
    result  = build_mapper_graph(X, f_vals, cover,
                                 cluster_algo=cluster_algo,
                                 color_by=vol_aligned)
    result["d_used"]    = d
    result["tau_used"]  = tau
    result["filter"]    = filter_type
    return result