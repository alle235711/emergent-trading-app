# FILE: backend/models/tda_serializer.py
# Dipendenze: numpy only
# Nessun framework — funziona con json.dumps standard e con FastAPI JSONResponse

import numpy as np
import math
from typing import Any


# ─────────────────────────────────────────────────────────────
# NUCLEO: serializzatore ricorsivo universale
# ─────────────────────────────────────────────────────────────

def ser(obj: Any) -> Any:
    """
    Funtore di serializzazione ricorsivo.
    Converte qualsiasi struttura nested in tipi JSON-safe puri.
    Gestisce: ndarray, np.scalar, dict, list, tuple, nan, inf.
    """
    # --- numpy array
    if isinstance(obj, np.ndarray):
        return [ser(x) for x in obj.tolist()]

    # --- numpy scalari interi
    if isinstance(obj, np.integer):
        return int(obj)

    # --- numpy scalari float
    if isinstance(obj, np.floating):
        v = float(obj)
        if math.isnan(v) or math.isinf(v):
            return None   # JSON null — il frontend gestisce None come gap
        return v

    # --- numpy bool
    if isinstance(obj, np.bool_):
        return bool(obj)

    # --- float Python nativo (può comunque essere nan/inf)
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj

    # --- dict: forza chiavi a str, ricorsione sui valori
    if isinstance(obj, dict):
        return {str(k): ser(v) for k, v in obj.items()}

    # --- list o tuple
    if isinstance(obj, (list, tuple)):
        return [ser(x) for x in obj]

    # --- tipi Python primitivi già safe
    if isinstance(obj, (int, bool, str)) or obj is None:
        return obj

    # --- fallback: tenta str per tipi sconosciuti
    return str(obj)


# ─────────────────────────────────────────────────────────────
# SERIALIZZATORE SPECIFICO: FNN
# ─────────────────────────────────────────────────────────────

def serialize_fnn(fnn_raw: dict) -> dict:
    """
    Struttura output attesa dal frontend per il pannello FNN.
    
    Schema finale:
    {
      "d_recommended": int,
      "d_star_kennel": int,
      "d_star_cao":    int,
      "tau_used":      int,
      "chart_fnn": [           ← dati per grafico FNN%(d)
        {"d": 1, "fnn_pct": 0.82},
        {"d": 2, "fnn_pct": 0.34},
        ...
      ],
      "chart_cao": [           ← dati per grafico E*(d)
        {"d": 1, "E1": 1.23, "Estar": null},
        {"d": 2, "E1": 1.10, "Estar": 0.89},
        ...
      ],
      "summary": {
        "interpretation": "string",
        "warning": "string | null"
      }
    }
    """
    fnn_pcts = fnn_raw.get("fnn_percentages", [])
    E1       = fnn_raw.get("E1_cao", [])
    Estar    = fnn_raw.get("Estar_cao", [])
    d_rec    = fnn_raw.get("d_recommended", 4)
    d_max    = len(fnn_pcts)

    # Chart FNN%(d) — array di oggetti per Recharts/D3
    chart_fnn = [
        {
            "d":       d + 1,
            "fnn_pct": ser(fnn_pcts[d]),
            "label":   f"d={d+1}"
        }
        for d in range(d_max)
    ]

    # Chart Cao E1 e E* — Estar ha lunghezza d_max-1
    chart_cao = []
    for d in range(d_max):
        chart_cao.append({
            "d":     d + 1,
            "E1":    ser(E1[d]) if d < len(E1) else None,
            "Estar": ser(Estar[d - 1]) if d >= 1 and (d-1) < len(Estar) else None
        })

    # Interpretazione testuale automatica
    interp = (
        f"Dimensione di embedding ottimale stimata: d* = {d_rec}. "
        f"Criterio Kennel: d={fnn_raw.get('d_star_kennel')}. "
        f"Criterio Cao: d={fnn_raw.get('d_star_cao')}."
    )
    warning = None
    if d_rec >= 7:
        warning = (
            "d* elevato (≥7): possibile presenza di rumore dominante "
            "o serie non stazionaria. Verificare pre-processing."
        )

    return {
        "d_recommended": ser(d_rec),
        "d_star_kennel": ser(fnn_raw.get("d_star_kennel")),
        "d_star_cao":    ser(fnn_raw.get("d_star_cao")),
        "tau_used":      ser(fnn_raw.get("tau_used")),
        "chart_fnn":     chart_fnn,
        "chart_cao":     chart_cao,
        "summary": {
            "interpretation": interp,
            "warning":        warning
        }
    }


