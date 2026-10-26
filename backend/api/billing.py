"""Bob subscription ledger.

The monthly AI allowance is $4.00; the subscription price is $4.99. Cost uses Groq's
published gpt-oss-20b rates. Cached input is rounded up from $0.0375 to $0.038
per million tokens so the recorded cost is never below the provider bill.
"""

import hmac
import hashlib
import json
import os
import sqlite3
import threading
import time
from hashlib import sha256

MONTHLY_PRICE_USD = "4.99"
MONTHLY_BUDGET_NANO = 4_000_000_000  # $4.00 shared by chat and voice
PRODUCT_ID = "bob_monthly"
PAYWALL_MESSAGE = "Bob is a $4.99 monthly subscription. Library, cabinet, recipes, and saved versions stay free."
CAP_MESSAGE = "Your $4.00 monthly AI allowance has insufficient funds for this request. Chat and voice resume when your subscription renews."
EXPIRED_MESSAGE = "Your Bob subscription has ended. Subscribe again to keep talking to Bob."

# Nano-dollars (1e-9 USD) per token: uncached input, cached input, output.
_KNOWN_PRICES = {
    "openai/gpt-oss-20b": (75, 38, 300),
}

_lock = threading.Lock()
_connection = None
_connection_path = None


class UnknownModelPrice(Exception):
    pass


def prices_for(model):
    raw = (
        os.getenv("GROQ_INPUT_NANO_PER_TOKEN"),
        os.getenv("GROQ_CACHED_NANO_PER_TOKEN"),
        os.getenv("GROQ_OUTPUT_NANO_PER_TOKEN"),
    )
    if all(raw):
        try:
            prices = tuple(int(value) for value in raw)
        except ValueError:
            prices = ()
        if len(prices) == 3 and all(price > 0 for price in prices):
            return prices
    prices = _KNOWN_PRICES.get(model)
    if prices is None:
        raise UnknownModelPrice(model)
    return prices


def token_cost_nano(model, prompt_tokens, cached_tokens, completion_tokens):
    input_price, cached_price, output_price = prices_for(model)
    prompt_tokens = max(0, int(prompt_tokens))
    cached_tokens = min(prompt_tokens, max(0, int(cached_tokens)))
    completion_tokens = max(0, int(completion_tokens))
    uncached = prompt_tokens - cached_tokens
    return uncached * input_price + cached_tokens * cached_price + completion_tokens * output_price


def estimate_request_nano(model, prompt_characters, max_completion_tokens):
    # Reserve a byte-token upper bound, including a generous chat-template allowance.
    return token_cost_nano(model, max(int(prompt_characters), 1) + 4096, 0, max(int(max_completion_tokens), 0))


def usage_nano(model, usage):
    if usage is None:
        return None
    prompt = int(getattr(usage, "prompt_tokens", 0) or 0)
    completion = int(getattr(usage, "completion_tokens", 0) or 0)
    details = getattr(usage, "prompt_tokens_details", None)
    cached = int(getattr(details, "cached_tokens", 0) or 0) if details is not None else 0
    return token_cost_nano(model, prompt, cached, completion)


def _database_path():
    override = os.getenv("BOB_BILLING_DB")
    if os.getenv("RENDER") == "true":
        mount = os.path.realpath(os.getenv("BOB_BILLING_MOUNT", "/var/data"))
        if not override or not os.path.isabs(override):
            raise RuntimeError("BOB_BILLING_DB must be an absolute path on the persistent disk.")
        path = os.path.realpath(override)
        if os.path.commonpath([path, mount]) != mount or path == mount:
            raise RuntimeError("The billing database must be stored inside BOB_BILLING_MOUNT.")
        if not os.path.ismount(mount):
            raise RuntimeError("The billing persistent disk is not mounted.")
    if override:
        return override
    return os.path.join(os.path.dirname(__file__), "..", "data", "bob_billing.sqlite")


def _connect():
    global _connection, _connection_path
    path = os.path.abspath(_database_path())
    if _connection is not None and _connection_path == path:
        return _connection
    if _connection is not None:
        _connection.close()
    directory = os.path.dirname(path)
    if directory:
        os.makedirs(directory, exist_ok=True)
    connection = sqlite3.connect(path, check_same_thread=False)
    connection.row_factory = sqlite3.Row
    connection.execute("CREATE TABLE IF NOT EXISTS subscriptions (account_id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)")
    connection.execute("CREATE TABLE IF NOT EXISTS usage (account_id TEXT NOT NULL, period_id TEXT NOT NULL, spent_nano INTEGER NOT NULL, PRIMARY KEY (account_id, period_id))")
    connection.execute("CREATE TABLE IF NOT EXISTS secrets (name TEXT PRIMARY KEY, value TEXT NOT NULL)")
    connection.commit()
    _connection = connection
    _connection_path = path
    return connection


def _token_secret():
    configured = os.getenv("BILLING_TOKEN_SECRET")
    if configured:
        return configured.encode()
    with _lock:
        connection = _connect()
        row = connection.execute("SELECT value FROM secrets WHERE name = 'token'").fetchone()
        if row:
            return row["value"].encode()
        value = sha256(os.urandom(32)).hexdigest()
        connection.execute("INSERT INTO secrets (name, value) VALUES ('token', ?)", (value,))
        connection.commit()
        return value.encode()


