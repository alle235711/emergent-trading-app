#!/usr/bin/env bash
# =============================================================================
# start_app.sh — Avvio completo dell'applicazione trading su Ubuntu
#
# Cosa fa:
#   1. Avvia il backend FastAPI (uvicorn) sulla porta 8000
#   2. Avvia il frontend React (craco/yarn) sulla porta 3000
#   3. Attende che il frontend sia pronto e apre Chrome su http://localhost:3000
#   4. Intercetta Ctrl+C e spegne entrambi i processi in modo pulito
#
# Uso:
#   ./start_app.sh
# =============================================================================

set -euo pipefail

# ── Colori per l'output ──────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RESET='\033[0m'
BOLD='\033[1m'

# ── Costanti ─────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="${SCRIPT_DIR}/backend"
FRONTEND_DIR="${SCRIPT_DIR}/frontend"
BACKEND_PORT=8000
FRONTEND_PORT=3000
FRONTEND_URL="http://localhost:${FRONTEND_PORT}"
LOG_DIR="${SCRIPT_DIR}/.logs"
BACKEND_LOG="${LOG_DIR}/backend.log"
FRONTEND_LOG="${LOG_DIR}/frontend.log"

BACKEND_PID=""
FRONTEND_PID=""

# ── Funzione di cleanup (trappolata su EXIT, INT, TERM) ──────────────────────
cleanup() {
    echo ""
    echo -e "${YELLOW}${BOLD}Interruzione ricevuta — spegnimento in corso...${RESET}"

    if [[ -n "${FRONTEND_PID}" ]] && kill -0 "${FRONTEND_PID}" 2>/dev/null; then
        echo -e "  ${CYAN}→ Stop frontend (PID ${FRONTEND_PID})${RESET}"
        # React dev server avvia processi figli; usiamo il process group
        kill -- "-${FRONTEND_PID}" 2>/dev/null || kill "${FRONTEND_PID}" 2>/dev/null || true
    fi

    if [[ -n "${BACKEND_PID}" ]] && kill -0 "${BACKEND_PID}" 2>/dev/null; then
        echo -e "  ${CYAN}→ Stop backend (PID ${BACKEND_PID})${RESET}"
        kill -- "-${BACKEND_PID}" 2>/dev/null || kill "${BACKEND_PID}" 2>/dev/null || true
    fi

    # Attendi la terminazione effettiva (max 5 s)
    local deadline=$(( $(date +%s) + 5 ))
    while kill -0 "${BACKEND_PID}" 2>/dev/null || kill -0 "${FRONTEND_PID}" 2>/dev/null; do
        [[ $(date +%s) -ge ${deadline} ]] && break
        sleep 0.3
    done

    echo -e "${GREEN}Tutti i processi terminati. Arrivederci.${RESET}"
    exit 0
}

trap cleanup EXIT INT TERM

# ── Utility ──────────────────────────────────────────────────────────────────
log_info()    { echo -e "${GREEN}[INFO]${RESET}  $*"; }
log_warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
log_error()   { echo -e "${RED}[ERROR]${RESET} $*"; }
log_section() { echo -e "\n${BOLD}${CYAN}══ $* ══${RESET}"; }

check_command() {
    if ! command -v "$1" &>/dev/null; then
        log_error "Comando '$1' non trovato. Installalo e riprova."
        exit 1
    fi
}

port_is_busy() {
    ss -tlnp 2>/dev/null | grep -q ":$1 " || \
    lsof -i ":$1" -sTCP:LISTEN &>/dev/null 2>&1
}

wait_for_url() {
    local url="$1"
    local max_seconds="${2:-90}"
    local elapsed=0
    while ! curl -sf --max-time 2 "${url}" > /dev/null 2>&1; do
        if (( elapsed >= max_seconds )); then
            return 1
        fi
        sleep 1
        (( elapsed++ ))
    done
    return 0
}

