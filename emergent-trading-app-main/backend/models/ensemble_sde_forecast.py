"""
ensemble_sde_forecast.py
------------------------
Ensemble SDE Forecast with rolling calibration and particle filtering.

Models
------
- GBM          : Geometric Brownian Motion
- OU           : Mean-reverting Ornstein–Uhlenbeck on log-price
- Jump-Diffusion : Merton jump-diffusion

Dipendenze: numpy, scipy, pandas (solo per typing I/O — calcolo su ndarray)
Nessuna dipendenza da FastAPI.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import IntEnum
from typing import Any

import numpy as np
import pandas as pd
from scipy.special import logsumexp
from scipy.stats import norm, poisson


TRADING_DAYS = 252
DT = 1.0 / TRADING_DAYS
MIN_JUMPS_FOR_JUMP_MODEL = 3
_DEBUG_PREFIX = "[ensemble-sde]"


def _debug(msg: str) -> None:
    print(f"{_DEBUG_PREFIX} {msg}", flush=True)


def _debug_matrix(name: str, mat: np.ndarray, fmt: str = ".4f") -> None:
    _debug(f"{name} shape={mat.shape}")
    with np.printoptions(precision=4, suppress=True, linewidth=120):
        print(f"{_DEBUG_PREFIX} {name}:\n{np.array2string(mat, formatter={'float_kind': lambda x: f'{x:{fmt}}'})}", flush=True)


class SDEModel(IntEnum):
    GBM = 0
    OU = 1
    JUMP = 2


MODEL_NAMES = {SDEModel.GBM: "gbm", SDEModel.OU: "ou", SDEModel.JUMP: "jump"}


# ---------------------------------------------------------------------------
# Input contract (documented for API / callers)
# ---------------------------------------------------------------------------
#
# prices_df : pd.DataFrame, index=DatetimeIndex (monotone), columns:
#   - close  (float64, required, > 0)
#   - high   (float64, optional)
#   - low    (float64, optional)
#   - volume (float64, optional)
#
# volatility_df : pd.DataFrame, same index as prices_df (aligned), columns:
#   - realized_vol (float64, annualized)
#   - ewma_vol     (float64, annualized, optional)
#   - garch_vol    (float64, annualized, optional)
#
# jumps_df : pd.DataFrame, same index, columns:
#   - jump_indicator (int/bool, 1 if jump detected)
#   - jump_size      (float64, log-return of jump component)
#   - jump_intensity (float64, annualized λ prior)
#
# support_levels : np.ndarray (K,) float64 — livelli di supporto
# horizons       : np.ndarray (m,) int32   — orizzonti in giorni
#
# Tensori interni principali:
#   log_returns : (N-1,) float64
#   particles   : struct con fields model (P,), theta dict per modello, weights (P,)
#   paths       : (B, H+1) float64 — traiettorie simulate (include S_0)
#   violation   : (K, m) float64 — P(min_{τ≤T} S_τ < support_k)


@dataclass
class GBMParams:
    mu: float
    sigma: float


@dataclass
class OUParams:
    kappa: float
    theta: float
    sigma: float


@dataclass
class JumpParams:
    mu: float
    sigma: float
    lam: float
    mu_j: float
    sigma_j: float


@dataclass
class Particle:
    model: SDEModel
    gbm: GBMParams | None = None
    ou: OUParams | None = None
    jump: JumpParams | None = None
    log_weight: float = 0.0


@dataclass
class EnsembleSDEConfig:
    rolling_window: int = 60
    n_particles: int = 300
    n_paths: int = 2000
    forecast_horizon: int = 20
    var_alpha: float = 0.05
    resample_threshold: float = 0.5
    process_noise: float = 0.02
    jump_threshold: float = 3.5
    seed: int | None = 42
    max_paths_ui: int = 50


# ---------------------------------------------------------------------------
# Pre-processing
# ---------------------------------------------------------------------------

def _align_frames(
    prices_df: pd.DataFrame,
    volatility_df: pd.DataFrame | None,
    jumps_df: pd.DataFrame | None,
) -> tuple[pd.DataFrame, pd.DataFrame | None, pd.DataFrame | None]:
    if "close" not in prices_df.columns:
        raise ValueError("prices_df must contain column 'close'")

    prices = prices_df.sort_index().copy()
    prices["close"] = prices["close"].astype(np.float64)
    if (prices["close"] <= 0).any():
        raise ValueError("prices_df.close must be strictly positive")

    vol = None
    if volatility_df is not None and not volatility_df.empty:
        vol = volatility_df.reindex(prices.index).ffill().bfill()

    jumps = None
    if jumps_df is not None and not jumps_df.empty:
        jumps = jumps_df.reindex(prices.index).ffill().fillna(0.0)

    return prices, vol, jumps


def _log_returns(close: np.ndarray) -> np.ndarray:
    return np.diff(np.log(close))


def _annualized_vol_from_returns(log_ret: np.ndarray) -> float:
    if len(log_ret) < 2:
        return 0.15
    return float(np.std(log_ret, ddof=1) * np.sqrt(TRADING_DAYS))


def _infer_jumps(
    log_ret: np.ndarray,
    threshold: float = 3.5,
) -> tuple[np.ndarray, np.ndarray, float]:
    """Rileva salti via soglia su rendimenti standardizzati."""
    mu = float(np.mean(log_ret))
    sigma = float(np.std(log_ret, ddof=1))
    if sigma <= 1e-12:
        return np.zeros(len(log_ret), dtype=np.int8), np.zeros(len(log_ret)), 0.0

    z = (log_ret - mu) / sigma
    indicators = (np.abs(z) >= threshold).astype(np.int8)
    sizes = np.where(indicators, log_ret - mu, 0.0)
    lam = float(indicators.sum() / max(len(log_ret), 1) * TRADING_DAYS)
    return indicators, sizes, lam


def _build_vol_prior(
    vol_df: pd.DataFrame | None,
    fallback: float,
) -> float:
    if vol_df is None:
        return fallback
    for col in ("garch_vol", "ewma_vol", "realized_vol"):
        if col in vol_df.columns:
            series = vol_df[col].dropna()
            if len(series):
                return float(series.iloc[-1])
    return fallback


# ---------------------------------------------------------------------------
# Rolling calibration (MLE / moment matching)
# ---------------------------------------------------------------------------

def calibrate_gbm(log_ret: np.ndarray) -> GBMParams:
    mu = float(np.mean(log_ret) / DT)
    sigma = float(np.std(log_ret, ddof=1) / np.sqrt(DT))
    return GBMParams(mu=max(mu, -5.0), sigma=max(sigma, 1e-4))


def calibrate_ou(log_price: np.ndarray) -> OUParams:
    x = log_price
    if len(x) < 5:
        return OUParams(kappa=2.0, theta=float(x[-1]), sigma=0.2)

    dx = np.diff(x)
    x_lag = x[:-1]
    denom = float(np.dot(x_lag, x_lag))
    if denom < 1e-12:
        return OUParams(kappa=2.0, theta=float(x[-1]), sigma=0.2)

    b = float(np.dot(x_lag, dx) / denom)
    kappa = max(-np.log(max(1.0 + b, 1e-6)) / DT, 1e-3)
    theta = float(np.mean(x))
    resid = dx + kappa * (x_lag - theta) * DT
    sigma = float(np.std(resid, ddof=1) / np.sqrt(DT))
    return OUParams(kappa=min(kappa, 50.0), theta=theta, sigma=max(sigma, 1e-4))


def calibrate_rolling_windows(
    log_price: np.ndarray,
    log_ret: np.ndarray,
    indicators: np.ndarray,
    jump_sizes: np.ndarray,
    lam: float,
    window: int,
    step: int = 5,
) -> np.ndarray:
    """
    Calibra GBM / OU / Jump su finestre rolling.
    Ritorna matrice (n_windows, 8):
      [mu_gbm, sigma_gbm, kappa_ou, theta_ou, sigma_ou,
       mu_jump, sigma_jump, lambda_jump]
    """
    rows: list[list[float]] = []
    for end in range(window, len(log_ret) + 1, step):
        sl = slice(end - window, end)
        lp_w = log_price[sl]
        lr_w = log_ret[sl]
        ind_w = indicators[sl]
        jmp_w = jump_sizes[sl]
        g = calibrate_gbm(lr_w)
        o = calibrate_ou(lp_w)
        j = calibrate_jump(lr_w, ind_w, jmp_w, lam)
        rows.append([g.mu, g.sigma, o.kappa, o.theta, o.sigma, j.mu, j.sigma, j.lam])
    return np.asarray(rows, dtype=np.float64)


def calibrate_jump(
    log_ret: np.ndarray,
    indicators: np.ndarray,
    sizes: np.ndarray,
    lam_annual: float,
) -> JumpParams:
    mu_drift = float(np.mean(log_ret) / DT)
    sigma = float(np.std(log_ret, ddof=1) / np.sqrt(DT))
    lam = max(lam_annual, 0.1)

    jump_mask = indicators.astype(bool)
    if jump_mask.any():
        jump_vals = sizes[jump_mask]
        jump_vals = jump_vals[np.isfinite(jump_vals)]
        if len(jump_vals) == 0:
            mu_j, sigma_j = -0.02, 0.05
        else:
            mu_j = float(np.mean(jump_vals))
            # ddof=1 needs ≥2 samples; a single detected jump yields NaN σ_J and breaks the PF.
            if len(jump_vals) >= 2:
                sigma_j = float(np.std(jump_vals, ddof=1))
            else:
                sigma_j = 0.05
    else:
        mu_j, sigma_j = -0.02, 0.05

    if not np.isfinite(mu_j):
        mu_j = -0.02
    if not np.isfinite(sigma_j) or sigma_j <= 0:
        sigma_j = 0.05

    return JumpParams(
        mu=mu_drift,
        sigma=max(sigma, 1e-4),
        lam=min(lam, 50.0),
        mu_j=mu_j,
        sigma_j=max(sigma_j, 1e-4),
    )


def _perturb_params(particle: Particle, rng: np.random.Generator, noise: float) -> Particle:
    """Process noise nel filtro particellare."""
    if particle.model == SDEModel.GBM and particle.gbm:
        g = particle.gbm
        particle.gbm = GBMParams(
            mu=g.mu + rng.normal(0, noise * abs(g.mu) + 1e-4),
            sigma=max(g.sigma * np.exp(rng.normal(0, noise)), 1e-4),
        )
    elif particle.model == SDEModel.OU and particle.ou:
        o = particle.ou
        particle.ou = OUParams(
            kappa=max(o.kappa * np.exp(rng.normal(0, noise)), 1e-3),
            theta=o.theta + rng.normal(0, noise * abs(o.theta) + 1e-4),
            sigma=max(o.sigma * np.exp(rng.normal(0, noise)), 1e-4),
        )
    elif particle.model == SDEModel.JUMP and particle.jump:
        j = particle.jump
        particle.jump = JumpParams(
            mu=j.mu + rng.normal(0, noise),
            sigma=max(j.sigma * np.exp(rng.normal(0, noise)), 1e-4),
            lam=max(j.lam * np.exp(rng.normal(0, noise)), 0.05),
            mu_j=j.mu_j + rng.normal(0, noise),
            sigma_j=max(j.sigma_j * np.exp(rng.normal(0, noise)), 1e-4),
        )
    return particle


# ---------------------------------------------------------------------------
# Likelihoods (Euler discretization, Δt = 1 day)
# ---------------------------------------------------------------------------

def _log_lik_gbm(r: float, p: GBMParams) -> float:
    mean = (p.mu - 0.5 * p.sigma ** 2) * DT
    var = p.sigma ** 2 * DT
    return float(norm.logpdf(r, loc=mean, scale=np.sqrt(var)))


def _log_lik_ou(r: float, x_prev: float, p: OUParams) -> float:
    mean = p.kappa * (p.theta - x_prev) * DT - 0.5 * p.sigma ** 2 * DT
    var = p.sigma ** 2 * DT
    return float(norm.logpdf(r, loc=mean, scale=np.sqrt(var)))


def _log_lik_jump(r: float, p: JumpParams) -> float:
    """Mixture Poisson-Gaussian (max 2 salti per step per trattabilità)."""
    drift_mean = (p.mu - 0.5 * p.sigma ** 2 - p.lam * (np.exp(p.mu_j + 0.5 * p.sigma_j ** 2) - 1)) * DT
    drift_var = p.sigma ** 2 * DT
    lam_dt = p.lam * DT

    log_probs = []
    log_probs.append(np.log1p(-lam_dt) + norm.logpdf(r, drift_mean, np.sqrt(drift_var)))

    for n_jump in (1, 2):
        pois_log = np.log(poisson.pmf(n_jump, lam_dt) + 1e-16)
        jump_mean = drift_mean + n_jump * p.mu_j
        jump_var = drift_var + n_jump * p.sigma_j ** 2
        log_probs.append(pois_log + norm.logpdf(r, jump_mean, np.sqrt(jump_var)))

    return float(logsumexp(log_probs))


def _particle_log_lik(particle: Particle, r: float, x_prev: float) -> float:
    if particle.model == SDEModel.GBM and particle.gbm:
        return _log_lik_gbm(r, particle.gbm)
    if particle.model == SDEModel.OU and particle.ou:
        return _log_lik_ou(r, x_prev, particle.ou)
    if particle.model == SDEModel.JUMP and particle.jump:
        return _log_lik_jump(r, particle.jump)
    return -np.inf


# ---------------------------------------------------------------------------
# Particle filter
# ---------------------------------------------------------------------------

def _init_particles(
    log_price: np.ndarray,
    log_ret: np.ndarray,
    indicators: np.ndarray,
    jump_sizes: np.ndarray,
    lam: float,
    vol_prior: float,
    n_particles: int,
    rng: np.random.Generator,
    *,
    enable_jump: bool = True,
) -> list[Particle]:
    n_per = n_particles // 3
    particles: list[Particle] = []

    gbm_base = calibrate_gbm(log_ret)
    ou_base = calibrate_ou(log_price)
    jump_base = calibrate_jump(log_ret, indicators, jump_sizes, lam)

    if vol_prior > 0:
        gbm_base.sigma = 0.5 * gbm_base.sigma + 0.5 * vol_prior
        ou_base.sigma = 0.5 * ou_base.sigma + 0.5 * vol_prior
        jump_base.sigma = 0.5 * jump_base.sigma + 0.5 * vol_prior

    if enable_jump:
        _debug(
            "Calibrazione base — "
            f"GBM(μ={gbm_base.mu:.4f}, σ={gbm_base.sigma:.4f}) | "
            f"OU(κ={ou_base.kappa:.4f}, θ={ou_base.theta:.4f}, σ={ou_base.sigma:.4f}) | "
            f"Jump(μ={jump_base.mu:.4f}, σ={jump_base.sigma:.4f}, λ={jump_base.lam:.4f}, "
            f"μ_J={jump_base.mu_j:.4f}, σ_J={jump_base.sigma_j:.4f})"
        )
    else:
        _debug(
            "Calibrazione base — jump model disabled (insufficient jumps); "
            f"GBM(μ={gbm_base.mu:.4f}, σ={gbm_base.sigma:.4f}) | "
            f"OU(κ={ou_base.kappa:.4f}, θ={ou_base.theta:.4f}, σ={ou_base.sigma:.4f})"
        )

    for _ in range(n_per):
        p = Particle(model=SDEModel.GBM, gbm=gbm_base, log_weight=-np.log(n_particles))
        particles.append(_perturb_params(p, rng, 0.05))
    for _ in range(n_per):
        p = Particle(model=SDEModel.OU, ou=ou_base, log_weight=-np.log(n_particles))
        particles.append(_perturb_params(p, rng, 0.05))
    remainder = n_particles - 2 * n_per
    for _ in range(remainder):
        if enable_jump:
            p = Particle(model=SDEModel.JUMP, jump=jump_base, log_weight=-np.log(n_particles))
        else:
            # Too few jumps to calibrate σ_J — redistribute to GBM (no jump component).
            p = Particle(model=SDEModel.GBM, gbm=gbm_base, log_weight=-np.log(n_particles))
        particles.append(_perturb_params(p, rng, 0.05))

    return particles


def _normalize_weights(particles: list[Particle]) -> np.ndarray:
    log_w = np.array([p.log_weight for p in particles], dtype=np.float64)
    log_w = np.where(np.isfinite(log_w), log_w, -np.inf)
    log_w -= logsumexp(log_w)
    for i, p in enumerate(particles):
        p.log_weight = float(log_w[i])
    return np.exp(log_w)


def _effective_sample_size(weights: np.ndarray) -> float:
    return float(1.0 / np.sum(weights ** 2))


def _systematic_resample(particles: list[Particle], weights: np.ndarray, rng: np.random.Generator) -> list[Particle]:
    n = len(particles)
    positions = (rng.random() + np.arange(n)) / n
    cumsum = np.cumsum(weights)
    new_particles: list[Particle] = []
    i, j = 0, 0
    while i < n:
        if positions[i] < cumsum[j]:
            src = particles[j]
            clone = Particle(
                model=src.model,
                gbm=src.gbm,
                ou=src.ou,
                jump=src.jump,
                log_weight=-np.log(n),
            )
            new_particles.append(clone)
            i += 1
        else:
            j += 1
    return new_particles


def run_particle_filter(
    log_price: np.ndarray,
    log_ret: np.ndarray,
    indicators: np.ndarray,
    jump_sizes: np.ndarray,
    lam: float,
    vol_prior: float,
    config: EnsembleSDEConfig,
    start_idx: int | None = None,
    *,
    enable_jump: bool = True,
) -> tuple[list[Particle], np.ndarray, dict[str, Any]]:
    """
    Filtra sulle osservazioni da start_idx a T.
    Ritorna particelle finali, pesi normalizzati, diagnostica.
    """
    rng = np.random.default_rng(config.seed)
    particles = _init_particles(
        log_price[: start_idx or len(log_price)],
        log_ret[: (start_idx or len(log_ret))],
        indicators,
        jump_sizes,
        lam,
        vol_prior,
        config.n_particles,
        rng,
        enable_jump=enable_jump,
    )

    t0 = max(config.rolling_window, 1)
    if start_idx is not None:
        t0 = max(t0, start_idx)

    _debug(
        f"Particle filter — n_particles={config.n_particles}, "
        f"rolling_window={config.rolling_window}, steps={len(log_ret) - t0}"
    )

    ess_trace: list[float] = []
    resample_count = 0

    for t in range(t0, len(log_ret)):
        x_prev = float(log_price[t])
        r_t = float(log_ret[t])

        for p in particles:
            p = _perturb_params(p, rng, config.process_noise)
            ll = _particle_log_lik(p, r_t, x_prev)
            p.log_weight += ll

        weights = _normalize_weights(particles)
        ess = _effective_sample_size(weights)
        ess_trace.append(ess)

        if ess < config.resample_threshold * config.n_particles:
            particles = _systematic_resample(particles, weights, rng)
            weights = _normalize_weights(particles)
            resample_count += 1

        if (t - t0) % 50 == 0:
            _debug(f"PF step t={t}  ESS={ess:.1f}  r_t={r_t:.6f}")

    weights = _normalize_weights(particles)
    _debug(f"PF completato — resample_count={resample_count}, ESS_finale={_effective_sample_size(weights):.1f}")
    model_weights = {name: 0.0 for name in MODEL_NAMES.values()}
    for w, p in zip(weights, particles):
        model_weights[MODEL_NAMES[p.model]] += float(w)

    calibrated = _aggregate_params(particles, weights)

    model_weight_vec = np.array([model_weights[n] for n in ("gbm", "ou", "jump")])
    _debug_matrix("Pesi modelli ensemble [GBM, OU, Jump]", model_weight_vec.reshape(1, -1))

    param_rows = []
    for p, w in zip(particles, weights):
        if p.model == SDEModel.GBM and p.gbm:
            param_rows.append([w, 0, p.gbm.mu, p.gbm.sigma, 0, 0, 0, 0])
        elif p.model == SDEModel.OU and p.ou:
            param_rows.append([w, 1, p.ou.kappa, p.ou.theta, p.ou.sigma, 0, 0, 0])
        elif p.model == SDEModel.JUMP and p.jump:
            param_rows.append([w, 2, p.jump.mu, p.jump.sigma, p.jump.lam, p.jump.mu_j, p.jump.sigma_j, 0])
    if param_rows:
        param_mat = np.asarray(param_rows, dtype=np.float64)
        _debug(
            f"Matrice particelle (prime 5 righe) colonne="
            "[weight, model_id, p1, p2, p3, p4, p5, p6]"
        )
        _debug_matrix("Particelle (head)", param_mat[:5])

    diagnostics = {
        "effective_sample_size": float(_effective_sample_size(weights)),
        "ess_trace_tail": ess_trace[-10:],
        "model_weights": model_weights,
        "calibrated_params": calibrated,
        "n_particles": config.n_particles,
        "rolling_window": config.rolling_window,
        "jump_model_enabled": enable_jump,
    }
    return particles, weights, diagnostics


def _weighted_mean_param(values: list[float], weights: list[float]) -> float:
    return float(np.average(values, weights=weights))


def _aggregate_params(particles: list[Particle], weights: np.ndarray) -> dict[str, dict[str, float]]:
    out: dict[str, dict[str, float]] = {}
    for model in SDEModel:
        mask = [p for p in particles if p.model == model]
        if not mask:
            continue
        idx = [i for i, p in enumerate(particles) if p.model == model]
        w = weights[idx]
        w = w / w.sum()
        name = MODEL_NAMES[model]
        if model == SDEModel.GBM:
            out[name] = {
                "mu": _weighted_mean_param([p.gbm.mu for p in mask if p.gbm], w),
                "sigma": _weighted_mean_param([p.gbm.sigma for p in mask if p.gbm], w),
            }
        elif model == SDEModel.OU:
            out[name] = {
                "kappa": _weighted_mean_param([p.ou.kappa for p in mask if p.ou], w),
                "theta": _weighted_mean_param([p.ou.theta for p in mask if p.ou], w),
                "sigma": _weighted_mean_param([p.ou.sigma for p in mask if p.ou], w),
            }
        else:
            out[name] = {
                "mu": _weighted_mean_param([p.jump.mu for p in mask if p.jump], w),
                "sigma": _weighted_mean_param([p.jump.sigma for p in mask if p.jump], w),
                "lambda": _weighted_mean_param([p.jump.lam for p in mask if p.jump], w),
                "mu_j": _weighted_mean_param([p.jump.mu_j for p in mask if p.jump], w),
                "sigma_j": _weighted_mean_param([p.jump.sigma_j for p in mask if p.jump], w),
            }
    return out


# ---------------------------------------------------------------------------
# Simulation
# ---------------------------------------------------------------------------

def _simulate_step_gbm(s: float, p: GBMParams, rng: np.random.Generator) -> float:
    z = rng.standard_normal()
    return s * np.exp((p.mu - 0.5 * p.sigma ** 2) * DT + p.sigma * np.sqrt(DT) * z)


def _simulate_step_ou(s: float, p: OUParams, rng: np.random.Generator) -> float:
    x = np.log(s)
    z = rng.standard_normal()
    x_next = x + p.kappa * (p.theta - x) * DT - 0.5 * p.sigma ** 2 * DT + p.sigma * np.sqrt(DT) * z
    return float(np.exp(x_next))


def _simulate_step_jump(s: float, p: JumpParams, rng: np.random.Generator) -> float:
    z = rng.standard_normal()
    n_jumps = rng.poisson(p.lam * DT)
    jump_component = 0.0
    if n_jumps > 0:
        jump_component = rng.normal(p.mu_j, p.sigma_j, size=n_jumps).sum()
    log_ret = (
        (p.mu - 0.5 * p.sigma ** 2 - p.lam * (np.exp(p.mu_j + 0.5 * p.sigma_j ** 2) - 1)) * DT
        + p.sigma * np.sqrt(DT) * z
        + jump_component
    )
    return s * np.exp(log_ret)


def _simulate_path(
    s0: float,
    particle: Particle,
    horizon: int,
    rng: np.random.Generator,
) -> np.ndarray:
    path = np.empty(horizon + 1, dtype=np.float64)
    path[0] = s0
    for h in range(1, horizon + 1):
        s = path[h - 1]
        if particle.model == SDEModel.GBM and particle.gbm:
            path[h] = _simulate_step_gbm(s, particle.gbm, rng)
        elif particle.model == SDEModel.OU and particle.ou:
            path[h] = _simulate_step_ou(s, particle.ou, rng)
        elif particle.model == SDEModel.JUMP and particle.jump:
            path[h] = _simulate_step_jump(s, particle.jump, rng)
        else:
            path[h] = s
    return path


def simulate_ensemble_paths(
    s0: float,
    particles: list[Particle],
    weights: np.ndarray,
    horizon: int,
    n_paths: int,
    rng: np.random.Generator,
) -> np.ndarray:
    """Ritorna paths (n_paths, horizon+1)."""
    model_indices = rng.choice(len(particles), size=n_paths, p=weights)
    paths = np.empty((n_paths, horizon + 1), dtype=np.float64)
    for b, idx in enumerate(model_indices):
        paths[b] = _simulate_path(s0, particles[idx], horizon, rng)
    return paths


# ---------------------------------------------------------------------------
# Risk metrics
# ---------------------------------------------------------------------------

def _horizon_indices(horizon: int, horizons: np.ndarray) -> np.ndarray:
    idx = np.round(horizons).astype(int)
    return np.clip(idx, 1, horizon)


def compute_support_violation_probs(
    paths: np.ndarray,
    support_levels: np.ndarray,
    horizons: np.ndarray,
) -> np.ndarray:
    """
    P(min_{1≤τ≤T} S_τ < support_k) per ogni livello k e orizzonte T.
    Ritorna (K, m).
    """
    if support_levels.size == 0:
        return np.zeros((0, len(horizons)))

    h_idx = _horizon_indices(paths.shape[1] - 1, horizons)
    K = len(support_levels)
    m = len(horizons)
    probs = np.zeros((K, m), dtype=np.float64)

    for j, T in enumerate(h_idx):
        window = paths[:, 1 : T + 1]
        min_path = window.min(axis=1)
        for k, level in enumerate(support_levels):
            probs[k, j] = float(np.mean(min_path < level))

    return probs


def compute_predictive_distribution(
    paths: np.ndarray,
    horizons: np.ndarray,
) -> dict[str, list[float]]:
    h_idx = _horizon_indices(paths.shape[1] - 1, horizons)
    terminal = np.array([paths[:, t] for t in h_idx]).T
    q_levels = [0.05, 0.25, 0.50, 0.75, 0.95]
    quantiles = {f"q{int(q * 100):02d}": np.quantile(terminal, q, axis=0).tolist() for q in q_levels}
    return {
        "horizons": horizons.astype(int).tolist(),
        "mean": terminal.mean(axis=0).tolist(),
        "std": terminal.std(axis=0, ddof=1).tolist(),
        "quantiles": quantiles,
    }


def compute_dynamic_var(
    paths: np.ndarray,
    s0: float,
    horizons: np.ndarray,
    alpha: float,
) -> dict[str, list[float]]:
    """VaR/CVaR su perdita relativa L_T = (S_0 - S_T) / S_0."""
    h_idx = _horizon_indices(paths.shape[1] - 1, horizons)
    losses = np.array([(s0 - paths[:, t]) / s0 for t in h_idx]).T
    var = np.quantile(losses, 1.0 - alpha, axis=0)
    cvar = []
    for j in range(losses.shape[1]):
        threshold = var[j]
        tail = losses[:, j][losses[:, j] >= threshold]
        cvar.append(float(tail.mean()) if len(tail) else float(threshold))
    return {
        "alpha": alpha,
        "horizons": horizons.astype(int).tolist(),
        "var": var.tolist(),
        "cvar": cvar,
    }


def compute_risk_scenarios(
    paths: np.ndarray,
    horizons: np.ndarray,
) -> dict[str, dict[str, float]]:
    h_idx = _horizon_indices(paths.shape[1] - 1, horizons)
    terminal = np.array([paths[:, t] for t in h_idx])
    # scenari al massimo orizzonte
    t_max = -1
    dist = terminal[t_max]
    return {
        "bear": {
            "horizon": int(horizons[t_max]),
            "price": float(np.quantile(dist, 0.05)),
            "return": float(np.quantile(dist, 0.05) / paths[0, 0] - 1.0),
        },
        "base": {
            "horizon": int(horizons[t_max]),
            "price": float(np.median(dist)),
            "return": float(np.median(dist) / paths[0, 0] - 1.0),
        },
        "bull": {
            "horizon": int(horizons[t_max]),
            "price": float(np.quantile(dist, 0.95)),
            "return": float(np.quantile(dist, 0.95) / paths[0, 0] - 1.0),
        },
    }


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def run_ensemble_sde_forecast(
    prices_df: pd.DataFrame,
    volatility_df: pd.DataFrame | None = None,
    jumps_df: pd.DataFrame | None = None,
    support_levels: np.ndarray | list[float] | None = None,
    horizons: np.ndarray | list[int] | None = None,
    config: EnsembleSDEConfig | None = None,
) -> dict[str, Any]:
    """
    Pipeline completa Ensemble SDE Forecast.

    Returns
    -------
    dict serializzabile JSON con:
      predictive_distribution, trajectories, support_violation,
      dynamic_var, risk_scenarios, particle_filter, gbm (fan chart compat)
    """
    cfg = config or EnsembleSDEConfig()
    rng = np.random.default_rng(cfg.seed)

    prices, vol_df, jumps_df_a = _align_frames(prices_df, volatility_df, jumps_df)
    close = prices["close"].to_numpy(dtype=np.float64)
    log_price = np.log(close)
    log_ret = _log_returns(close)

    if len(log_ret) < cfg.rolling_window + 5:
        raise ValueError(
            f"Serie troppo corta: servono almeno {cfg.rolling_window + 5} osservazioni"
        )

    if jumps_df_a is not None and "jump_indicator" in jumps_df_a.columns:
        indicators = jumps_df_a["jump_indicator"].iloc[1:].to_numpy(dtype=np.int8)
        jump_sizes = (
            jumps_df_a["jump_size"].iloc[1:].to_numpy(dtype=np.float64)
            if "jump_size" in jumps_df_a.columns
            else np.zeros(len(log_ret))
        )
        lam = (
            float(jumps_df_a["jump_intensity"].iloc[-1])
            if "jump_intensity" in jumps_df_a.columns
            else 0.0
        )
    else:
        indicators, jump_sizes, lam = _infer_jumps(log_ret, cfg.jump_threshold)

    vol_prior = _build_vol_prior(vol_df, _annualized_vol_from_returns(log_ret))

    _debug(
        f"Input — N={len(close)}, rolling_window={cfg.rolling_window}, "
        f"horizon={cfg.forecast_horizon}, n_paths={cfg.n_paths}"
    )
    jump_count = int(indicators.sum())
    enable_jump = jump_count >= MIN_JUMPS_FOR_JUMP_MODEL
    warnings: list[str] = []
    if not enable_jump:
        msg = (
            f"Only {jump_count} jump(s) detected (minimum {MIN_JUMPS_FOR_JUMP_MODEL} required). "
            "Jump-diffusion disabled — ensemble uses GBM + OU only."
        )
        warnings.append(msg)
        _debug(f"WARNING — {msg}")

    _debug(
        f"Jump detect — count={jump_count}, λ_annual={lam:.4f}, vol_prior={vol_prior:.4f}, "
        f"jump_model={'on' if enable_jump else 'off'}"
    )

    rolling_mat = calibrate_rolling_windows(
        log_price, log_ret, indicators, jump_sizes, lam, cfg.rolling_window, step=10
    )
    if rolling_mat.size:
        _debug_matrix(
            "Calibrazione rolling (ultime 3 finestre) "
            "[μ_gbm,σ_gbm,κ_ou,θ_ou,σ_ou,μ_j,σ_j,λ_j]",
            rolling_mat[-3:],
        )
        _debug_matrix(
            "Media rolling su tutte le finestre",
            rolling_mat.mean(axis=0, keepdims=True),
        )

    particles, weights, pf_diag = run_particle_filter(
        log_price, log_ret, indicators, jump_sizes, lam, vol_prior, cfg,
        enable_jump=enable_jump,
    )
    pf_diag["jump_count"] = jump_count
    pf_diag["warnings"] = warnings

    s0 = float(close[-1])
    paths = simulate_ensemble_paths(
        s0, particles, weights, cfg.forecast_horizon, cfg.n_paths, rng
    )

    _debug(f"Simulazione — paths shape=({paths.shape[0]}, {paths.shape[1]}), S0={s0:.4f}")
    step_q = np.quantile(paths, [0.05, 0.50, 0.95], axis=0)
    _debug_matrix("Quantili path [q05, q50, q95] × horizon", step_q[:, : min(10, step_q.shape[1])])

    if horizons is None:
        horizons_arr = np.array([1, 3, 5, 10, 20], dtype=np.int32)
    else:
        horizons_arr = np.asarray(horizons, dtype=np.int32)

    if support_levels is None:
        support_arr = np.array([], dtype=np.float64)
    else:
        support_arr = np.asarray(support_levels, dtype=np.float64)

    pred_dist = compute_predictive_distribution(paths, horizons_arr)
    var_dyn = compute_dynamic_var(paths, s0, horizons_arr, cfg.var_alpha)
    scenarios = compute_risk_scenarios(paths, horizons_arr)
    violation = compute_support_violation_probs(paths, support_arr, horizons_arr)

    if violation.size:
        _debug_matrix("Probabilità violazione supporti (K × m)", violation)
    else:
        _debug("Probabilità violazione supporti — nessun livello fornito")

    var_vec = np.array([var_dyn["var"], var_dyn["cvar"]])
    _debug_matrix(
        f"VaR/CVaR dinamico (α={cfg.var_alpha}) [VaR; CVaR] × horizons",
        var_vec,
    )
    _debug(
        f"Scenari — bear={scenarios['bear']['return']:.2%}, "
        f"base={scenarios['base']['return']:.2%}, "
        f"bull={scenarios['bull']['return']:.2%}"
    )

    # Compatibilità GbmFanChart: fan chart su tutti i passi del forecast
    step_quantiles = np.quantile(paths, [0.05, 0.50, 0.95], axis=0)
    gbm_fan = {
        "mean": step_quantiles[1, 1:].tolist(),
        "q05": step_quantiles[0, 1:].tolist(),
        "q95": step_quantiles[2, 1:].tolist(),
    }

    sample_idx = rng.choice(paths.shape[0], size=min(cfg.max_paths_ui, paths.shape[0]), replace=False)
    sample_paths = paths[sample_idx].tolist()

    return {
        "meta": {
            "s0": s0,
            "n_observations": int(len(close)),
            "forecast_horizon": cfg.forecast_horizon,
            "n_paths": cfg.n_paths,
            "models": list(MODEL_NAMES.values()),
            "jump_count": jump_count,
            "jump_model_enabled": enable_jump,
            "warnings": warnings,
        },
        "predictive_distribution": pred_dist,
        "trajectories": {
            "sample_paths": sample_paths,
            "n_paths": cfg.n_paths,
            "horizon": cfg.forecast_horizon,
        },
        "support_violation": {
            "levels": support_arr.tolist(),
            "probabilities": violation.tolist(),
            "horizons": horizons_arr.tolist(),
        },
        "dynamic_var": var_dyn,
        "risk_scenarios": scenarios,
        "particle_filter": pf_diag,
        "gbm": gbm_fan,
    }


def build_inputs_from_arrays(
    dates: np.ndarray | list,
    close: np.ndarray,
    high: np.ndarray | None = None,
    low: np.ndarray | None = None,
    volume: np.ndarray | None = None,
    realized_vol: np.ndarray | None = None,
) -> tuple[pd.DataFrame, pd.DataFrame | None]:
    """Helper per costruire i dataframe attesi a partire da array numpy."""
    idx = pd.to_datetime(dates)
    prices_df = pd.DataFrame({"close": close}, index=idx)
    if high is not None:
        prices_df["high"] = high
    if low is not None:
        prices_df["low"] = low
    if volume is not None:
        prices_df["volume"] = volume

    vol_df = None
    if realized_vol is not None:
        vol_df = pd.DataFrame({"realized_vol": realized_vol}, index=idx)

    return prices_df, vol_df