def _sign(payload):
    body = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    signature = hmac.new(_token_secret(), body, hashlib.sha256).hexdigest()
    return body.hex() + "." + signature


def _read_token(token):
    try:
        body_hex, signature = token.split(".", 1)
        body = bytes.fromhex(body_hex)
    except ValueError:
        return None
    expected = hmac.new(_token_secret(), body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        return None
    try:
        payload = json.loads(body.decode())
    except json.JSONDecodeError:
        return None
    if not isinstance(payload, dict):
        return None
    return payload


def activate_subscription(account_id, expires_at):
    expires_at = int(expires_at)
    if expires_at <= int(time.time()):
        raise ValueError("subscription is not active")
    with _lock:
        connection = _connect()
        connection.execute(
            "INSERT INTO subscriptions (account_id, expires_at) VALUES (?, ?) "
            "ON CONFLICT(account_id) DO UPDATE SET expires_at = MAX(subscriptions.expires_at, excluded.expires_at)",
            (account_id, expires_at),
        )
        connection.commit()
    return _sign({"sub": account_id, "exp": expires_at})


def access_state(token):
    payload = _read_token(token or "")
    if payload is None:
        return "missing", None
    account_id = payload.get("sub")
    exp = payload.get("exp")
    if not isinstance(account_id, str) or not account_id or not isinstance(exp, int):
        return "missing", None
    now = int(time.time())
    if exp <= now:
        return "expired", None
    with _lock:
        connection = _connect()
        row = connection.execute("SELECT expires_at FROM subscriptions WHERE account_id = ?", (account_id,)).fetchone()
    if row is None or int(row["expires_at"]) <= now:
        return "expired", None
    return "active", account_id


def authenticate(token):
    state, account_id = access_state(token)
    return account_id if state == "active" else None


def _period_id(account_id):
    connection = _connect()
    row = connection.execute("SELECT expires_at FROM subscriptions WHERE account_id = ?", (account_id,)).fetchone()
    if row is None or int(row["expires_at"]) <= int(time.time()):
        return None
    return str(int(row["expires_at"]))


def try_reserve(account_id, estimate_nano):
    estimate_nano = int(estimate_nano)
    if estimate_nano < 0:
        raise ValueError("estimate must be positive")
    with _lock:
        connection = _connect()
        connection.execute("BEGIN IMMEDIATE")
        period_id = _period_id(account_id)
        if period_id is None:
            connection.rollback()
            return False
        connection.execute(
            "INSERT INTO usage (account_id, period_id, spent_nano) VALUES (?, ?, 0) ON CONFLICT DO NOTHING",
            (account_id, period_id),
        )
        spent = int(connection.execute(
            "SELECT spent_nano FROM usage WHERE account_id = ? AND period_id = ?",
            (account_id, period_id),
        ).fetchone()["spent_nano"])
        if spent + estimate_nano > MONTHLY_BUDGET_NANO:
            connection.rollback()
            return False
        connection.execute(
            "UPDATE usage SET spent_nano = ? WHERE account_id = ? AND period_id = ?",
            (spent + estimate_nano, account_id, period_id),
        )
        connection.commit()
        return period_id


def settle(account_id, reserved_nano, actual_nano, period_id=None):
    delta = int(actual_nano) - int(reserved_nano)
    with _lock:
        connection = _connect()
        period_id = period_id or _period_id(account_id)
        if period_id is None:
            return
        connection.execute("BEGIN IMMEDIATE")
        row = connection.execute(
            "SELECT spent_nano FROM usage WHERE account_id = ? AND period_id = ?",
            (account_id, period_id),
        ).fetchone()
        if row is None:
            connection.rollback()
            return
        spent = max(0, int(row["spent_nano"]) + delta)
        connection.execute(
            "UPDATE usage SET spent_nano = ? WHERE account_id = ? AND period_id = ?",
            (spent, account_id, period_id),
        )
        connection.commit()


def set_spent_nano(account_id, spent_nano):
    with _lock:
        connection = _connect()
        period_id = _period_id(account_id)
        if period_id is None:
            raise ValueError("no active subscription")
        connection.execute(
            "INSERT INTO usage (account_id, period_id, spent_nano) VALUES (?, ?, ?) "
            "ON CONFLICT(account_id, period_id) DO UPDATE SET spent_nano = excluded.spent_nano",
            (account_id, period_id, int(spent_nano)),
        )
        connection.commit()


def _format_usd(cents):
    return f"{cents // 100}.{cents % 100:02d}"


def public_allowance(account_id):
    with _lock:
        connection = _connect()
        period_id = _period_id(account_id)
        spent = 0
        if period_id is not None:
            row = connection.execute(
                "SELECT spent_nano FROM usage WHERE account_id = ? AND period_id = ?",
                (account_id, period_id),
            ).fetchone()
            spent = int(row["spent_nano"]) if row else 0
    spent_cents = 0 if spent <= 0 else (spent + 9_999_999) // 10_000_000
    remaining_cents = max(0, 400 - spent_cents)
    return {
        "budget_usd": "4.00",
        "spent_usd": _format_usd(spent_cents),
        "remaining_usd": _format_usd(remaining_cents),
    }


def check_storage():
    """Verify database access without exposing customer records or signing keys."""
    with _lock:
        connection = _connect()
        connection.execute("SELECT 1").fetchone()
