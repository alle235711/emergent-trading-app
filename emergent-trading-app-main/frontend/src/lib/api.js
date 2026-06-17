import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "http://localhost:8000";
export const API = `${BACKEND_URL}/api`;

/** WebSocket origin derived from the backend URL (http→ws, https→wss). */
export const WS_BASE = BACKEND_URL.replace(/^http/, "ws");

/** Build the unified market-stream WebSocket URL for a ticker. */
export const marketStreamUrl = (ticker) =>
    `${WS_BASE}/ws/market-stream/${encodeURIComponent(ticker)}`;

/**
 * Fetch market data + metrics for a given ticker and period.
 * @param {string} ticker  Yahoo Finance ticker symbol
 * @param {"1y"|"2y"|"5y"|"max"} period
 */
export async function fetchMarketData(ticker, period = "2y") {
    const { data } = await axios.get(`${API}/market/data`, {
        params: { ticker, period },
        timeout: 30000,
    });
    return data;
}

/**
 * Full OHLCV candles + live last price (Yahoo history + hybrid quote).
 */
export async function fetchMarketOhlc(ticker, period = "2y") {
    const { data } = await axios.get(`${API}/market/ohlc`, {
        params: { ticker, period },
        timeout: 45000,
    });
    return data;
}

// ---------------------------------------------------------------------------
// User-scoped endpoints (watchlist + broker keys).
// ---------------------------------------------------------------------------
const USER_TIMEOUT = 15000;

export async function getWatchlist(userId) {
    const { data } = await axios.get(`${API}/user/watchlist`, {
        params: { user_id: userId },
        timeout: USER_TIMEOUT,
    });
    return data;
}

export async function addWatchlistTicker(userId, ticker) {
    const { data } = await axios.post(
        `${API}/user/watchlist`,
        { user_id: userId, ticker },
        { timeout: USER_TIMEOUT },
    );
    return data;
}

export async function removeWatchlistTicker(userId, ticker) {
    const { data } = await axios.delete(`${API}/user/watchlist`, {
        params: { user_id: userId, ticker },
        timeout: USER_TIMEOUT,
    });
    return data;
}

export async function getBrokerKeys(userId) {
    const { data } = await axios.get(`${API}/user/broker-keys`, {
        params: { user_id: userId },
        timeout: USER_TIMEOUT,
    });
    return data;
}

export async function saveBrokerKeys(userId, payload) {
    const { data } = await axios.post(
        `${API}/user/broker-keys`,
        { user_id: userId, ...payload },
        { timeout: USER_TIMEOUT },
    );
    return data;
}

export async function deleteBrokerKeys(userId) {
    const { data } = await axios.delete(`${API}/user/broker-keys`, {
        params: { user_id: userId },
        timeout: USER_TIMEOUT,
    });
    return data;
}

/**
 * Fetch support/resistance probability matrix.
 */
export async function fetchSupportMatrix(ticker, period = "2y", params = {}) {
    const { data } = await axios.get(`${API}/market/support-matrix`, {
        params: { ticker, period, ...params },
        timeout: 60000,
    });
    return data;
}

// ---------------------------------------------------------------------------
// Topological Data Analysis (TDA) endpoints
// ---------------------------------------------------------------------------
const TDA_TIMEOUT = 120000; // TDA computations can be heavy

/**
 * FNN / Cao embedding dimension estimation.
 * Returns { status, module, data: { d_recommended, d_star_kennel, d_star_cao,
 *   tau_used, chart_fnn:[{d,fnn_pct,label}], chart_cao:[{d,E1,Estar}],
 *   summary:{interpretation,warning} }, warnings }
 */
export async function fetchTdaFnn(ticker, period = "1y", { interval = "1d", d_max = 10 } = {}) {
    const { data } = await axios.get(`${API}/tda/fnn`, {
        params: { ticker, period, interval, d_max },
        timeout: TDA_TIMEOUT,
    });
    return data;
}

/**
 * Mapper graph analysis.
 * Returns { status, module, data: { graph:{nodes:[{id,size,color,pts}],edges:[{source,target}]},
 *   meta:{n_nodes,n_edges,filter,d_used,tau_used,color_range:[min,max]},
 *   filter_series:[...] }, warnings }
 */
export async function fetchTdaMapper(ticker, period = "1y", params = {}) {
    const {
        interval = "1d",
        d = 4,
        tau = 3,
        filter_type = "pca1",
        n_cubes = 10,
        overlap_pct = 0.5,
        cluster_algo = "single",
    } = params;
    const { data } = await axios.get(`${API}/tda/mapper`, {
        params: { ticker, period, interval, d, tau, filter_type, n_cubes, overlap_pct, cluster_algo },
        timeout: TDA_TIMEOUT,
    });
    return data;
}

/**
 * Full TDA pipeline: topology series + persistence diagrams + GBM simulations.
 * Returns { status, module, data: { topology_series:[{t,Pi_H0,Pi_H1,E_H0,E_H1,beta_0,beta_1,eta_0,eta_1,regime}],
 *   persistence_diagrams:[...], simulations:{"t_idx":{paths_summary:{mean,q05,q95,std}}},
 *   meta:{n_timesteps,tau_used,n_sparse,windows_sampled} }, warnings }
 */
