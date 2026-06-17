# Quant Analysis Dashboard — PRD

## Original Problem Statement (IT)
Costruire un'app web di analisi quantitativa dei mercati orientata a diventare
una piattaforma SaaS di paper-trading + analisi rischio. React + Tailwind +
Recharts (frontend), Python + FastAPI (backend), yfinance + pandas + numpy.
Design dark-mode "Control Room Grid" con accenti verde acqua (#00E5C0).
Nessun dato mock per le serie storiche; mock visivi consentiti solo per il
portafoglio simulato.

## User Choices
- Period selector (1Y / 2Y / 5Y / MAX)
- Metriche: CAGR, Sharpe ratio, max drawdown, volatilità annualizzata
- Charting library: Recharts
- Style: dark mode, "verde acqua" (#00E5C0), terminal/Bloomberg aesthetic
- Asset classes: ETF (SWDA.MI), Crypto (BTC-USD), Forex (EURUSD=X), Stocks (AAPL)
- Auth: mocked sul frontend (localStorage)
- Paper trading: client-side simulation, saldo iniziale €50.000

## Architecture
```
Frontend (React 19, CRA + Craco)
  └─ /app/frontend/src
      ├─ App.js                       # routes + providers
      ├─ context/
      │   ├─ AuthContext.jsx          # mocked auth (localStorage)
      │   └─ TradingContext.jsx       # mode + sim balance + positions
      ├─ pages/
      │   ├─ Dashboard.jsx            # 4 asset tabs
      │   ├─ LoginPage.jsx
      │   ├─ SettingsPage.jsx         # watchlist + broker keys
      │   └─ PortfolioPage.jsx        # positions + capital trajectory
      ├─ components/
      │   ├─ layout/
      │   │   ├─ AppHeader.jsx        # nav + broker status + mode toggle + auth
      │   │   ├─ BrokerStatus.jsx
      │   │   └─ ModeToggle.jsx
      │   ├─ auth/ProtectedRoute.jsx
      │   ├─ quant/
      │   │   ├─ AssetTabs.jsx        # ETF / Crypto / Forex / Stocks
      │   │   ├─ AnalysisView.jsx     # chart + metrics + OrderTicket
      │   │   ├─ OrderTicket.jsx
      │   │   ├─ TickerSearch.jsx
      │   │   ├─ PeriodSelector.jsx
      │   │   ├─ MetricCard.jsx
      │   │   └─ PriceChart.jsx
      │   ├─ portfolio/
      │   │   ├─ PositionsTable.jsx
      │   │   └─ CapitalTrajectoryChart.jsx
      │   └─ settings/
      │       ├─ WatchlistSection.jsx
      │       └─ BrokerIntegrationSection.jsx
      └─ lib/
          ├─ api.js                   # axios client
          └─ format.js                # number formatters

Backend (FastAPI)
  └─ /app/backend
      ├─ server.py                    # market data routes + bootstrap
      ├─ routes/
      │   └─ user.py                  # watchlist + broker keys (Mongo)
      ├─ requirements.txt
      └─ tests/test_quant_api.py
```

### Backend endpoints
- `GET /api/health`
- `GET /api/market/data?ticker=&period=&risk_free_rate=`
- `GET /api/user/watchlist?user_id=`
- `POST /api/user/watchlist` `{user_id, ticker}`
- `DELETE /api/user/watchlist?user_id=&ticker=`
- `GET /api/user/broker-keys?user_id=` (masked)
- `POST /api/user/broker-keys` `{user_id, broker, api_key, api_secret}`
- `DELETE /api/user/broker-keys?user_id=`

### Frontend routes
- `/` — Markets dashboard (public)
- `/login` — sign in / sign up (mocked)
- `/portfolio` — paper-trading portfolio (public)
- `/settings` — watchlist + broker keys (protected)

## Implemented

### 2026-02 — Iteration 1 (MVP)
- ✅ FastAPI backend + `/api/market/data`
- ✅ Volatilità annualizzata, CAGR, Sharpe, Max drawdown
- ✅ Dashboard ETF (default SWDA.MI) con search, period, chart, 4 metric cards
- ✅ Terminal/Bloomberg dark theme (#00E5C0 accent)

### 2026-02 — Iteration 2 (Crypto)
- ✅ Tab system con AssetTabs + AnalysisView modulare
- ✅ Crypto view (default BTC-USD)

### 2026-05 — Iteration 3 (Forex/Stocks + Auth + Settings)
- ✅ Forex tab (EURUSD=X) e Stocks tab (AAPL)
- ✅ Mocked auth con AuthContext + ProtectedRoute (`/login`, `/settings`)
- ✅ Settings con Personal Watchlist (Mongo-backed CRUD per user_id)
- ✅ Settings con Broker Integration UI (Alpaca/IB/Binance — solo storage UI)
- ✅ Backend modularizzato: `routes/user.py` (motor + MongoDB)
- ✅ Backend pytest 17/17, frontend Playwright tutti passati

### 2026-05 — Iteration 4 (Trading UI)
- ✅ OrderTicket panel (Buy/Sell, Quantity, Order Type Market/Limit/Stop, Submit)
- ✅ Submit in modalità REAL → solo `console.log` (no broker connesso)
- ✅ Submit in modalità PAPER → muta TradingContext (balance + posizioni)
- ✅ Header Broker API · Disconnected (rosso pulsante)
- ✅ Real/Paper mode toggle (persistente in localStorage)
- ✅ Portfolio page con 4 summary tiles, tabella posizioni (5 seed), Capital Trajectory chart
- ✅ 44/44 frontend tests passati
- ✅ Reset simulation button (riporta balance a €50.000 e ripristina seeds)

## Core Constraints
- No mock data per le serie storiche — tutto da yfinance
- No algoritmi predittivi / GARCH / ML nel backend (solo metriche base)
- Italian UI copy + locale (it-IT, currency €)
- Production-ready code, modular, pronto per export Linux

## Prioritized Backlog

### P1 — short term
- Convertire l'auth mockata in JWT + bcrypt reale (integration_playbook_expert_v2)
- Rolling volatility (30d / 90d) sub-chart sul Markets view
- Compare multiple tickers overlay
- Log-scale toggle sul Recharts
- Persistere ultimo ticker selezionato in localStorage per tab

### P2 — medium term
- Order history tab (lista trade simulati con realized P&L)
- Realized P&L tracking + cost basis avanzato (FIFO/LIFO)
- VaR / CVaR historical & parametric
- Beta vs benchmark (^GSPC, ^STOXX50E)
- Export CSV / PNG
- Alert su soglie di volatilità (dal PRD originale)
- Lazy-mount delle tab content per silenziare i warning recharts hidden

### P3 — long term
- GARCH(1,1) (statsmodels / arch) — implementazione manuale in locale
- Regime detection (HMM)
- Factor decomposition (Fama-French)
- Real broker integration (Alpaca paper API → live API)
- Migliorare la curva equity con valutazione mark-to-market periodica
