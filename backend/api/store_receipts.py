"""Confirm a store subscription before any model allowance is issued.

Apple transactions are signed by a certificate chain that must end at Apple's
root. Android purchase tokens are checked with the Play Developer API. Neither
path trusts the phone's claim by itself.
"""

import base64
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from cryptography import x509
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec, padding, utils

PRODUCT_ID = "bob_monthly"
BUNDLE_ID = os.getenv("APPLE_BUNDLE_ID", "com.bob.specialblend")
PACKAGE_NAME = os.getenv("GOOGLE_PLAY_PACKAGE", "com.bob.specialblend")
ACTIVE_GOOGLE_STATES = {
    "SUBSCRIPTION_STATE_ACTIVE",
    "SUBSCRIPTION_STATE_CANCELED",
    "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
}


class BillingNotConfigured(Exception):
    pass


class InvalidReceipt(Exception):
    pass


def verify(platform, product_id, purchase_token):
    if product_id != PRODUCT_ID or not purchase_token:
        raise InvalidReceipt("unknown subscription")
    if platform == "ios":
        return verify_apple(purchase_token)
    if platform == "android":
        return verify_google(purchase_token)
    raise InvalidReceipt("unknown store")


def _b64url(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64url_decode(data):
    padding_chars = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding_chars)


def _apple_root_der():
    path = os.getenv("APPLE_ROOT_CA_PATH") or os.path.join(os.path.dirname(__file__), "certs", "AppleRootCA-G3.cer")
    if not os.path.isfile(path):
        raise BillingNotConfigured("Apple receipt verification is not configured.")
    with open(path, "rb") as handle:
        return handle.read()


def _verify_signed_by(child, parent):
    public_key = parent.public_key()
    if isinstance(public_key, ec.EllipticCurvePublicKey):
        public_key.verify(child.signature, child.tbs_certificate_bytes, ec.ECDSA(child.signature_hash_algorithm))
        return
    public_key.verify(child.signature, child.tbs_certificate_bytes, padding.PKCS1v15(), child.signature_hash_algorithm)


def _verify_certificate_chain(certificates, root):
    chain = certificates + [root]
    now = datetime.now(timezone.utc)
    for certificate in chain:
        if certificate.not_valid_before_utc > now or certificate.not_valid_after_utc < now:
            raise InvalidReceipt("expired store certificate")
    for child, parent in zip(chain, chain[1:]):
        _verify_signed_by(child, parent)


def verify_apple(jws, root_der=None, now_ms=None):
    root_der = root_der if root_der is not None else _apple_root_der()
    now_ms = int(time.time() * 1000) if now_ms is None else int(now_ms)
    parts = (jws or "").split(".")
    if len(parts) != 3:
        raise InvalidReceipt("unreadable Apple transaction")
    try:
        header = json.loads(_b64url_decode(parts[0]))
        payload = json.loads(_b64url_decode(parts[1]))
        signature = _b64url_decode(parts[2])
        certificates = [x509.load_der_x509_certificate(base64.b64decode(item)) for item in header["x5c"]]
        root = x509.load_der_x509_certificate(root_der)
    except (KeyError, ValueError, json.JSONDecodeError, TypeError) as exc:
        raise InvalidReceipt("unreadable Apple transaction") from exc
    if header.get("alg") != "ES256" or len(certificates) < 1 or len(signature) != 64:
        raise InvalidReceipt("unreadable Apple transaction")
    try:
        _verify_certificate_chain(certificates, root)
        r = int.from_bytes(signature[:32], "big")
        s = int.from_bytes(signature[32:], "big")
        certificates[0].public_key().verify(
            utils.encode_dss_signature(r, s),
            f"{parts[0]}.{parts[1]}".encode(),
            ec.ECDSA(hashes.SHA256()),
        )
    except InvalidSignature as exc:
        raise InvalidReceipt("Apple transaction signature was rejected") from exc
    if payload.get("bundleId") != BUNDLE_ID or payload.get("productId") != PRODUCT_ID:
        raise InvalidReceipt("Apple transaction is for a different app or product")
    if payload.get("revocationDate"):
        raise InvalidReceipt("Apple transaction was revoked")
    try:
        expires_ms = int(payload["expiresDate"])
        account_id = str(payload["originalTransactionId"])
    except (KeyError, TypeError, ValueError) as exc:
        raise InvalidReceipt("Apple transaction is missing its subscription period") from exc
    if not account_id or expires_ms <= now_ms:
        raise InvalidReceipt("Apple subscription is not active")
    return f"ios:{account_id}", expires_ms // 1000


