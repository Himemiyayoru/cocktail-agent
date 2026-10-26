import base64
import json
import os
import tempfile
import time
import unittest
from datetime import datetime, timedelta, timezone

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec, utils
from cryptography.x509.oid import NameOID

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))
import billing
import store_receipts


def certificate(subject_key, issuer_key, subject, issuer, ca=False):
    now = datetime.now(timezone.utc)
    builder = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(subject_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(days=1))
        .not_valid_after(now + timedelta(days=2))
    )
    if ca:
        builder = builder.add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
    return builder.sign(issuer_key, hashes.SHA256())


class BillingTests(unittest.TestCase):
    def setUp(self):
        handle = tempfile.NamedTemporaryFile(prefix="bob-unit-", suffix=".sqlite", delete=False)
        handle.close()
        self.database = handle.name
        os.environ["BOB_BILLING_DB"] = self.database
        os.environ["BILLING_TOKEN_SECRET"] = "unit-secret"

    def tearDown(self):
        if billing._connection is not None:
            billing._connection.close()
            billing._connection = None
            billing._connection_path = None
        if os.path.exists(self.database):
            os.remove(self.database)

    def test_published_prices_cannot_record_more_than_the_subscription(self):
        self.assertEqual(billing.token_cost_nano("openai/gpt-oss-20b", 1_000_000, 0, 0), 75_000_000)
        self.assertEqual(billing.token_cost_nano("openai/gpt-oss-20b", 1_000_000, 1_000_000, 0), 38_000_000)
        self.assertEqual(billing.token_cost_nano("openai/gpt-oss-20b", 0, 0, 1_000_000), 300_000_000)
        output_tokens = billing.MONTHLY_BUDGET_NANO // 300
        self.assertLessEqual(billing.token_cost_nano("openai/gpt-oss-20b", 0, 0, output_tokens), billing.MONTHLY_BUDGET_NANO)
        self.assertGreater(billing.token_cost_nano("openai/gpt-oss-20b", 0, 0, output_tokens + 1), billing.MONTHLY_BUDGET_NANO)
        with self.assertRaises(billing.UnknownModelPrice):
            billing.token_cost_nano("unknown-model", 1, 0, 0)

    def test_allowance_resets_when_the_subscription_period_changes(self):
        first_end = int(time.time()) + 1000
        billing.activate_subscription("account", first_end)
        self.assertTrue(billing.try_reserve("account", 1_000))
        billing.settle("account", 1_000, 400)
        self.assertEqual(billing.public_allowance("account")["spent_usd"], "0.01")
        billing.activate_subscription("account", first_end + 30 * 24 * 3600)
        self.assertEqual(billing.public_allowance("account")["remaining_usd"], "4.00")
        self.assertFalse(billing.try_reserve("account", billing.MONTHLY_BUDGET_NANO + 1))

    def test_four_dollar_limit_and_concurrent_reservations(self):
        from concurrent.futures import ThreadPoolExecutor
        billing.activate_subscription("account", int(time.time()) + 1000)
        self.assertEqual(billing.MONTHLY_BUDGET_NANO, 4_000_000_000)
        self.assertEqual(billing.MONTHLY_PRICE_USD, "4.99")
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda _: billing.try_reserve("account", 1_000_000_000), range(8)))
        self.assertEqual(sum(bool(result) for result in results), 4)
        self.assertFalse(billing.try_reserve("account", 1))
        self.assertEqual(billing.public_allowance("account")["remaining_usd"], "0.00")

    def test_settlement_stays_in_original_period_after_renewal(self):
        end = int(time.time()) + 1000
        billing.activate_subscription("account", end)
        period = billing.try_reserve("account", 100_000_000)
        billing.activate_subscription("account", end + 30 * 86400)
        billing.settle("account", 100_000_000, 20_000_000, period)
        self.assertEqual(billing.public_allowance("account")["spent_usd"], "0.00")
        # Replaying an old receipt cannot switch the ledger back.
        billing.activate_subscription("account", end)
        self.assertEqual(billing._period_id("account"), str(end + 30 * 86400))
        row = billing._connect().execute("SELECT spent_nano FROM usage WHERE period_id = ?", (period,)).fetchone()
        self.assertEqual(row["spent_nano"], 20_000_000)

    def test_render_rejects_missing_or_ephemeral_storage(self):
        from unittest.mock import patch
        with patch.dict(os.environ, {"RENDER": "true", "BOB_BILLING_MOUNT": tempfile.gettempdir()}):
            with patch("billing.os.path.ismount", return_value=False):
                with self.assertRaisesRegex(RuntimeError, "not mounted"):
                    billing._database_path()
            with patch("billing.os.path.ismount", return_value=True):
                self.assertEqual(billing._database_path(), self.database)
            with patch.dict(os.environ, {"BOB_BILLING_DB": "relative.sqlite"}):
                with self.assertRaisesRegex(RuntimeError, "absolute path"):
                    billing._database_path()
            with patch.dict(os.environ, {"BOB_BILLING_MOUNT": self.database + "-mount"}):
                with self.assertRaisesRegex(RuntimeError, "inside"):
                    billing._database_path()

    def test_ledger_and_generated_signing_key_survive_reopening(self):
        from unittest.mock import patch
        with patch.dict(os.environ, {"BILLING_TOKEN_SECRET": ""}):
            token = billing.activate_subscription("persistent-account", int(time.time()) + 1000)
            period = billing.try_reserve("persistent-account", 1_000_000_000)
            billing.settle("persistent-account", 1_000_000_000, 500_000_000, period)
            billing._connection.close()
            billing._connection = None
            self.assertEqual(billing.authenticate(token), "persistent-account")
            self.assertEqual(billing.public_allowance("persistent-account")["remaining_usd"], "3.50")

    def test_expired_and_tampered_tokens_are_rejected(self):
        import sqlite3
        live = billing.activate_subscription("account", int(time.time()) + 100)
        self.assertEqual(billing.authenticate(live), "account")
        connection = sqlite3.connect(self.database)
        connection.execute("UPDATE subscriptions SET expires_at = ?", (int(time.time()) - 1,))
        connection.commit()
        connection.close()
        self.assertEqual(billing.access_state(live), ("expired", None))
        self.assertIsNone(billing.authenticate(live))
        self.assertIsNone(billing.authenticate(live[:-1] + ("0" if live[-1] != "0" else "1")))