// ---------------------------------------------------------------------------
// Ensemble SDE Forecast
// ---------------------------------------------------------------------------
const FORECAST_TIMEOUT = 120000;

/**
 * Ensemble SDE forecast: GBM + OU + Jump-diffusion with particle filtering.
 * Returns { status, module, ticker, period, result: {
 *   meta, predictive_distribution, trajectories, support_violation,
 *   dynamic_var, risk_scenarios, particle_filter, gbm: { mean, q05, q95 }
 * }}
 */
export async function fetchEnsembleSdeForecast(ticker, period = "2y", params = {}) {
    const {
        rolling_window = 60,
        n_particles = 300,
        n_paths = 2000,
        forecast_horizon = 20,
        var_alpha = 0.05,
        include_support = true,
    } = params;
    const { data } = await axios.get(`${API}/forecast/ensemble-sde`, {
        params: {
            ticker,
            period,
            rolling_window,
            n_particles,
            n_paths,
            forecast_horizon,
            var_alpha,
            include_support,
        },
        timeout: FORECAST_TIMEOUT,
    });
    return data;
}

// ---------------------------------------------------------------------------
// Paper Trading engine (PaperBroker) — Part 2
// ---------------------------------------------------------------------------
const PAPER_TIMEOUT = 20000;

/**
 * Submit a paper order to the backend PaperBroker. The fill price is the live
 * mark from the hybrid WebSocket feed (for market orders).
 * @param {{ticker:string, side:"buy"|"sell", quantity:number,
 *          order_type?:"market"|"limit"|"stop", limit_price?:number|null}} order
 */
export async function executePaperOrder(order) {
    const { data } = await axios.post(`${API}/execute`, order, { timeout: PAPER_TIMEOUT });
    return data;
}

/** Fetch the live-marked simulated portfolio. */
export async function getPaperPortfolio() {
    const { data } = await axios.get(`${API}/paper/portfolio`, { timeout: PAPER_TIMEOUT });
    return data;
}

/** Recent paper orders (blotter). */
export async function getPaperOrders(limit = 50) {
    const { data } = await axios.get(`${API}/paper/orders`, {
        params: { limit },
        timeout: PAPER_TIMEOUT,
    });
    return data;
}

/** Reset the simulated portfolio to its initial cash. */
export async function resetPaperPortfolio() {
    const { data } = await axios.post(`${API}/paper/reset`, {}, { timeout: PAPER_TIMEOUT });
    return data;
}

// ---------------------------------------------------------------------------
// Sheaf Cohomology (Model 10)
// ---------------------------------------------------------------------------
const SHEAF_TIMEOUT = 90000;

/**
 * Čech cohomology H¹ of market-data sheaf over peer nerve cover.
 * Returns { status, module, ticker, result: { nodes, edges, cocycles, series, metrics, meta } }
 */
export async function fetchSheafCohomology(ticker, { days = 30, horizon = "medium", connectivity } = {}) {
    const params = { ticker, days, horizon };
    if (connectivity != null) params.connectivity = connectivity;
    const { data } = await axios.get(`${API}/sheaf/cohomology`, {
        params,
        timeout: SHEAF_TIMEOUT,
    });
    return data;
}

// ---------------------------------------------------------------------------
// Geometry models (Clique, Affine Scheme, Hodge, Quantum Graph)
// ---------------------------------------------------------------------------
const GEOMETRY_TIMEOUT = 90000;

export async function fetchTdaClique(ticker, { days = 90, horizon = "medium", n_peers = 10 } = {}) {
    const { data } = await axios.get(`${API}/tda/clique`, {
        params: { ticker, days, horizon, n_peers },
        timeout: GEOMETRY_TIMEOUT,
    });
    return data;
}

export async function fetchAffineScheme(ticker, { days = 120, horizon = "medium" } = {}) {
    const { data } = await axios.get(`${API}/algebra/scheme`, {
        params: { ticker, days, horizon },
        timeout: GEOMETRY_TIMEOUT,
    });
    return data;
}

export async function fetchHodgeDecompose(ticker, { days = 60, horizon = "medium", n_assets = 8 } = {}) {
    const { data } = await axios.get(`${API}/hodge/decompose`, {
        params: { ticker, days, horizon, n_assets },
        timeout: GEOMETRY_TIMEOUT,
    });
    return data;
}

export async function fetchQuantumGraphSpectrum(ticker, { days = 180, horizon = "medium", n_assets = 30 } = {}) {
    const { data } = await axios.get(`${API}/spectral/quantum-graph`, {
        params: { ticker, days, horizon, n_assets },
        timeout: GEOMETRY_TIMEOUT,
    });
    return data;
}

// ---------------------------------------------------------------------------
// Ticker validation & search
// ---------------------------------------------------------------------------
const TICKER_TIMEOUT = 15000;

