"""Signed URLs for member-only art bytes.

The art image/audio files are served by nginx as static files. To keep
non-members (and anonymous scrapers) from fetching them by URL, nginx is
configured with `secure_link` on the art paths, and the API only ever hands out
URLs carrying a valid, short-lived signature. A member's authed API call returns
freshly-signed URLs; nginx refuses any /static/art request without a good,
unexpired signature (403) — so a leaked or guessed URL is worthless past its
window, and an un-signed one never works at all (fail-closed).

The signature MUST byte-match the nginx directive:
    secure_link $arg_md5,$arg_expires;
    secure_link_md5 "$secure_link_expires$uri ${STATIC_URL_SECRET}";
i.e. md5( "<expires><uri> <secret>" ), base64url, '=' stripped.
"""
import base64
import hashlib
import os
import time

# Shared secret, injected at runtime (never committed — the repo is public).
# Empty secret ⇒ signing is a no-op, so a mis-configured deploy fails OPEN to
# un-signed URLs rather than silently 403-ing every image; nginx is what
# actually enforces, and it's only switched on once the secret is set.
SECRET = os.environ.get("STATIC_URL_SECRET", "")

# Default lifetime of a signed art URL. Long enough that an active member never
# notices (the app re-mints URLs on every listing fetch), short enough that a
# scraped/shared link dies the same session.
DEFAULT_TTL = int(os.environ.get("STATIC_URL_TTL", str(6 * 3600)))  # 6 hours

# Only these path prefixes are gated by nginx secure_link and therefore signed —
# the art bytes (visual / written / audio). Profile pictures (/static/profile/…)
# stay open by design; thumbnails are served through the auth-gated
# /art/{id}/thumb route (nginx denies /static/thumbs/ directly), so they aren't
# signed here.
SIGNED_PREFIXES = ("/static/art/", "/static/written-form/", "/static/audio/")


def sign_path(path: str | None, ttl: int = DEFAULT_TTL) -> str | None:
    """Append `?md5=…&expires=…` to a locked art path. Paths outside
    SIGNED_PREFIXES (e.g. profile pics) and empty paths are returned untouched.
    A no-op when SECRET is unset."""
    if not path or not SECRET:
        return path
    base = path.split("?", 1)[0]
    if not base.startswith(SIGNED_PREFIXES):
        return path
    expires = int(time.time()) + ttl
    raw = f"{expires}{base} {SECRET}".encode()
    md5 = (
        base64.b64encode(hashlib.md5(raw).digest())
        .decode()
        .replace("+", "-")
        .replace("/", "_")
        .replace("=", "")
    )
    return f"{base}?md5={md5}&expires={expires}"