class ReceiptTests(unittest.TestCase):
    def test_apple_transaction_must_chain_to_the_configured_root(self):
        root_key = ec.generate_private_key(ec.SECP256R1())
        middle_key = ec.generate_private_key(ec.SECP256R1())
        leaf_key = ec.generate_private_key(ec.SECP256R1())
        root_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "root")])
        middle_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "middle")])
        leaf_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "leaf")])
        root = certificate(root_key, root_key, root_name, root_name, ca=True)
        middle = certificate(middle_key, root_key, middle_name, root_name, ca=True)
        leaf = certificate(leaf_key, middle_key, leaf_name, middle_name)
        payload = {
            "bundleId": store_receipts.BUNDLE_ID,
            "productId": store_receipts.PRODUCT_ID,
            "originalTransactionId": "1000001",
            "expiresDate": int((time.time() + 3600) * 1000),
        }
        header = {"alg": "ES256", "x5c": [
            base64.b64encode(leaf.public_bytes(serialization.Encoding.DER)).decode(),
            base64.b64encode(middle.public_bytes(serialization.Encoding.DER)).decode(),
        ]}
        signing_input = f"{b64(header)}.{b64(payload)}".encode()
        raw = dss_raw(leaf_key.sign(signing_input, ec.ECDSA(hashes.SHA256())))
        jws = signing_input.decode() + "." + b64_bytes(raw)
        account, expires = store_receipts.verify_apple(jws, root.public_bytes(serialization.Encoding.DER), int(time.time() * 1000))
        self.assertEqual(account, "ios:1000001")
        self.assertGreater(expires, int(time.time()))
        other_root = certificate(ec.generate_private_key(ec.SECP256R1()), root_key, root_name, root_name, ca=True)
        with self.assertRaises(store_receipts.InvalidReceipt):
            store_receipts.verify_apple(jws, other_root.public_bytes(serialization.Encoding.DER))

    def test_google_subscription_uses_the_base_order_for_renewals(self):
        expiry = (datetime.now(timezone.utc) + timedelta(days=20)).strftime("%Y-%m-%dT%H:%M:%SZ")
        account, expires = store_receipts.parse_google_subscription({
            "subscriptionState": "SUBSCRIPTION_STATE_CANCELED",
            "latestOrderId": "GPA.1234-5678-9012-34567..1",
            "lineItems": [{"productId": "bob_monthly", "expiryTime": expiry}],
        }, "bob_monthly", int(time.time() * 1000))
        self.assertEqual(account, "android:GPA.1234-5678-9012-34567")
        self.assertGreater(expires, int(time.time()))
        with self.assertRaises(store_receipts.InvalidReceipt):
            store_receipts.parse_google_subscription({
                "subscriptionState": "SUBSCRIPTION_STATE_ON_HOLD",
                "latestOrderId": "GPA.1",
                "lineItems": [{"productId": "bob_monthly", "expiryTime": expiry}],
            }, "bob_monthly", int(time.time() * 1000))


def b64(value):
    return b64_bytes(json.dumps(value, separators=(",", ":")).encode())


def b64_bytes(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def dss_raw(signature):
    r, s = utils.decode_dss_signature(signature)
    return r.to_bytes(32, "big") + s.to_bytes(32, "big")


if __name__ == "__main__":
    unittest.main()
