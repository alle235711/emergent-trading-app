/**
 * analystGuides.js
 * ────────────────────────────────────────────────────────────────────────────
 * Editorial source of truth for the Analyst Insight panel.
 *
 * One entry per dashboard. Each entry is written in institutional Italian
 * (hedge-fund desk register) and uses inline LaTeX inside `$…$`, rendered by
 * <RichText/>. Schema:
 *
 *   key       : maps to the dashboard's `model` prop
 *   title     : panel heading
 *   kicker    : mono caption
 *   equation  : the governing relation, shown as a code-like header
 *   reading   : "Traduzione Matematica-Visiva" — cosa si sta guardando (≤3 righe)
 *   risk      : "Come leggere i Segnali di Rischio"
 *   horizons  : rubrica azionabile { short, medium, long } con { headline, body }
 *
 * The 7 operational/R&D model rooms are the core deliverable; `master` is added
 * for completeness so the control room also carries the guide.
 */

export const ANALYST_GUIDES = {
    // ── 0 · Master Quant Dashboard ──────────────────────────────────────────
    master: {
        key: "master",
        title: "Master Quant Dashboard",
        kicker: "Command · Systemic Risk Hub",
        equation: "P(R\\mid E)=\\dfrac{P(E\\mid R)\\,P(R)}{P(E)}\\;\\;\\cup\\;\\;\\mathrm{VaR}_{\\alpha},\\ \\mathrm{CVaR}_{\\alpha}",
        reading:
            "La control room aggrega il rischio sistemico: i semafori bayesiani mostrano il posterior $P(R\\mid E)$ di ciascun fattore, il Global VaR dinamico $\\mathrm{VaR}_{\\alpha}$ è proiettato dall'ensemble SDE e il gauge sintetizza $P(\\text{structural break})$ del regime topologico.",
        risk:
            "Pericolo quando più semafori superano $P(R\\mid E)\\geq 0.75$ in modo sincrono (rischio correlato, non idiosincratico), quando $\\mathrm{CVaR}_{95}$ diverge da $\\mathrm{VaR}_{95}$ — coda spessa, perdite oltre la soglia più severe del previsto — o quando il gauge di regime sfonda $0.6$.",
        horizons: {
            short: {
                headline: "Termometro intraday del rischio",
                body: "Usa il Systemic Risk Index e il $\\mathrm{VaR}_{95}\\cdot 1\\text{d}$ come gate operativo: se l'indice è in zona rossa riduci size e leva oggi stesso. Tratta i semafori critici come stop-trade temporanei, non come view direzionali.",
            },
            medium: {
                headline: "Bilanciamento tattico del portafoglio",
                body: "Confronta i posterior dei 5 fattori per capire dove concentrare gli hedge nelle prossime settimane. Una salita coordinata di Volatility Cluster e Liquidity Stress suggerisce di alleggerire gli asset a beta elevato e accumulare ottionalità (convexity).",
            },
            long: {
                headline: "Filtra il rumore, leggi il macro-regime",
                body: "Ignora le oscillazioni giornaliere del VaR: conta solo la persistenza del regime e il trend del gauge su molte sedute. Finché $P(\\text{structural break})$ resta strutturalmente sotto $0.4$, gli spike di rischio sono opportunità di accumulo, non segnali di uscita.",
            },
        },
    },

    // ── 1 · SWDA Historical Supports ────────────────────────────────────────
    swda: {
        key: "swda",
        title: "SWDA Historical Supports",
        kicker: "Operational · OHLC & S/R Levels",
        equation: "P(\\text{hold}) \\approx 0.45 + 0.5\\,\\mathrm{strength},\\quad \\mathrm{strength}\\propto n_{\\text{touch}}",
        reading:
            "Stai guardando le candele OHLC con i livelli di supporto/resistenza estratti via pivot frattali e clustering KDE. Ogni linea orizzontale è un livello strutturale: l'opacità è $\\propto$ alla forza (numero di tocchi) e $P(\\text{hold})$ stima la probabilità di tenuta.",
        risk:
            "Segnale di pericolo: una chiusura decisa $C_t$ sotto un supporto accompagnata da volume in espansione segnala un breakout ribassista genuino, non un falso. Quando $P(\\text{hold})<0.5$ e la forza del livello decresce, il supporto è ormai 'consumato' e va declassato a soglia psicologica.",
        horizons: {
            short: {
                headline: "Mean-reversion sui livelli",
                body: "Opera i rimbalzi tattici: long vicino al supporto più forte con stop tecnico appena sotto, target la prima resistenza. Il rapporto rischio/rendimento è favorevole solo se il livello ha $P(\\text{hold})\\gtrsim 0.7$ e molti tocchi recenti.",
            },
            medium: {
                headline: "Mappa di swing per il portafoglio",
                body: "Usa la griglia S/R come scaletta di ingressi/uscite per lo swing 1–3 mesi: incrementa esposizione sui supporti maggiori, riduci sulle resistenze. Lascia respiro agli stop sotto i cluster (banda KDE) per non essere espulso dal rumore.",
            },
            long: {
                headline: "Solo i livelli macro contano",
                body: "Per l'accumulo guarda esclusivamente i 2–3 supporti strutturali pluriennali: sono le zone in cui un PAC (piano d'accumulo) ottiene il miglior prezzo medio. Ignora micro-supporti e resistenze intermedie — sono rumore sul tuo orizzonte.",
            },
        },
    },

    // ── 2 · Support Probability Matrix ──────────────────────────────────────
    matrix: {
        key: "matrix",
        title: "Support Probability Matrix",
        kicker: "Operational · Survival Analysis",
        equation: "P(\\text{rimbalzo}\\mid \\text{tocco}, T) \\approx P_0\\,e^{-\\lambda T}",
        reading:
            "La heatmap incrocia i livelli di prezzo $S_i$ (righe) con gli orizzonti $T_j$ (colonne): il colore è $P(\\text{rimbalzo}\\mid \\text{tocco},T)$. Verde = tenuta probabile, rosso = rottura. La probabilità decade nel tempo secondo la legge di sopravvivenza $P\\approx P_0\\,e^{-\\lambda T}$.",
        risk:
            "Pericolo quando una riga vira al rosso al crescere di $T_j$ con $\\lambda$ elevato (decadimento rapido): il supporto regge l'urto ma non l'assedio prolungato. Un intervallo di confidenza ampio — $\\text{CI}\\propto 1/\\sqrt{n_{\\text{touch}}}$ — segnala stima poco affidabile: non dimensionare il rischio su quella cella.",
        horizons: {
            short: {
                headline: "Leggi la colonna 1d–3d",
                body: "Per la speculazione conta solo la parte sinistra della matrice: $P(\\text{rimbalzo}\\mid T\\!=\\!1\\text{–}3\\text{d})$. Celle verdi qui = scalping/long intraday ad alta probabilità; ignora il decadimento a lungo $T$, non ti riguarda.",
            },
            medium: {
                headline: "Gestisci il decadimento λ",
                body: "Sullo swing leggi le colonne 5d–10d e privilegia i livelli con $\\lambda$ basso (curva di sopravvivenza piatta): reggeranno per tutta la durata del trade. Imposta gli alert quando $P$ scende sotto $0.5$ all'orizzonte che stai detenendo.",
            },
            long: {
                headline: "Risk-score sulla coda 20d",
                body: "Per l'accumulo guarda solo l'ultima colonna e il Risk-score $1-P(20\\text{d})$: identifica il 'max-risk level', cioè la soglia la cui rottura cambierebbe la tesi di lungo periodo. Sotto quella, accumula con metodo; il resto è rumore di breve.",
            },
        },
    },

    // ── 3 · Ensemble SDE Forecast ───────────────────────────────────────────
    sde: {
        key: "sde",
        title: "Ensemble SDE Forecast",
        kicker: "Operational · Stochastic Forecast",
        equation: "dS_t=\\mu S_t\\,dt+\\sigma S_t\\,dW_t\\;(+\\,J_t\\,dN_t)",
        reading:
            "Il fan chart mostra i quantili (5/25/75/95) dell'ensemble GBM · OU · Jump pesato dal particle filter. La mediana $q_{50}$ è lo scenario centrale; l'ampiezza del cono cresce come $\\sigma\\sqrt{T}$ e misura l'incertezza crescente con l'orizzonte.",
        risk:
            "Segnale critico: un $\\mathrm{VaR}_{95}$ dinamico che si allarga improvvisamente, o il peso del modello Jump in salita nel particle filter, indica un salto stocastico di volatilità (regime di Merton). Quando $\\mathrm{CVaR}\\gg\\mathrm{VaR}$ la coda sinistra è asimmetrica: la perdita attesa nel worst-case eccede di molto la soglia.",
        horizons: {
            short: {
                headline: "Trada il cono stretto",
                body: "Sul breve usa l'orizzonte $T\\!=\\!10\\text{d}$: la banda $q_{05}$–$q_{95}$ definisce i tuoi target e stop probabilistici. Se il peso Jump è elevato, riduci size — un salto può attraversare lo stop senza eseguirlo (gap).",
            },
            medium: {
                headline: "Allinea size al VaR dinamico",
                body: "Per lo swing dimensiona la posizione in modo che la perdita a $\\mathrm{VaR}_{95}\\cdot T$ resti entro il budget di rischio mensile. La pendenza OU vs GBM nei pesi ti dice se aspettarti mean-reversion (fade gli estremi) o trend (segui la mediana).",
            },
            long: {
                headline: "Solo drift e regime di vol",
                body: "Sul lungo ignora il fan giornaliero: guarda la pendenza della mediana $q_{50}$ (il drift $\\mu$ implicito) e il livello strutturale di $\\sigma$. Un drift positivo persistente con vol contenuta è il via libera all'accumulo; il resto del cono è rumore.",
            },
        },
    },

    // ── 4 · Risk Alert Engine ───────────────────────────────────────────────
    alerts: {
        key: "alerts",
        title: "Risk Alert Engine",
        kicker: "Operational · Rule Engine",
        equation: "\\mathrm{trigger}=\\bigwedge_i\\,(m_i\\;\\mathrm{op}_i\\;\\theta_i)\\ \\ \\text{oppure}\\ \\ \\bigvee_i(\\cdots)",
        reading:
            "Il motore rule-based compila predicati condizionali sulle metriche dei modelli: una regola è una congiunzione $\\bigwedge_i (m_i\\,\\mathrm{op}_i\\,\\theta_i)$ (logica AND) o disgiunzione (OR), con soglia $\\theta_i$, severità e azione di trigger.",
        risk:
            "La regola di tail-risk per eccellenza combina più condizioni in AND, es. $P(\\text{rottura})>0.8$ AND persistenza topologica $<0.15$: bassa frequenza, alta precisione. Pericolo opposto: troppe regole OR a soglia bassa generano rumore e fatica d'allarme (alert fatigue) — calibra $\\theta_i$ sui quantili storici.",
        horizons: {
            short: {
                headline: "Alert reattivi e stretti",
                body: "Per la speculazione arma soglie sensibili su $\\mathrm{VaR}_{95}$ e intensità di salto $\\lambda$: vuoi essere avvisato subito di ogni shock intraday. Azione tipica: $\\texttt{notify\\_push}$ + riduzione automatica dell'esposizione.",
            },
            medium: {
                headline: "Regole composite di regime",
                body: "Sullo swing privilegia regole AND che incrociano segnali di modelli diversi (supporto + regime + VaR): filtrano i falsi positivi e segnalano cambi di contesto degni di un ribilanciamento. Severità 'warning', azione di notifica e revisione.",
            },
            long: {
                headline: "Pochi allarmi, solo strutturali",
                body: "Per l'accumulo tieni armate solo 1–2 regole 'critical' legate al cambio di regime ($\\text{regime\\_gauge}>0.6$ AND posterior $>0.5$). Sono gli unici eventi che giustificano un'azione sul portafoglio di lungo termine; disarma tutto il resto.",
            },
        },
    },

    // ── 5 · Topological Neighborhoods ───────────────────────────────────────
    neighborhoods: {
        key: "neighborhoods",
        title: "Topological Neighborhoods",
        kicker: "R&D · Persistent Homology",
        equation: "\\text{pers}(p)=\\mathrm{death}(p)-\\mathrm{birth}(p),\\quad \\beta_0,\\beta_1",
        reading:
            "Il diagramma di persistenza mostra le coppie birth–death dell'embedding ritardato: i punti lontani dalla diagonale sono feature topologiche robuste — $H_0$ = componenti connesse, $H_1$ = cicli. Il barcode misura la longevità $\\mathrm{death}-\\mathrm{birth}$ di ciascuna feature.",
        risk:
            "Pericolo quando i punti $H_1$ collassano verso la diagonale (persistenza $\\to 0$): la struttura ciclica del mercato si dissolve, spesso prima di un'instabilità. Un crollo del numero di Betti $\\beta_1$ segnala la rottura della geometria locale e la perdita di prevedibilità della traiettoria.",
        horizons: {
            short: {
                headline: "Stabilità del ciclo locale",
                body: "Sul breve l'indicatore di Local Evolution è il tuo filtro: alta stabilità ⇒ il pattern oscillatorio recente è affidabile per il mean-reversion. Se i cicli $H_1$ svaniscono, sospendi le strategie range-bound: il mercato sta cambiando forma.",
            },
            medium: {
                headline: "Robustezza prima del ribilanciamento",
                body: "Sullo swing usa $\\beta_1$ e la max-persistence $H_1$ come misura di quanto il regime corrente sia 'solido'. Una topologia robusta giustifica mantenere lo swing; un indebolimento progressivo anticipa la necessità di alleggerire.",
            },
            long: {
                headline: "Leggi solo le feature persistenti",
                body: "Per l'accumulo conta solo la persistenza totale: le feature di vita lunga rappresentano la struttura macro, quelle vicine alla diagonale sono rumore di campionamento da ignorare. Una topologia persistentemente ricca conferma un mercato con memoria sfruttabile sul lungo periodo.",
            },
        },
    },

    // ── 6 · PDE Density Surface ─────────────────────────────────────────────
    pde: {
        key: "pde",
        title: "PDE Density Surface",
        kicker: "R&D · Partial Differential Equations",
        equation: "\\partial_T u=\\tfrac12\\sigma^2 X^2\\,\\partial_{XX}u-\\mu X\\,\\partial_X u",
        reading:
            "La heatmap spazio-temporale è la densità di probabilità $u(X,T)$ governata dalla PDE parabolica (Fokker–Planck). Il colore intenso (giallo) rappresenta una concentrazione di $u$: un attrattore di prezzo verso cui la massa probabilistica converge sull'orizzonte $T$.",
        risk:
            "Segnale di pericolo: una cresta di densità che si sdoppia (bimodalità di $u$) indica una biforcazione di regime — il mercato 'sceglie' tra due esiti. Quando la diffusione allarga rapidamente $u$ (entropia in crescita, $\\partial_{XX}u$ dominante) la prevedibilità collassa: nessun attrattore, solo dispersione.",
        horizons: {
            short: {
                headline: "Punta all'attrattore vicino",
                body: "Sul breve la moda di $u(\\cdot,T\\!=\\!\\text{piccolo})$ è il bersaglio di prezzo più probabile: opera verso la cresta gialla con stop oltre la zona blu a bassa densità. Una densità unimodale e stretta = setup pulito ad alta convinzione.",
            },
            medium: {
                headline: "Sezioni a 1–3 mesi",
                body: "Per lo swing leggi le sezioni trasversali (cross-section pdf) all'orizzonte di detenzione: la larghezza della densità definisce il tuo intervallo realistico e dove piazzare prese di profitto scalari lungo la distribuzione.",
            },
            long: {
                headline: "Drift della cresta nel tempo",
                body: "Sul lungo ignora la dispersione e segui come si muove l'attrattore (la cresta di densità) al crescere di $T$: la sua traiettoria è la stima del fair value di accumulo. La diffusione laterale è solo incertezza, non un segnale operativo.",
            },
        },
    },

    // ── 7 · Topological Regime Detection ────────────────────────────────────
    regime: {
        key: "regime",
        title: "Topological Regime Detection",
        kicker: "R&D · Regime Classifier",
        equation: "d_{ij}=1-|\\rho_{ij}|\\ \\to\\ P(\\text{regime}\\mid \\text{topologia})",
        reading:
            "La matrice di correlazione $\\rho(i,j)$ multi-asset è filtrata via Vietoris–Rips sulla distanza $d_{ij}=1-|\\rho_{ij}|$; un classificatore bayesiano ne stima il posterior di regime. Il gauge sintetizza $P(\\text{structural break})$ e la timeline colora la sequenza di regimi recenti.",
        risk:
            "Pericolo quando le correlazioni convergono verso $+1$ (de-diversificazione: tutto si muove insieme) e il Wasserstein drift della rete topologica accelera — è la firma di una transizione a regime di stress/contagio. Gauge $>0.6$ con alert attivo richiede azione difensiva immediata.",
        horizons: {
            short: {
                headline: "Evita il contagio oggi",
                body: "Sul breve un picco del gauge e correlazioni in salita significano che gli hedge intra-portafoglio smettono di funzionare: riduci leva e size finché il regime di stress non rientra. Non è il momento per nuove posizioni speculative correlate.",
            },
            medium: {
                headline: "Ruota in base al regime dominante",
                body: "Sullo swing usa il regime con posterior più alto per orientare l'allocazione: 'Risk-On/Trending' favorisce momentum e beta; 'Range/Mean-Reverting' favorisce strategie di fading; 'Stress' impone qualità e duration. Ribilancia ai cambi di regime confermati.",
            },
            long: {
                headline: "Solo i cambi strutturali confermati",
                body: "Per l'accumulo ignora i flicker della timeline: agisci solo quando il posterior di 'Structural Break' resta elevato per molte sedute e il Wasserstein drift conferma un cambio persistente. Quegli eventi rari sono gli unici che giustificano una revisione dell'asset allocation strategica.",
            },
        },
    },

    // ── 9 · Clique Complex & Persistent Homology ────────────────────────────
    clique: {
        key: "clique",
        title: "Complesso di Clique & Omologia Persistente",
        kicker: "R&D · TDA + Graph Theory",
        equation: "\\beta_k(\\varepsilon)=\\dim H_k(\\mathrm{Cl}_\\varepsilon),\\quad \\chi=V-E+F=\\beta_0-\\beta_1+\\beta_2",
        reading:
            "La matrice di adiacenza pesata induce una distanza $d_{ij}=1-|\\rho_{ij}|$. Al crescere della soglia di filtrazione $\\varepsilon$ compaiono archi ($d_{ij}\\leq\\varepsilon$) e si riempiono triangoli, formando il complesso di clique $\\mathrm{Cl}_\\varepsilon$. Le Betti curves tracciano $\\beta_0$ (componenti connesse) e $\\beta_1$ (cicli indipendenti) calcolato da $\\beta_1=\\beta_0-\\chi$ con $\\chi=V-E+F$.",
        risk:
            "Pericolo quando $\\beta_1$ collassa a $0$ su tutto l'intervallo di $\\varepsilon$: la struttura ciclica del mercato si dissolve, spesso prima di un'instabilità. Al contrario un $\\beta_0$ che resta $>1$ fino a soglie alte segnala frammentazione (de-correlazione): il network si spezza in cluster isolati e gli hedge cross-asset perdono efficacia.",
        horizons: {
            short: {
                headline: "Cicli effimeri, leggi il barcode corto",
                body: "Sul breve i cicli $H_1$ nascono e muoiono in fretta: usa l'intervallo di persistenza $\\mathrm{death}-\\mathrm{birth}$ come finestra di validità del pattern oscillatorio. Se $\\beta_1\\to 0$ rapidamente, sospendi le strategie range-bound: il complesso si sta riempiendo (tutto correlato).",
            },
            medium: {
                headline: "Robustezza del network di swing",
                body: "Sullo swing osserva l'ampiezza della regione in cui $\\beta_1>0$ e il numero di triangoli a $\\varepsilon^\\*$: una topologia ricca e persistente giustifica mantenere l'esposizione. Un appiattimento progressivo della Betti curve anticipa la necessità di alleggerire.",
            },
            long: {
                headline: "Solo le feature persistenti contano",
                body: "Per l'accumulo guarda la persistenza totale $\\int \\beta_1\\,d\\varepsilon$: le feature di vita lunga sono la struttura macro sfruttabile, quelle vicine alla diagonale sono rumore di campionamento. Un mercato con omologia persistentemente ricca ha memoria e merita un PAC metodico.",
            },
        },
    },

    // ── 10 · Sheaf Cohomology on Financial Topologies ───────────────────────
    sheaf: {
        key: "sheaf",
        title: "Coomologia dei Fasci su Topologie Finanziarie",
        kicker: "R&D · Čech Cohomology",
        equation: "0\\to H^0(\\mathcal{X},\\mathcal{F})\\to\\bigoplus_i\\mathcal{F}(U_i)\\;\\to^{\\delta}\\;\\bigoplus_{i<j}\\mathcal{F}(U_{ij})\\to H^1(\\mathcal{X},\\mathcal{F})\\to 0",
        reading:
            "Il mercato è coperto da sotto-regimi $\\mathcal{X}=\\bigcup_i U_i$ (nodi del nervo). Ogni $U_i$ porta una sezione locale $s_i\\in\\mathcal{F}(U_i)$ (fair-value implicito). La transizione sugli overlap è $g_{ij}=s_j-s_i+r_{ij}$: rimuovendo la parte esatta (coboundary $\\delta$) resta l'olonomia su ogni ciclo, cioè la classe in $H^1(\\mathcal{X},\\mathcal{F})$. $H^0$ misura le sezioni globali coerenti.",
        risk:
            "Pericolo quando $\\dim H^1>0$ con indice di ostruzione elevato: le sezioni locali NON si incollano in una vista globale coerente — è la firma di un'inefficienza informativa / opportunità di arbitraggio che il mercato non ha ancora chiuso. Un'ostruzione persistente e crescente segnala disallineamento strutturale tra regimi, non rumore.",
        horizons: {
            short: {
                headline: "Caccia all'arbitraggio di coda",
                body: "Sul breve un $H^1$ non nullo con olonomia ampia è un segnale operativo diretto: esiste un ciclo $U_i\\to U_j\\to\\cdots\\to U_i$ lungo cui i prezzi non chiudono. Sfrutta la dislocazione finché l'indice di ostruzione non rientra verso $0$ (mercato che si ri-efficienta).",
            },
            medium: {
                headline: "Monitora la coerenza tra regimi",
                body: "Sullo swing usa $\\dim H^1$ come termometro di frammentazione: se cresce, i sotto-regimi divergono e il portafoglio costruito su una vista 'globale' è fragile. Ribilancia verso gli overlap dove l'ostruzione è bassa (sezioni che si incollano).",
            },
            long: {
                headline: "Punta alle sezioni globali ($H^0$)",
                body: "Per l'accumulo conta solo $H^0$: il numero di sezioni globali coerenti rappresenta le tesi macro robuste. Ignora i flicker di $H^1$ di breve; agisci solo se l'ostruzione resta strutturalmente elevata per molte sedute — allora il regime si è davvero biforcato.",
            },
        },
    },

    // ── 11 · Algebraic Geometry of Microstructure (Affine Schemes) ──────────
    scheme: {
        key: "scheme",
        title: "Geometria Algebrica della Microstruttura",
        kicker: "R&D · Affine Schemes · Spec(R)",
        equation: "\\mathrm{Spec}(R),\\ R=k[x,y]/(f),\\quad \\mathrm{Sing}(V)=\\{\\,f=\\partial_x f=\\partial_y f=0\\,\\}",
        reading:
            "Lo spazio di mercato è lo schema affine $\\mathrm{Spec}(R)$ con $R=k[x,y]/(f)$ e $f=y^2-x^3-ax^2-bx$. I punti reali della varietà $V(f)$ sono il luogo della sensitività prezzo-volume; la coordinata $z\\approx\\partial_x f$ eleva la nuvola in 3-D. Le singolarità $\\mathrm{Sing}(V)$ (dove il gradiente si annulla) sono i punti di rottura strutturale.",
        risk:
            "Il discriminante $\\Delta$ classifica il rischio geometrico: $\\Delta>0$ dà un nodo (auto-intersezione → inversione strutturale), $\\Delta\\approx 0$ una cuspide (degenerazione → precursore di crash), $\\Delta<0$ una varietà liscia. Pericolo quando $\\Delta\\to 0$: la varietà sta sviluppando una singolarità, la dinamica perde regolarità e la sensitività esplode.",
        horizons: {
            short: {
                headline: "Evita la cuspide",
                body: "Sul breve la prossimità a una cuspide ($\\Delta\\approx 0$) è un allarme: nei pressi di una singolarità la sensitività $\\partial_x f$ diverge e piccoli shock di volume producono salti di prezzo non lineari. Riduci size finché la varietà non torna liscia.",
            },
            medium: {
                headline: "Mappa i nodi di inversione",
                body: "Sullo swing usa i nodi (auto-intersezioni) come zone di probabile inversione strutturale: sono i prezzi dove due rami della varietà si incontrano. Tratta l'attraversamento di un nodo come cambio di regime e ribilancia di conseguenza.",
            },
            long: {
                headline: "Accumula sul liscio (genere 1)",
                body: "Per l'accumulo preferisci i regimi a varietà liscia ($\\Delta<0$, genere aritmetico $1$): geometria regolare = dinamica prevedibile. Ignora le micro-singolarità seedate dalla volatilità; agisci solo se la singolarità principale persiste, segnalando un cambio di fase reale.",
            },
        },
    },

    // ── 12 · Hodge Decomposition of Network Flows ───────────────────────────
    hodge: {
        key: "hodge",
        title: "Decomposizione di Hodge dei Flussi di Rete",
        kicker: "R&D · Discrete Hodge Laplacian",
        equation: "X=\\operatorname{grad}(p)+\\operatorname{curl}(A)+h,\\qquad \\Delta_1=\\partial_1^{\\mathsf{T}}\\partial_1+\\partial_2\\partial_2^{\\mathsf{T}}",
        reading:
            "Il campo di flusso del portafoglio sul grafo degli asset è decomposto via Laplaciano di Hodge discreto $\\Delta_1$ in tre parti ortogonali: $\\operatorname{grad}(p)$ (gradiente, curl-free) è il TREND direzionale, $\\operatorname{curl}(A)$ (solenoidale) è l'ARBITRAGGIO ciclico, $h$ (armonico, $\\Delta_1 h=0$) è l'EQUILIBRIO macro. Le percentuali sono le quote di energia $\\|\\cdot\\|^2$.",
        risk:
            "Pericolo quando la componente solenoidale domina: il capitale gira in cicli chiusi ($A\\to B\\to C\\to A$) invece di seguire un trend — mercato inefficiente, pieno di arbitraggi ciclici instabili. Una componente armonica $h$ in forte crescita indica flussi vincolati alla topologia (buchi del grafo): liquidità intrappolata, difficile da smobilizzare.",
        horizons: {
            short: {
                headline: "Cavalca il flusso solenoidale",
                body: "Sul breve la quota di flusso ciclico (curl) è la tua opportunità: gli arbitraggi solenoidali $A\\to B\\to C\\to A$ sono sfruttabili intraday finché persistono. Monitora la rotazione: quando il curl si scarica nel gradiente, il ciclo è finito.",
            },
            medium: {
                headline: "Bilancia trend e ciclo",
                body: "Sullo swing leggi il rapporto gradiente/solenoidale: prevalenza del gradiente favorisce strategie momentum, prevalenza del curl favorisce mean-reversion/fading. Un mix equilibrato con armonico contenuto è il regime più 'sano' per lo swing.",
            },
            long: {
                headline: "Solo il gradiente conta",
                body: "Per l'accumulo guarda esclusivamente la componente di gradiente: è il trend persistente coerente con il potenziale $p$ degli asset. Ignora il curl (rumore ciclico di breve); una quota gradiente alta e stabile è il via libera all'accumulo direzionale.",
            },
        },
    },

    // ── 13 · Spectrum of Operators on Quantum Graphs ────────────────────────
    spectrum: {
        key: "spectrum",
        title: "Spettro di Operatori su Grafi Quantistici",
        kicker: "R&D · Random Matrix Theory",
        equation: "-\\dfrac{d^2}{dx^2}\\psi=\\lambda\\,\\psi\\ \\text{su}\\ \\Gamma,\\quad \\lambda_{\\pm}=\\sigma^2(1\\pm\\sqrt{q})^2,\\ q=N/T",
        reading:
            "Si risolve l'equazione agli autovalori dell'operatore differenziale definito sulle metriche degli archi del grafo di volatilità multi-asset. Il bulk dello spettro segue la legge di Marchenko–Pastur (modello nullo RMT) con supporto $[\\lambda_-,\\lambda_+]$; l'istogramma confronta la densità empirica con quella teorica. Gli autovalori isolati oltre $\\lambda_+$ sono i fattori sistemici (modo di mercato + settori).",
        risk:
            "Pericolo quando uno o più autovalori isolati si staccano nettamente dal bulk (spectral gap ampio): è la firma di una struttura sistemica forte — tutto il grafo vibra sullo stesso modo, la diversificazione è illusoria. La comparsa di $\\geq 3$ autovalori fuori dal bulk segnala anomalia sistemica: shock correlato imminente, non idiosincratico.",
        horizons: {
            short: {
                headline: "Sorveglia il modo di mercato",
                body: "Sul breve il più grande autovalore isolato (market mode) misura quanto il rischio sia 'tutto in uno': se cresce, riduci leva — gli hedge intra-portafoglio smettono di funzionare. Un gap spettrale in espansione precede spesso i giorni di stress correlato.",
            },
            medium: {
                headline: "Conta i fattori fuori dal bulk",
                body: "Sullo swing il numero di autovalori isolati ti dice quanti fattori indipendenti muovono davvero il paniere: ruota l'allocazione verso le direzioni spettrali (eigen-portfolios) ortogonali al modo di mercato per diversificare in modo effettivo.",
            },
            long: {
                headline: "Bulk stretto = mercato sano",
                body: "Per l'accumulo conta la larghezza del bulk e la stabilità del gap: con orizzonti lunghi $T$ cresce, $q=N/T$ cala e il bulk si stringe (stima più affidabile). Finché solo il modo di mercato è isolato e stabile, il regime è normale e l'accumulo prosegue.",
            },
        },
    },
};

/** Convenience accessor with a safe fallback. */
export const getGuide = (key) => ANALYST_GUIDES[key] || ANALYST_GUIDES.master;

export default ANALYST_GUIDES;
