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


def application_art_url(art_path: str | None) -> str | None:
    """Signed URL for an application piece, from the stored relative path.

    Unlike the art derivatives these are keyed by the draft id chosen on the
    client (not a row id), so the path is stored rather than derived."""
    if not art_path:
        return None
    return _versioned_signed(art_path if art_path.startswith("/") else f"/{art_path}")


def application_thumb_url(draft_id) -> str | None:
    """512px copy of an application piece — what the review queue and the wall
    grid load. None until the background job has generated it; callers fall back
    to application_art_url()."""
    return _versioned_signed(f"/static/application-thumbs/{draft_id}.jpg")