open_browser() {
    local url="$1"
    if command -v google-chrome &>/dev/null; then
        log_info "Apro Google Chrome → ${url}"
        google-chrome "${url}" &>/dev/null &
    elif command -v google-chrome-stable &>/dev/null; then
        log_info "Apro Google Chrome Stable → ${url}"
        google-chrome-stable "${url}" &>/dev/null &
    elif command -v chromium-browser &>/dev/null; then
        log_info "Apro Chromium → ${url}"
        chromium-browser "${url}" &>/dev/null &
    elif command -v xdg-open &>/dev/null; then
        log_warn "google-chrome non trovato — uso xdg-open."
        xdg-open "${url}" &>/dev/null &
    else
        log_warn "Nessun browser trovato. Apri manualmente: ${url}"
    fi
}

# ── Intestazione ─────────────────────────────────────────────────────────────
clear
echo -e "${BOLD}${CYAN}"
echo "  ╔══════════════════════════════════════════╗"
echo "  ║   Emergent Trading App — Avvio locale    ║"
echo "  ╚══════════════════════════════════════════╝"
echo -e "${RESET}"
echo -e "  Root:     ${SCRIPT_DIR}"
echo -e "  Backend:  http://localhost:${BACKEND_PORT}"
echo -e "  Frontend: ${FRONTEND_URL}"
echo ""

# ── Prerequisiti ─────────────────────────────────────────────────────────────
log_section "Controllo prerequisiti"
check_command yarn

# Individua il python3 più adatto (preferisce quello del PATH dell'utente)
PYTHON_BIN=""
# Preferisce il Python di sistema Ubuntu (/usr/bin/python3) che ha _sqlite3
# compilato; evita /usr/local/bin/python3 che potrebbe mancare di _sqlite3.
for candidate in \
        "/usr/bin/python3" \
        "${HOME}/anaconda3/bin/python3" \
        "${HOME}/miniconda3/bin/python3" \
        "$(command -v python3 2>/dev/null)"; do
    if [[ -x "${candidate}" ]] && "${candidate}" -c "import sqlite3" 2>/dev/null; then
        PYTHON_BIN="${candidate}"
        break
    fi
done

if [[ -z "${PYTHON_BIN}" ]]; then
    log_error "Nessun python3 trovato. Installalo e riprova."
    exit 1
fi

log_info "Python    → ${PYTHON_BIN} ($(${PYTHON_BIN} --version 2>&1))"
log_info "yarn      → $(yarn --version 2>&1)"

if port_is_busy "${BACKEND_PORT}"; then
    log_error "La porta ${BACKEND_PORT} è già occupata. Libera il processo e riprova."
    exit 1
fi

if port_is_busy "${FRONTEND_PORT}"; then
    log_error "La porta ${FRONTEND_PORT} è già occupata. Libera il processo e riprova."
    exit 1
fi

# ── Cartella log ─────────────────────────────────────────────────────────────
mkdir -p "${LOG_DIR}"

# ── Avvio backend ─────────────────────────────────────────────────────────────
log_section "Backend FastAPI"

if [[ ! -f "${BACKEND_DIR}/server.py" ]]; then
    log_error "Non trovo ${BACKEND_DIR}/server.py"
    exit 1
fi

# ── Crea .env se non esiste ───────────────────────────────────────────────────
ENV_FILE="${BACKEND_DIR}/.env"
if [[ ! -f "${ENV_FILE}" ]]; then
    log_warn ".env non trovato — creo ${ENV_FILE} con valori di default."
    cat > "${ENV_FILE}" <<'EOF'
# Backend environment — sviluppo locale
MONGO_URL=
DB_NAME=trading_app
CORS_ORIGINS=http://localhost:3000
IBKR_ENABLED=true
IBKR_HOST=127.0.0.1
IBKR_PORT=7497
IBKR_CLIENT_ID=17
IBKR_MARKET_DATA_TYPE=1
EOF
    log_info ".env creato ✓  (modifica MONGO_URL per abilitare watchlist/broker-keys)"
fi

