"""Signed, directly-loadable URLs for the resized image derivatives.

The 512px thumb, ~1600px display copy and 256px profile-pic thumb used to be
reachable only through bearer-gated API routes, which a browser <img> can't
call (no header) — so web boxes sat broken until the multi-MB original landed.
They're now signed exactly like the originals (see signed_urls.py) and served
straight from nginx; the API embeds these URLs in the art/profile payloads.

Each URL carries `?v=<mtime>` so a replaced/WIP-updated piece (same art id,
same derivative filename) busts caches, and the stat doubles as an existence
check: a derivative that hasn't been generated yet yields None and the client
falls back to the original.
"""
import os
from pathlib import Path

from api.signed_urls import sign_path

# Container default; overridable so the API can run outside Docker (tests).
STATIC_ROOT = Path(os.environ.get("STATIC_ROOT", "/app"))


def _versioned_signed(rel: str) -> str | None:
    try:
        mtime = int((STATIC_ROOT / rel.lstrip("/")).stat().st_mtime)
    except OSError:
        return None
    return sign_path(f"{rel}?v={mtime}")


def art_thumb_url(art_id) -> str | None:
    return _versioned_signed(f"/static/thumbs/{art_id}.jpg")


def art_display_url(art_id) -> str | None:
    return _versioned_signed(f"/static/display/{art_id}.jpg")


def profile_thumb_url(member_id) -> str | None:
    return _versioned_signed(f"/static/profile-thumbs/{member_id}.jpg")
