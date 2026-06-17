/**
 * MathText.jsx
 * ────────────────────────────────────────────────────────────────────────────
 * Self-contained, dependency-free inline LaTeX renderer.
 *
 * Rationale: the analyst guides require *rigorous mathematical notation*
 * (MathJax/LaTeX inline). Rather than pulling a heavy KaTeX/MathJax bundle into
 * a research UI, we ship a small, fast parser that covers the subset actually
 * used across the desk: Greek letters, blackboard symbols, sub/superscripts,
 * fractions, roots, accents and the common operators/relations. Everything is
 * rendered as styled inline HTML (italic serif math face), upright where TeX
 * would keep it upright (\mathrm, \text, operators, digits).
 *
 * Public API:
 *   <MathInline>\sigma\sqrt{T}</MathInline>   single math expression
 *   <RichText text="Il VaR è $\mathrm{VaR}_{95}$ ..." />   prose + $…$ spans
 */

import React from "react";

// ── Symbol table: \command → unicode glyph ──────────────────────────────────
const SYMBOLS = {
    // lower-case greek
    alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ϵ",
    varepsilon: "ε", zeta: "ζ", eta: "η", theta: "θ", vartheta: "ϑ",
    iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ",
    pi: "π", rho: "ρ", varrho: "ϱ", sigma: "σ", tau: "τ", upsilon: "υ",
    phi: "φ", varphi: "φ", chi: "χ", psi: "ψ", omega: "ω",
    // upper-case greek
    Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π",
    Sigma: "Σ", Upsilon: "Υ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
    // operators & relations
    times: "×", cdot: "·", div: "÷", pm: "±", mp: "∓", ast: "∗",
    star: "⋆", circ: "∘", bullet: "•", oplus: "⊕", otimes: "⊗",
    leq: "≤", le: "≤", geq: "≥", ge: "≥", neq: "≠", ne: "≠",
    approx: "≈", simeq: "≃", sim: "∼", equiv: "≡", propto: "∝", cong: "≅",
    gtrsim: "≳", lesssim: "≲", ll: "≪", gg: "≫",
    to: "→", rightarrow: "→", longrightarrow: "⟶",
    Rightarrow: "⇒", Leftarrow: "⇐", leftarrow: "←", mapsto: "↦",
    leftrightarrow: "↔", uparrow: "↑", downarrow: "↓",
    in: "∈", notin: "∉", ni: "∋", subset: "⊂", subseteq: "⊆",
    supset: "⊃", supseteq: "⊇", cup: "∪", cap: "∩", setminus: "∖",
    emptyset: "∅", varnothing: "∅", forall: "∀", exists: "∃",
    nexists: "∄", neg: "¬", land: "∧", wedge: "∧", lor: "∨", vee: "∨",
    // big operators
    sum: "∑", prod: "∏", int: "∫", iint: "∬", oint: "∮", coprod: "∐",
    bigwedge: "⋀", bigvee: "⋁", bigcup: "⋃", bigcap: "⋂",
    bigoplus: "⨁", bigotimes: "⨂",
    // misc
    partial: "∂", nabla: "∇", infty: "∞", angle: "∠", perp: "⊥",
    parallel: "∥", mid: "∣", dagger: "†", hbar: "ℏ", ell: "ℓ",
    Re: "ℜ", Im: "ℑ", aleph: "ℵ", deg: "°", prime: "′",
    langle: "⟨", rangle: "⟩", lceil: "⌈", rceil: "⌉",
    lfloor: "⌊", rfloor: "⌋", cdots: "⋯", ldots: "…", dots: "…",
    vdots: "⋮", ddots: "⋱", surd: "√", checkmark: "✓",
    // spacing — collapse to a thin space
    quad: "\u2003", qquad: "\u2003\u2003", ",": "\u2009", ";": "\u2005",
    "!": "", " ": " ",
};

// Blackboard-bold (\mathbb) and a few caligraphic mappings.
const BLACKBOARD = {
    R: "ℝ", N: "ℕ", Z: "ℤ", Q: "ℚ", C: "ℂ", E: "𝔼", P: "ℙ",
    F: "𝔽", H: "ℍ", D: "𝔻", S: "𝕊", T: "𝕋", 1: "𝟙",
};

// Calligraphic / script (\mathcal, \mathscr) — used for sheaves, sites, schemes.
const CALLIGRAPHIC = {
    A: "𝒜", B: "ℬ", C: "𝒞", D: "𝒟", E: "ℰ", F: "ℱ", G: "𝒢",
    H: "ℋ", I: "ℐ", J: "𝒥", K: "𝒦", L: "ℒ", M: "ℳ", N: "𝒩",
    O: "𝒪", P: "𝒫", Q: "𝒬", R: "ℛ", S: "𝒮", T: "𝒯", U: "𝒰",
    V: "𝒱", W: "𝒲", X: "𝒳", Y: "𝒴", Z: "𝒵",
};