export async function fetchTickerValidate(ticker) {
    const { data } = await axios.get(`${API}/ticker/validate`, {
        params: { ticker },
        timeout: TICKER_TIMEOUT,
    });
    return data;
}

export async function fetchTickerSearch(q) {
    const { data } = await axios.get(`${API}/ticker/search`, {
        params: { q },
        timeout: TICKER_TIMEOUT,
    });
    return data;
}

const BACKTEST_TIMEOUT = 600000;

export async function fetchBacktest({ ticker, model, start, end, horizon = 5 }) {
    const { data } = await axios.get(`${API}/backtest`, {
        params: { ticker, model, start, end, horizon },
        timeout: BACKTEST_TIMEOUT,
    });
    return data;
}

export async function fetchBacktestProgress() {
    const { data } = await axios.get(`${API}/backtest/progress`, { timeout: 10000 });
    return data;
}

export async function fetchBacktestSummary(ticker, model, { years = 2, horizon = 5 } = {}) {
    const { data } = await axios.get(`${API}/backtest/summary`, {
        params: { ticker, model, years, horizon },
        timeout: BACKTEST_TIMEOUT,
    });
    return data;
}

// ---------------------------------------------------------------------------
// Convergence Dashboard
// ---------------------------------------------------------------------------
const CONVERGENCE_TIMEOUT = 180000;

export async function fetchConvergence(ticker, { days = 90, horizon = "medium" } = {}) {
    const { data } = await axios.get(`${API}/convergence`, {
        params: { ticker, days, horizon },
        timeout: CONVERGENCE_TIMEOUT,
    });
    return data;
}

// ---------------------------------------------------------------------------
// Analysis Journal
// ---------------------------------------------------------------------------
const JOURNAL_TIMEOUT = 30000;

export async function createJournalEntry(payload) {
    const { data } = await axios.post(`${API}/journal/entry`, payload, {
        timeout: CONVERGENCE_TIMEOUT,
    });
    return data;
}

export async function listJournalEntries(params = {}) {
    const { data } = await axios.get(`${API}/journal/entries`, {
        params,
        timeout: JOURNAL_TIMEOUT,
    });
    return data;
}

export async function getJournalEntry(id) {
    const { data } = await axios.get(`${API}/journal/entry/${id}`, {
        timeout: JOURNAL_TIMEOUT,
    });
    return data;
}

export async function updateJournalEntry(id, payload) {
    const { data } = await axios.patch(`${API}/journal/entry/${id}`, payload, {
        timeout: JOURNAL_TIMEOUT,
    });
    return data;
}

export async function deleteJournalEntry(id) {
    const { data } = await axios.delete(`${API}/journal/entry/${id}`, {
        timeout: JOURNAL_TIMEOUT,
    });
    return data;
}

export async function exportJournalJson(ticker) {
    const { data } = await axios.get(`${API}/journal/export/json`, {
        params: ticker ? { ticker } : {},
        timeout: JOURNAL_TIMEOUT,
    });
    return data;
}

export async function exportJournalCsv(ticker) {
    const { data } = await axios.get(`${API}/journal/export/csv`, {
        params: ticker ? { ticker } : {},
        timeout: JOURNAL_TIMEOUT,
        responseType: "text",
    });
    return data;
}

// ---------------------------------------------------------------------------
// Email Alerts
// ---------------------------------------------------------------------------
export async function getAlertConfig() {
    const { data } = await axios.get(`${API}/alerts/config`, { timeout: JOURNAL_TIMEOUT });
    return data;
}

export async function createAlertRule(rule) {
    const { data } = await axios.post(`${API}/alerts/rules`, rule, { timeout: JOURNAL_TIMEOUT });
    return data;
}

export async function updateAlertRule(id, updates) {
    const { data } = await axios.patch(`${API}/alerts/rules/${id}`, updates, { timeout: JOURNAL_TIMEOUT });
    return data;
}

export async function deleteAlertRule(id) {
    const { data } = await axios.delete(`${API}/alerts/rules/${id}`, { timeout: JOURNAL_TIMEOUT });
    return data;
}

export async function testAlertEmail() {
    const { data } = await axios.post(`${API}/alerts/test-email`, {}, { timeout: JOURNAL_TIMEOUT });
    return data;
}

export async function updateAlertEmailTo(email) {
    const { data } = await axios.put(`${API}/alerts/email-settings`, { email_to: email }, { timeout: JOURNAL_TIMEOUT });
    return data;
}

export async function runAlertChecks() {
    const { data } = await axios.post(`${API}/alerts/run-checks`, {}, { timeout: CONVERGENCE_TIMEOUT });
    return data;
}

export async function fetchTdaFull(ticker, period = "1y", params = {}) {
    const {
        interval = "1d",
        d = 4,
        tau = 3,
        W = 100,
        max_dim = 2,
    } = params;
    const { data } = await axios.get(`${API}/tda/full`, {
        params: { ticker, period, interval, d, tau, W, max_dim },
        timeout: TDA_TIMEOUT,
    });
    return data;
}
