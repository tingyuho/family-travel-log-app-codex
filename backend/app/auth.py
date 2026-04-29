from __future__ import annotations

import hashlib
import hmac
import secrets


SCRYPT_SCHEME = "scrypt_sha256"
SCRYPT_N = 2**14
SCRYPT_R = 8
SCRYPT_P = 1
SCRYPT_SALT_BYTES = 16
SCRYPT_KEY_BYTES = 32


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(SCRYPT_SALT_BYTES)
    password_hash = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=SCRYPT_N,
        r=SCRYPT_R,
        p=SCRYPT_P,
        dklen=SCRYPT_KEY_BYTES,
    )
    return "$".join(
        [
            SCRYPT_SCHEME,
            str(SCRYPT_N),
            str(SCRYPT_R),
            str(SCRYPT_P),
            salt.hex(),
            password_hash.hex(),
        ]
    )


def verify_password(password: str, password_hash: str) -> bool:
    if is_legacy_sha256_hash(password_hash):
        return hmac.compare_digest(_legacy_sha256(password), password_hash)

    try:
        scheme, n, r, p, salt_hex, stored_hash_hex = password_hash.split("$", 5)
        if scheme != SCRYPT_SCHEME:
            return False
        stored_hash = bytes.fromhex(stored_hash_hex)
        candidate = hashlib.scrypt(
            password.encode("utf-8"),
            salt=bytes.fromhex(salt_hex),
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=len(stored_hash),
        )
        return hmac.compare_digest(candidate, stored_hash)
    except (TypeError, ValueError):
        return False


def password_needs_rehash(password_hash: str) -> bool:
    if is_legacy_sha256_hash(password_hash):
        return True
    try:
        scheme, n, r, p, _salt_hex, _stored_hash_hex = password_hash.split("$", 5)
        return (
            scheme != SCRYPT_SCHEME
            or int(n) != SCRYPT_N
            or int(r) != SCRYPT_R
            or int(p) != SCRYPT_P
        )
    except (TypeError, ValueError):
        return True


def is_legacy_sha256_hash(password_hash: str) -> bool:
    return len(password_hash) == 64 and all(char in "0123456789abcdef" for char in password_hash.lower())


def _legacy_sha256(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def generate_token() -> str:
    return secrets.token_urlsafe(32)


def generate_reset_code(length: int = 6) -> str:
    alphabet = "0123456789"
    return "".join(secrets.choice(alphabet) for _ in range(max(length, 4)))


def hash_reset_code(code: str) -> str:
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


def verify_reset_code(code: str, code_hash: str) -> bool:
    return hmac.compare_digest(hash_reset_code(code), code_hash)
