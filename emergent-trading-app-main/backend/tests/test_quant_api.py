"""Tests for the Quant Analysis API: market data + user watchlist + broker keys."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def user_id():
    return f"TEST_user_{uuid.uuid4().hex[:12]}"


# ---------- Health ----------
class TestHealth:
    def test_health_200(self, session):
        r = session.get(f"{API}/health", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data.get("status") == "healthy"
        assert "timestamp" in data


# ---------- Market data (regression + new) ----------
def _validate_schema(body):
    for key in ["ticker", "name", "currency", "last_price", "first_price",
                "start_date", "end_date", "series", "metrics"]:
        assert key in body, f"missing key {key}"
    assert isinstance(body["series"], list) and len(body["series"]) > 0
    first = body["series"][0]
    assert "date" in first and "close" in first
    m = body["metrics"]
    for k in ["volatility_annualized", "return_annualized", "sharpe_ratio",
              "max_drawdown", "risk_free_rate", "observations"]:
        assert k in m, f"missing metric {k}"


class TestMarketData:
    def test_swda_regression(self, session):
        r = session.get(f"{API}/market/data", params={"ticker": "SWDA.MI", "period": "1y"}, timeout=60)
        assert r.status_code == 200, r.text
        _validate_schema(r.json())

    def test_btc_regression(self, session):
        r = session.get(f"{API}/market/data", params={"ticker": "BTC-USD", "period": "1y"}, timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        _validate_schema(body)
        assert body["ticker"] == "BTC-USD"

    def test_forex_eurusd(self, session):
        r = session.get(f"{API}/market/data", params={"ticker": "EURUSD=X", "period": "1y"}, timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        _validate_schema(body)
        assert body["ticker"] == "EURUSD=X"
        m = body["metrics"]
        assert m["observations"] > 100
        assert m["max_drawdown"] <= 0

    def test_stocks_aapl(self, session):
        r = session.get(f"{API}/market/data", params={"ticker": "AAPL", "period": "1y"}, timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        _validate_schema(body)
        assert body["ticker"] == "AAPL"
        assert body["metrics"]["observations"] > 100

    def test_invalid_ticker_404(self, session):
        r = session.get(f"{API}/market/data", params={"ticker": "ZZZINVALIDXYZ", "period": "1y"}, timeout=60)
        assert r.status_code == 404, r.text


# ---------- Watchlist CRUD ----------
class TestWatchlist:
    def test_initial_empty(self, session, user_id):
        r = session.get(f"{API}/user/watchlist", params={"user_id": user_id}, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["user_id"] == user_id
        assert body["tickers"] == []

    def test_add_ticker(self, session, user_id):
        r = session.post(f"{API}/user/watchlist",
                         json={"user_id": user_id, "ticker": "TSLA"},
                         timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "TSLA" in body["tickers"]

        # GET verifies persistence
        g = session.get(f"{API}/user/watchlist", params={"user_id": user_id}, timeout=15)
        assert g.status_code == 200
        assert "TSLA" in g.json()["tickers"]

    def test_add_duplicate_returns_409(self, session, user_id):
        r = session.post(f"{API}/user/watchlist",
                         json={"user_id": user_id, "ticker": "TSLA"},
                         timeout=15)
        assert r.status_code == 409, r.text

    def test_add_invalid_format_returns_400(self, session, user_id):
        r = session.post(f"{API}/user/watchlist",
                         json={"user_id": user_id, "ticker": "bad ticker!@#"},
                         timeout=15)
        # Pydantic max_length=16 — "bad ticker!@#" is 13 chars, will pass length but fail TICKER_RE → 400
        assert r.status_code in (400, 422), r.text

    def test_add_special_chars_forex(self, session, user_id):
        r = session.post(f"{API}/user/watchlist",
                         json={"user_id": user_id, "ticker": "EURUSD=X"},
                         timeout=15)
        assert r.status_code == 200, r.text
        assert "EURUSD=X" in r.json()["tickers"]

    def test_remove_ticker(self, session, user_id):
        r = session.delete(f"{API}/user/watchlist",
                           params={"user_id": user_id, "ticker": "TSLA"},
                           timeout=15)
        assert r.status_code == 200, r.text
        assert "TSLA" not in r.json()["tickers"]

        g = session.get(f"{API}/user/watchlist", params={"user_id": user_id}, timeout=15)
        assert "TSLA" not in g.json()["tickers"]

    def test_remove_nonexistent_returns_404(self, session, user_id):
        r = session.delete(f"{API}/user/watchlist",
                           params={"user_id": user_id, "ticker": "NOPE"},
                           timeout=15)
        assert r.status_code == 404, r.text

    def test_cleanup_remove_remaining(self, session, user_id):
        # cleanup EURUSD=X added earlier
        session.delete(f"{API}/user/watchlist",
                       params={"user_id": user_id, "ticker": "EURUSD=X"},
                       timeout=15)


# ---------- Broker keys ----------
class TestBrokerKeys:
    def test_initial_not_configured(self, session, user_id):
        r = session.get(f"{API}/user/broker-keys", params={"user_id": user_id}, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["configured"] is False

    def test_save_and_mask(self, session, user_id):
        payload = {
            "user_id": user_id,
            "broker": "alpaca",
            "api_key": "PKTEST1234567890ABCD",
            "api_secret": "SECRETabcdef1234567890XYZ",
        }
        r = session.post(f"{API}/user/broker-keys", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["configured"] is True
        assert body["broker"] == "alpaca"
        # Masked values must NOT equal plaintext
        assert body["api_key_masked"] != payload["api_key"]
        assert body["api_secret_masked"] != payload["api_secret"]
        # Mask format keeps first 2 + last 2
        assert body["api_key_masked"].startswith(payload["api_key"][:2])
        assert body["api_key_masked"].endswith(payload["api_key"][-2:])

        # GET also returns masked values, never plaintext
        g = session.get(f"{API}/user/broker-keys", params={"user_id": user_id}, timeout=15)
        assert g.status_code == 200
        gb = g.json()
        assert gb["configured"] is True
        assert gb["api_key_masked"] != payload["api_key"]
        assert gb["api_secret_masked"] != payload["api_secret"]
        # ensure plaintext does NOT leak anywhere in body
        assert payload["api_key"] not in g.text
        assert payload["api_secret"] not in g.text

    def test_delete_clears(self, session, user_id):
        r = session.delete(f"{API}/user/broker-keys", params={"user_id": user_id}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["configured"] is False

        g = session.get(f"{API}/user/broker-keys", params={"user_id": user_id}, timeout=15)
        assert g.json()["configured"] is False
