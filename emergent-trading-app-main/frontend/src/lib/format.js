/** Display helpers for finance metrics. Keep formatting in one place. */

export const formatPercent = (value, digits = 2) => {
    if (value === null || value === undefined || Number.isNaN(value)) return "—";
    const sign = value > 0 ? "+" : "";
    return `${sign}${(value * 100).toFixed(digits)}%`;
};

export const formatAbsPercent = (value, digits = 2) => {
    if (value === null || value === undefined || Number.isNaN(value)) return "—";
    return `${(value * 100).toFixed(digits)}%`;
};

export const formatNumber = (value, digits = 2) => {
    if (value === null || value === undefined || Number.isNaN(value)) return "—";
    return Number(value).toLocaleString("en-US", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    });
};

export const formatPrice = (value, currency) => {
    if (value === null || value === undefined) return "—";
    const num = formatNumber(value, 2);
    return currency ? `${num} ${currency}` : num;
};

export const formatRatio = (value, digits = 2) => {
    if (value === null || value === undefined || Number.isNaN(value)) return "—";
    return value.toFixed(digits);
};