# ── Completa .env esistenti con le chiavi IBKR richieste ─────────────────────
ensure_env_key() {
    local key="$1"
    local value="$2"
    if ! grep -q "^${key}=" "${ENV_FILE}" 2>/dev/null; then
        echo "${key}=${value}" >> "${ENV_FILE}"
    fi
}

ensure_env_key "IBKR_ENABLED" "true"
ensure_env_key "IBKR_HOST" "127.0.0.1"
ensure_env_key "IBKR_PORT" "7497"
ensure_env_key "IBKR_CLIENT_ID" "17"
ensure_env_key "IBKR_MARKET_DATA_TYPE" "1"

VENV_DIR="${SCRIPT_DIR}/venv"
VENV_PYTHON="${VENV_DIR}/bin/python"
VENV_UVICORN="${VENV_DIR}/bin/uvicorn"

# ── Crea (o ricrea) il virtualenv ────────────────────────────────────────────
# Se il venv esiste ma il suo Python manca di _sqlite3 (es. build /usr/local
# compilata senza le dev-headers di sqlite), lo eliminiamo e lo ricreiamo con
# il Python di sistema che ha _sqlite3 presente (PYTHON_BIN già validato sopra).
_needs_create=false
if [[ ! -f "${VENV_PYTHON}" ]]; then
    _needs_create=true
elif ! "${VENV_PYTHON}" -c "import sqlite3" &>/dev/null; then
    log_warn "Il venv esistente manca di _sqlite3 (Python: $("${VENV_PYTHON}" -V 2>&1))."
    log_warn "Ricreazione del venv con ${PYTHON_BIN} ($("${PYTHON_BIN}" --version 2>&1))..."
    rm -rf "${VENV_DIR}"
    _needs_create=true
fi

if [[ "${_needs_create}" == true ]]; then
    log_info "Creazione virtualenv in ${VENV_DIR} con ${PYTHON_BIN} ..."
    "${PYTHON_BIN}" -m venv "${VENV_DIR}"
    log_info "Virtualenv creato ✓"
    # Forza la reinstallazione delle dipendenze nel venv appena rigenerato.
    rm -f "${VENV_DIR}/.installed_stamp"
fi

# ── Installa/aggiorna le dipendenze se mancanti o requirements cambiato ───────
REQUIREMENTS="${BACKEND_DIR}/requirements.txt"
STAMP="${VENV_DIR}/.installed_stamp"

if [[ ! -f "${STAMP}" ]] || [[ "${REQUIREMENTS}" -nt "${STAMP}" ]]; then
    log_info "Installazione dipendenze da requirements.txt (può richiedere qualche minuto)..."
    log_info "Aggiornamento pip..."
    "${VENV_PYTHON}" -m pip install --upgrade pip
    log_info "Installazione pacchetti..."
    if ! "${VENV_PYTHON}" -m pip install -r "${REQUIREMENTS}"; then
        log_error "Installazione dipendenze fallita. Controlla i messaggi sopra."
        exit 1
    fi
    touch "${STAMP}"
    log_info "Dipendenze installate ✓"
else
    # Verifica che ripser sia effettivamente presente (potrebbe mancare da run precedenti)
    if ! "${VENV_PYTHON}" -c "import ripser, persim, fastapi" &>/dev/null; then
        log_warn "Moduli mancanti rilevati — reinstallazione forzata..."
        rm -f "${STAMP}"
        "${VENV_PYTHON}" -m pip install -r "${REQUIREMENTS}"
        touch "${STAMP}"
        log_info "Dipendenze reinstallate ✓"
    else
        log_info "Dipendenze già installate ✓"
    fi
fi

log_info "Avvio uvicorn dal venv locale ${VENV_DIR} (log → ${BACKEND_LOG})"

# Usa direttamente l'uvicorn del venv — equivalente a:
#   source venv/bin/activate && uvicorn ...
# Così tutti gli import (fastapi, pydantic…) vanno
# sullo stesso Python che ha le dipendenze installate.
# --app-dir punta uvicorn alla cartella backend/ dove risiede server.py
# --reload-dir limita il file-watcher alla stessa cartella
setsid "${VENV_UVICORN}" server:app \
    --app-dir "${BACKEND_DIR}" \
    --reload-dir "${BACKEND_DIR}" \
    --host 0.0.0.0 \
    --port "${BACKEND_PORT}" \
    --reload \
    --log-level info \
    >> "${BACKEND_LOG}" 2>&1 &
