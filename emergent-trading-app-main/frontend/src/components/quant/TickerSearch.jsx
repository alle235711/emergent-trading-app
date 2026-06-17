import React, { useState } from "react";
import { Search } from "lucide-react";

/**
 * Terminal-style ticker input with submit on Enter or button click.
 */
export const TickerSearch = ({
    initialValue = "",
    onSubmit,
    disabled = false,
    placeholder = "ENTER TICKER (e.g. AAPL, BTC-USD, SPY, ^GSPC)",
}) => {
    const [value, setValue] = useState(initialValue);

    const submit = (e) => {
        e?.preventDefault();
        const v = value.trim().toUpperCase();
        if (!v) return;
        onSubmit(v);
    };

    return (
        <form
            onSubmit={submit}
            className="flex items-center gap-3 w-full max-w-xl"
            data-testid="ticker-search-form"
        >
            <div className="flex items-center gap-3 flex-1 border-b border-[#222222] focus-within:border-[#00E5C0] transition-colors duration-150">
                <Search size={16} className="text-neutral-500 shrink-0" strokeWidth={1.5} />
                <input
                    type="text"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder={placeholder}
                    disabled={disabled}
                    spellCheck={false}
                    autoComplete="off"
                    className="bg-transparent w-full py-3 outline-none border-0 text-sm sm:text-base font-mono uppercase tracking-wider placeholder:text-neutral-600 text-white"
                    data-testid="ticker-search-input"
                />
            </div>

            <button
                type="submit"
                disabled={disabled || !value.trim()}
                data-testid="ticker-search-submit"
                className="text-xs font-mono tracking-[0.2em] uppercase px-4 py-3 border border-[#00E5C0] text-[#00E5C0] hover:bg-[#00E5C0] hover:text-black transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#00E5C0]"
            >
                Analyze
            </button>
        </form>
    );
};

export default TickerSearch;