// Fraktur (\mathfrak) — used for prime/maximal ideals 𝔭, 𝔪 …
const FRAKTUR = {
    A: "𝔄", B: "𝔅", C: "ℭ", D: "𝔇", E: "𝔈", F: "𝔉", G: "𝔊",
    H: "ℌ", I: "ℑ", J: "𝔍", K: "𝔎", L: "𝔏", M: "𝔐", N: "𝔑",
    O: "𝔒", P: "𝔓", Q: "𝔔", R: "ℜ", S: "𝔖", T: "𝔗", U: "𝔘",
    V: "𝔙", W: "𝔚", X: "𝔛", Y: "𝔜", Z: "ℨ",
    a: "𝔞", b: "𝔟", c: "𝔠", d: "𝔡", e: "𝔢", f: "𝔣", g: "𝔤",
    h: "𝔥", i: "𝔦", j: "𝔧", k: "𝔨", l: "𝔩", m: "𝔪", n: "𝔫",
    o: "𝔬", p: "𝔭", q: "𝔮", r: "𝔯", s: "𝔰", t: "𝔱", u: "𝔲",
    v: "𝔳", w: "𝔴", x: "𝔵", y: "𝔶", z: "𝔷",
};

const MATH_FONT =
    "'Cambria Math', 'Latin Modern Math', 'STIX Two Math', 'Times New Roman', Georgia, serif";

/** Reads a single LaTeX argument starting at index `i`. */
function readArg(src, i) {
    if (src[i] === "{") {
        let depth = 0;
        let j = i;
        for (; j < src.length; j++) {
            if (src[j] === "{") depth++;
            else if (src[j] === "}") {
                depth--;
                if (depth === 0) {
                    j++;
                    break;
                }
            }
        }
        return { raw: src.slice(i + 1, j - 1), next: j };
    }
    if (src[i] === "\\") {
        let j = i + 1;
        while (j < src.length && /[a-zA-Z]/.test(src[j])) j++;
        if (j === i + 1) j = i + 2; // escaped single char, e.g. \,
        return { raw: src.slice(i, j), next: j };
    }
    return { raw: src[i] ?? "", next: i + 1 };
}

const upright = (children, key, extra = {}) => (
    <span key={key} style={{ fontStyle: "normal", ...extra }}>
        {children}
    </span>
);

/** Drop a leading backslash before non-letter chars, e.g. "P\_t" → "P_t". */
const stripEscapes = (s) => s.replace(/\\([^a-zA-Z])/g, "$1");