# ─────────────────────────────────────────────────────────────
# SERIALIZZATORE SPECIFICO: MAPPER
# ─────────────────────────────────────────────────────────────

def serialize_mapper(mapper_raw: dict) -> dict:
    """
    Struttura output per il grafo Mapper nel frontend.
    Formato compatibile con librerie di graph viz (D3-force, Sigma.js, Cytoscape).

    Schema finale:
    {
      "graph": {
        "nodes": [
          {
            "id":    "n_0",
            "size":  14,
            "color": 0.032,    ← valore normalizzato [0,1] per colormap
            "pts":   [3,7,12]  ← indici originali (opzionale, per debug)
          },
          ...
        ],
        "edges": [
          {"source": "n_0", "target": "n_3"},
          ...
        ]
      },
      "meta": {
        "n_nodes":    int,
        "n_edges":    int,
        "filter":     str,
        "d_used":     int,
        "tau_used":   int,
        "color_range": [min, max]   ← per normalizzare colormap nel frontend
      },
      "filter_series": [float, ...]  ← f(x) per ogni timestep (per grafico)
    }
    """
    raw_nodes  = mapper_raw.get("nodes", {})
    raw_edges  = mapper_raw.get("edges", [])
    colors     = mapper_raw.get("node_colors", {})
    sizes      = mapper_raw.get("node_sizes", {})

    # Normalizza colori in [0,1] per colormap uniforme nel frontend
    color_vals = [v for v in colors.values() if v is not None]
    c_min = min(color_vals) if color_vals else 0.0
    c_max = max(color_vals) if color_vals else 1.0
    c_range = c_max - c_min if c_max != c_min else 1.0

    nodes_out = []
    for nid, pts in raw_nodes.items():
        raw_color = colors.get(nid, 0.0)
        norm_color = (raw_color - c_min) / c_range if raw_color is not None else 0.5
        nodes_out.append({
            "id":    f"n_{nid}",
            "size":  ser(sizes.get(nid, 1)),
            "color": round(ser(norm_color) or 0.0, 4),
            "pts":   ser(pts[:20])  # max 20 indici per non appesantire il payload
        })

    edges_out = [
        {"source": f"n_{e[0]}", "target": f"n_{e[1]}"}
        for e in raw_edges
    ]

    filter_series = ser(mapper_raw.get("filter_vals", []))
    # Tronca a max 2000 punti per il frontend
    if isinstance(filter_series, list) and len(filter_series) > 2000:
        step = len(filter_series) // 2000
        filter_series = filter_series[::step]

    return {
        "graph": {
            "nodes": nodes_out,
            "edges": edges_out
        },
        "meta": {
            "n_nodes":    ser(mapper_raw.get("n_nodes", len(nodes_out))),
            "n_edges":    ser(mapper_raw.get("n_edges", len(edges_out))),
            "filter":     str(mapper_raw.get("filter", "pca1")),
            "d_used":     ser(mapper_raw.get("d_used", 4)),
            "tau_used":   ser(mapper_raw.get("tau_used", 3)),
            "color_range": [
                round(float(c_min), 6),
                round(float(c_max), 6)
            ]
        },
        "filter_series": filter_series
    }


# ─────────────────────────────────────────────────────────────
# SERIALIZZATORE SPECIFICO: TDA NEIGHBORHOODS (blueprint 1)
# ─────────────────────────────────────────────────────────────