def parse_google_subscription(payload, product_id, now_ms):
    if payload.get("subscriptionState") not in ACTIVE_GOOGLE_STATES:
        raise InvalidReceipt("Google Play subscription is not active")
    matched = next((item for item in payload.get("lineItems") or [] if item.get("productId") == product_id), None)
    if matched is None:
        raise InvalidReceipt("Google Play subscription is for a different product")
    expiry = matched.get("expiryTime")
    order_id = str(payload.get("latestOrderId") or "")
    base_order = order_id.split("..", 1)[0]
    if not expiry or not base_order:
        raise InvalidReceipt("Google Play subscription is missing its period")
    try:
        expires_at = datetime.fromisoformat(expiry.replace("Z", "+00:00"))
    except ValueError as exc:
        raise InvalidReceipt("Google Play subscription expiry is unreadable") from exc
    expires_ms = int(expires_at.timestamp() * 1000)
    if expires_ms <= int(now_ms):
        raise InvalidReceipt("Google Play subscription is not active")
    return f"android:{base_order}", expires_ms // 1000


def _google_account_info():
    raw = os.getenv("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON")
    if not raw:
        raise BillingNotConfigured("Google Play receipt verification is not configured.")
    if raw.lstrip().startswith("{"):
        info = json.loads(raw)
    else:
        with open(raw, "r", encoding="utf-8") as handle:
            info = json.load(handle)
    if not info.get("client_email") or not info.get("private_key"):
        raise BillingNotConfigured("Google Play receipt verification is not configured.")
    return info


def _google_access_token(info):
    now = int(time.time())
    header = _b64url(json.dumps({"alg": "RS256", "typ": "JWT"}).encode())
    claim = _b64url(json.dumps({
        "iss": info["client_email"],
        "scope": "https://www.googleapis.com/auth/androidpublisher",
        "aud": "https://oauth2.googleapis.com/token",
        "iat": now,
        "exp": now + 3600,
    }).encode())
    signing_input = f"{header}.{claim}".encode()
    key = serialization.load_pem_private_key(info["private_key"].encode(), password=None)
    signature = key.sign(signing_input, padding.PKCS1v15(), hashes.SHA256())
    assertion = f"{header}.{claim}.{_b64url(signature)}"
    body = urllib.parse.urlencode({
        "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
        "assertion": assertion,
    }).encode()
    request = urllib.request.Request("https://oauth2.googleapis.com/token", data=body)
    with urllib.request.urlopen(request, timeout=15) as response:
        token = json.loads(response.read().decode())
    access = token.get("access_token")
    if not access:
        raise InvalidReceipt("Google Play did not accept the server credential")
    return access


def verify_google(purchase_token, now_ms=None):
    info = _google_account_info()
    now_ms = int(time.time() * 1000) if now_ms is None else int(now_ms)
    access = _google_access_token(info)
    url = (
        "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/"
        f"{PACKAGE_NAME}/purchases/subscriptionsv2/tokens/{urllib.parse.quote(purchase_token, safe='')}"
    )
    request = urllib.request.Request(url, headers={"Authorization": f"Bearer {access}"})
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            payload = json.loads(response.read().decode())
    except urllib.error.HTTPError as exc:
        raise InvalidReceipt("Google Play rejected the purchase token") from exc
    return parse_google_subscription(payload, PRODUCT_ID, now_ms)