BACKEND_PID=$!

log_info "Backend PID: ${BACKEND_PID}"

# Attendi che il backend risponda
log_info "In attesa che il backend sia pronto..."
if ! wait_for_url "http://localhost:${BACKEND_PORT}/api/health" 30; then
    log_error "Il backend non ha risposto entro 30 s. Controlla ${BACKEND_LOG}"
    exit 1
fi
log_info "Backend ${GREEN}PRONTO${RESET} ✓"

# ── Avvio frontend ────────────────────────────────────────────────────────────
log_section "Frontend React"

if [[ ! -f "${FRONTEND_DIR}/package.json" ]]; then
    log_error "Non trovo ${FRONTEND_DIR}/package.json"
    exit 1
fi

# ── Installa node_modules se mancanti ────────────────────────────────────────
if [[ ! -f "${FRONTEND_DIR}/node_modules/.bin/craco" ]]; then
    log_info "node_modules mancanti — eseguo yarn install (può richiedere qualche minuto)..."
    # --ignore-engines: Node 18 è supportato in pratica anche se react-router-dom@7
    # dichiara engine>=20; il codice funziona correttamente su Node 18.
    (cd "${FRONTEND_DIR}" && yarn install --ignore-engines) 2>&1 | tee -a "${FRONTEND_LOG}"
    if [[ ! -f "${FRONTEND_DIR}/node_modules/.bin/craco" ]]; then
        log_error "yarn install fallito. Controlla ${FRONTEND_LOG}"
        exit 1
    fi
    log_info "yarn install completato ✓"
else
    log_info "node_modules già presenti ✓"
fi

log_info "Avvio yarn start (log → ${FRONTEND_LOG})"

(
    cd "${FRONTEND_DIR}"
    # BROWSER=none impedisce a CRA di aprire il browser da solo
    BROWSER=none setsid yarn start \
        >> "${FRONTEND_LOG}" 2>&1
) &
FRONTEND_PID=$!

log_info "Frontend PID: ${FRONTEND_PID}"

# Attendi che webpack abbia compilato e il dev-server risponda
log_info "In attesa che il frontend compili (può richiedere fino a 90 s)..."
if ! wait_for_url "${FRONTEND_URL}" 90; then
    log_error "Il frontend non ha risposto entro 90 s. Controlla ${FRONTEND_LOG}"
    exit 1
fi
log_info "Frontend ${GREEN}PRONTO${RESET} ✓"

# ── Apri il browser ───────────────────────────────────────────────────────────
log_section "Apertura browser"
# Breve pausa per dare tempo al dev-server di stabilizzarsi
sleep 1
open_browser "${FRONTEND_URL}"

# ── Stato finale ──────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${GREEN}║  Applicazione avviata con successo!                      ║${RESET}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  Frontend  →  ${CYAN}${FRONTEND_URL}${RESET}"
echo -e "  Backend   →  ${CYAN}http://localhost:${BACKEND_PORT}/docs${RESET}  (Swagger UI)"
echo ""
echo -e "  Log backend:   ${YELLOW}${BACKEND_LOG}${RESET}"
echo -e "  Log frontend:  ${YELLOW}${FRONTEND_LOG}${RESET}"
echo ""
echo -e "  ${BOLD}Premi Ctrl+C per spegnere tutto.${RESET}"
echo ""

# ── Tail live dei due log in parallelo ───────────────────────────────────────
tail -f "${BACKEND_LOG}" "${FRONTEND_LOG}" &
TAIL_PID=$!

# Attendi fino a Ctrl+C (il trap cleanup si occuperà del resto)
wait "${BACKEND_PID}" "${FRONTEND_PID}" 2>/dev/null || true
kill "${TAIL_PID}" 2>/dev/null || true
