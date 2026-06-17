/**
 * Lightweight rolling historical validation for the SDE forecast page.
 * Uses Yahoo OHLC closes only — not forward-looking.
 */

const TRADING_DAYS = 252;

function logReturns(closes) {
    const out = [];
    for (let i = 1; i < closes.length; i += 1) {
        out.push(Math.log(closes[i] / closes[i - 1]));
    }
    return out;
}

function gbmForecast(closes, calWindow, horizonDays) {
    if (closes.length < calWindow + horizonDays + 1) return null;
    const slice = closes.slice(-(calWindow + horizonDays + 1), -(horizonDays));
    const lr = logReturns(slice);
    if (lr.length < 5) return null;
    const mu = lr.reduce((s, r) => s + r, 0) / lr.length * TRADING_DAYS;
    const variance =
        lr.reduce((s, r) => {
            const m = lr.reduce((a, b) => a + b, 0) / lr.length;
            return s + (r - m) ** 2;
        }, 0) / Math.max(lr.length - 1, 1);
    const sigma = Math.sqrt(variance * TRADING_DAYS);
    const s0 = closes[closes.length - horizonDays - 1];
    const expectedLog = (mu - 0.5 * sigma ** 2) * (horizonDays / TRADING_DAYS);
    const predicted = s0 * Math.exp(expectedLog);
    const actual = closes[closes.length - 1];
    const predictedUp = predicted >= s0;
    const actualUp = actual >= s0;
    return {
        predicted,
        actual,
        s0,
        directionHit: predictedUp === actualUp,
        absError: Math.abs(predicted - actual),
        pctError: Math.abs((predicted - actual) / actual) * 100,
    };
}

/**
 * Rolling walk-forward validation over the last `windowDays` trading days.
 * @param {number[]} closes chronological close prices
 * @param {{windowDays?:number, calWindow?:number, horizonDays?:number}} opts
 */
export function runSdeBacktest(closes, opts = {}) {
    const windowDays = opts.windowDays ?? 30;
    const calWindow = opts.calWindow ?? 60;
    const horizonDays = opts.horizonDays ?? 1;

    if (!closes?.length || closes.length < calWindow + windowDays + horizonDays + 2) {
        return { rows: [], summary: null };
    }

    const rows = [];
    for (let offset = windowDays; offset >= 1; offset -= 1) {
        const end = closes.length - offset;
        const sub = closes.slice(0, end + horizonDays);
        const row = gbmForecast(sub, calWindow, horizonDays);
        if (!row) continue;
        rows.push({
            day: offset,
            ...row,
        });
    }

    if (!rows.length) return { rows: [], summary: null };

    const directionAccuracy =
        (rows.filter((r) => r.directionHit).length / rows.length) * 100;
    const mae = rows.reduce((s, r) => s + r.absError, 0) / rows.length;
    const mape = rows.reduce((s, r) => s + r.pctError, 0) / rows.length;

    return {
        rows,
        summary: {
            n: rows.length,
            directionAccuracy,
            mae,
            mape,
            horizonDays,
            calWindow,
        },
    };
}

export default runSdeBacktest;