def serialize_tda_neighborhoods(tda_raw: dict,
                                 max_points: int = 500) -> dict:
    """
    Serializza output di run_tda_local_neighborhoods.

    Schema finale:
    {
      "topology_series": [        ← array temporale, un oggetto per timestep
        {
          "t":      0,
          "Pi_H0":  float,        ← persistenza totale H0
          "Pi_H1":  float,        ← persistenza totale H1
          "E_H0":   float,        ← entropia H0
          "E_H1":   float,        ← entropia H1
          "beta_0": int,
          "beta_1": int,
          "eta_0":  float,        ← % evoluzione locale H0
          "eta_1":  float,        ← % evoluzione locale H1
          "regime": bool          ← True se regime inesplorato
        },
        ...
      ],
      "persistence_diagrams": [   ← un oggetto per timestep (campionato)
        {
          "t": 0,
          "H0": [{"birth": float, "death": float, "lifetime": float}, ...],
          "H1": [{"birth": float, "death": float, "lifetime": float}, ...]
        },
        ...
      ],
      "simulations": {            ← solo per regimi sparsi
        "t_123": {
          "paths_summary": {      ← statistiche, non tutti i paths
            "mean":   [float, ...],
            "q05":    [float, ...],
            "q95":    [float, ...]
          }
        }
      },
      "meta": {
        "n_timesteps":  int,
        "tau_used":     int,
        "n_sparse":     int,
        "windows_sampled": int
      }
    }
    """
    T_vec       = tda_raw.get("T_vectors",   np.empty((0, 6)))
    eta_0       = tda_raw.get("eta_0",       np.array([]))
    eta_1       = tda_raw.get("eta_1",       np.array([]))
    regime_flag = tda_raw.get("regime_flag", np.array([]))
    diagrams    = tda_raw.get("diagrams",    [])
    sim_paths   = tda_raw.get("sim_paths",   {})
    tau_used    = tda_raw.get("tau_used",    1)

    N = len(T_vec)

    # ── Topology series (downsampled se > max_points)
    step = max(1, N // max_points)
    ts_out = []
    for i in range(0, N, step):
        row = T_vec[i] if i < len(T_vec) else [0]*6
        ts_out.append({
            "t":      i,
            "Pi_H0":  ser(row[0]),
            "Pi_H1":  ser(row[1]),
            "E_H0":   ser(row[2]),
            "E_H1":   ser(row[3]),
            "beta_0": ser(int(row[4])),
            "beta_1": ser(int(row[5])),
            "eta_0":  ser(eta_0[i]) if i < len(eta_0) else None,
            "eta_1":  ser(eta_1[i]) if i < len(eta_1) else None,
            "regime": ser(regime_flag[i]) if i < len(regime_flag) else False
        })

    # ── Persistence diagrams (campiona max 50 timestep per non appesantire)
    diag_step = max(1, len(diagrams) // 50)
    diag_out  = []
    for i in range(0, len(diagrams), diag_step):
        dgm = diagrams[i]
        H0  = dgm.get("H0", np.empty((0,2)))
        H1  = dgm.get("H1", np.empty((0,2)))

        def dgm_to_list(arr):
            if len(arr) == 0:
                return []
            return [
                {
                    "birth":    ser(float(row[0])),
                    "death":    ser(float(row[1])),
                    "lifetime": ser(float(row[1] - row[0]))
                }
                for row in arr
                if np.isfinite(row[0]) and np.isfinite(row[1])
            ]

        diag_out.append({
            "t":  i,
            "H0": dgm_to_list(H0),
            "H1": dgm_to_list(H1)
        })

    # ── Simulazioni condizionate: invia solo statistiche aggregate
    sims_out = {}
    for t_idx, paths in sim_paths.items():
        if len(paths) == 0:
            continue
        paths_arr = np.array(paths)    # (n_sim, h)
        sims_out[str(t_idx)] = {
            "paths_summary": {
                "mean": ser(np.mean(paths_arr, axis=0)),
                "q05":  ser(np.percentile(paths_arr, 5,  axis=0)),
                "q95":  ser(np.percentile(paths_arr, 95, axis=0)),
                "std":  ser(np.std(paths_arr, axis=0))
            }
        }

    n_sparse = int(np.sum(regime_flag)) if len(regime_flag) > 0 else 0

    return {
        "topology_series":     ts_out,
        "persistence_diagrams": diag_out,
        "simulations":         sims_out,
        "meta": {
            "n_timesteps":      N,
            "tau_used":         ser(tau_used),
            "n_sparse":         n_sparse,
            "windows_sampled":  len(ts_out)
        }
    }


# ─────────────────────────────────────────────────────────────
# ENTRY POINT UNIFICATO — chiama questo da server.py
# ─────────────────────────────────────────────────────────────

def build_tda_response(module: str, raw: dict, **kwargs) -> dict:
    """
    Dispatcher unico. Da usare in server.py così:

        from models.tda_serializer import build_tda_response
        payload = build_tda_response("fnn",    fnn_raw)
        payload = build_tda_response("mapper", mapper_raw)
        payload = build_tda_response("tda",    tda_raw)

    Aggiunge sempre un campo "status" e "module" per il frontend.
    """
    serializers = {
        "fnn":    serialize_fnn,
        "mapper": serialize_mapper,
        "tda":    serialize_tda_neighborhoods,
    }

    if module not in serializers:
        raise ValueError(f"Modulo '{module}' non riconosciuto. "
                         f"Usa: {list(serializers.keys())}")

    data = serializers[module](raw, **kwargs)

    return {
        "status": "ok",
        "module": module,
        "data":   data
    }