/** Recursive-descent parser: LaTeX (subset) → array of React nodes. */
function parse(src, kp = "m") {
    const nodes = [];
    let buf = "";
    let i = 0;
    let k = 0;

    const flush = () => {
        if (buf) {
            nodes.push(<React.Fragment key={`${kp}-t${k++}`}>{buf}</React.Fragment>);
            buf = "";
        }
    };

    while (i < src.length) {
        const ch = src[i];

        if (ch === "\\") {
            let j = i + 1;
            while (j < src.length && /[a-zA-Z]/.test(src[j])) j++;
            const name = src.slice(i + 1, j);

            // Escaped punctuation: \{ \} \$ \% \_ \& and spacing macros \, \;
            if (name === "") {
                const esc = src[i + 1];
                if (esc === "," || esc === ";" || esc === "!" || esc === " ") {
                    buf += SYMBOLS[esc] ?? " ";
                } else {
                    buf += esc ?? "";
                }
                i += 2;
                continue;
            }

            if (name === "frac" || name === "tfrac" || name === "dfrac") {
                flush();
                const a = readArg(src, j);
                const b = readArg(src, a.next);
                nodes.push(
                    <Frac
                        key={`${kp}-f${k++}`}
                        num={parse(a.raw, `${kp}-fn${k}`)}
                        den={parse(b.raw, `${kp}-fd${k}`)}
                    />,
                );
                i = b.next;
                continue;
            }

            if (name === "sqrt") {
                flush();
                const a = readArg(src, j);
                nodes.push(
                    <span key={`${kp}-r${k++}`} style={{ whiteSpace: "nowrap" }}>
                        <span style={{ fontStyle: "normal" }}>√</span>
                        <span
                            style={{
                                borderTop: "1px solid currentColor",
                                paddingTop: 1,
                            }}
                        >
                            {parse(a.raw, `${kp}-rr${k}`)}
                        </span>
                    </span>,
                );
                i = a.next;
                continue;
            }

            if (name === "mathbb") {
                flush();
                const a = readArg(src, j);
                const mapped = a.raw
                    .split("")
                    .map((c) => BLACKBOARD[c] || c)
                    .join("");
                nodes.push(upright(mapped, `${kp}-bb${k++}`));
                i = a.next;
                continue;
            }

            if (name === "mathcal" || name === "mathscr" || name === "mathfrak") {
                flush();
                const a = readArg(src, j);
                const map = name === "mathfrak" ? FRAKTUR : CALLIGRAPHIC;
                const mapped = a.raw
                    .split("")
                    .map((c) => map[c] || c)
                    .join("");
                nodes.push(upright(mapped, `${kp}-cal${k++}`));
                i = a.next;
                continue;
            }

            if (name === "mathrm" || name === "text" || name === "operatorname" || name === "mathsf") {
                flush();
                const a = readArg(src, j);
                nodes.push(upright(stripEscapes(a.raw), `${kp}-rm${k++}`));
                i = a.next;
                continue;
            }

            if (name === "texttt" || name === "mathtt") {
                flush();
                const a = readArg(src, j);
                nodes.push(
                    upright(stripEscapes(a.raw), `${kp}-tt${k++}`, {
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: "0.92em",
                    }),
                );
                i = a.next;
                continue;
            }

            if (name === "mathbf" || name === "boldsymbol") {
                flush();
                const a = readArg(src, j);
                nodes.push(
                    <span key={`${kp}-bf${k++}`} style={{ fontWeight: 700 }}>
                        {parse(a.raw, `${kp}-bff${k}`)}
                    </span>,
                );
                i = a.next;
                continue;
            }

            if (name === "bar" || name === "overline") {
                flush();
                const a = readArg(src, j);
                nodes.push(
                    <span
                        key={`${kp}-bar${k++}`}
                        style={{ textDecoration: "overline" }}
                    >
                        {parse(a.raw, `${kp}-barr${k}`)}
                    </span>,
                );
                i = a.next;
                continue;
            }

            if (name === "hat" || name === "tilde" || name === "vec" || name === "dot") {
                flush();
                const accent =
                    name === "hat" ? "\u0302" : name === "tilde" ? "\u0303" : name === "vec" ? "\u20D7" : "\u0307";
                const a = readArg(src, j);
                nodes.push(
                    <span key={`${kp}-ac${k++}`}>
                        {parse(a.raw, `${kp}-acc${k}`)}
                        <span style={{ fontStyle: "normal" }}>{accent}</span>
                    </span>,
                );
                i = a.next;
                continue;
            }

            if (Object.prototype.hasOwnProperty.call(SYMBOLS, name)) {
                buf += SYMBOLS[name];
                i = j;
                continue;
            }

            // Unknown command — render its name upright (e.g. \log, \min, \max).
            flush();
            nodes.push(upright(name, `${kp}-cmd${k++}`));
            i = j;
            continue;
        }

        if (ch === "{") {
            const a = readArg(src, i);
            flush();
            nodes.push(
                <React.Fragment key={`${kp}-g${k++}`}>
                    {parse(a.raw, `${kp}-gg${k}`)}
                </React.Fragment>,
            );
            i = a.next;
            continue;
        }

        if (ch === "_" || ch === "^") {
            flush();
            const a = readArg(src, i + 1);
            const inner = parse(a.raw, `${kp}-s${k}`);
            nodes.push(
                ch === "_" ? (
                    <sub key={`${kp}-sb${k++}`} style={{ fontSize: "0.72em" }}>
                        {inner}
                    </sub>
                ) : (
                    <sup key={`${kp}-sp${k++}`} style={{ fontSize: "0.72em" }}>
                        {inner}
                    </sup>
                ),
            );
            i = a.next;
            continue;
        }

        buf += ch;
        i++;
    }

    flush();
    return nodes;
}

/** Inline stacked fraction. */
const Frac = ({ num, den }) => (
    <span
        style={{
            display: "inline-flex",
            flexDirection: "column",
            alignItems: "center",
            verticalAlign: "middle",
            margin: "0 0.15em",
            fontSize: "0.85em",
            lineHeight: 1.05,
        }}
    >
        <span style={{ padding: "0 0.2em" }}>{num}</span>
        <span
            style={{
                padding: "0 0.2em",
                borderTop: "1px solid currentColor",
            }}
        >
            {den}
        </span>
    </span>
);

/** Renders one LaTeX (subset) expression as inline math. */
export const MathInline = ({ children, className = "" }) => {
    const src = typeof children === "string" ? children : "";
    return (
        <span
            className={className}
            style={{ fontFamily: MATH_FONT, fontStyle: "italic", whiteSpace: "normal" }}
        >
            {parse(src)}
        </span>
    );
};

/**
 * Renders prose that may embed inline math delimited by `$…$`.
 * Everything outside the delimiters is plain text; inside is parsed as LaTeX.
 */
export const RichText = ({ text = "", className = "" }) => {
    const parts = [];
    const re = /\$([^$]+)\$/g;
    let last = 0;
    let m;
    let idx = 0;
    while ((m = re.exec(text)) !== null) {
        if (m.index > last) {
            parts.push(
                <React.Fragment key={`rt-x${idx++}`}>
                    {text.slice(last, m.index)}
                </React.Fragment>,
            );
        }
        parts.push(<MathInline key={`rt-m${idx++}`}>{m[1]}</MathInline>);
        last = re.lastIndex;
    }
    if (last < text.length) {
        parts.push(
            <React.Fragment key={`rt-x${idx++}`}>
                {text.slice(last)}
            </React.Fragment>,
        );
    }
    return <span className={className}>{parts}</span>;
};

export default MathInline;
