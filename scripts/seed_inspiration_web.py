"""One-off: bake Charlie's demo-authored inspiration web into the real backend
(#10 Phase 1). Creates the 5 bundled external pieces from ios-v1's assets and
the 4 curated edges that shipped hard-coded in inspirationMock.ts. Idempotent:
externals are skipped when an (artist, title) match already exists and
POST /inspirations returns the existing edge on re-runs — safe to run twice.

Run from a laptop on the same network as the Pi (images live in this repo,
not on the Pi):
    .venv/bin/python scripts/seed_inspiration_web.py --base http://<pi>/api \
        --username charlie
Password is read from PC_PASSWORD or prompted.
"""
import argparse
import getpass
import os
import sys
from pathlib import Path

import httpx

REPO = Path(__file__).resolve().parent.parent
IMGS = REPO / "ios-v1" / "assets" / "imgs"

# (artist, title, image file) — mirrors BUNDLED_EXTERNALS in inspirationMock.ts.
EXTERNALS = [
    ("Gustav Klimt", "Litzlberg am Attersee", IMGS / "klimpt.png"),
    ("Ferdinand Hodler", "The Kien Valley with the Bluemlisalp Massif",
     IMGS / "externals" / "hodler-kien-valley.jpg"),
    ("Milton Avery", "Dune and Sea II", IMGS / "externals" / "avery-dune-and-sea-ii.jpg"),
    ("Fairfield Porter", "Plane Tree", IMGS / "externals" / "porter-plane-tree.jpg"),
    ("Manet", "The Railway", IMGS / "externals" / "manet-the-railway.jpg"),
]

# (club creator, club piece title, external artist) — the curated seed threads.
EDGES = [
    ("charlie", "bernal hill", "Ferdinand Hodler"),
    ("charlie", "the beach", "Milton Avery"),
    ("charlie", "wippets on the couch", "Fairfield Porter"),
    ("charlie", "wippets on the couch", "Manet"),
]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True, help="API base, e.g. http://192.168.86.92/api")
    ap.add_argument("--username", default="charlie")
    ap.add_argument("--token", help="bearer token for --username (skips the password login)")
    args = ap.parse_args()

    c = httpx.Client(base_url=args.base.rstrip("/"), timeout=60)
    if args.token:
        c.headers["Authorization"] = f"Bearer {args.token}"
    else:
        password = os.environ.get("PC_PASSWORD") or getpass.getpass(f"password for {args.username}: ")
        r = c.post("/members/login", json={"username": args.username, "password": password})
        r.raise_for_status()
        c.headers["Authorization"] = f"Bearer {r.json()['access_token']}"

    # 1) externals (skip any artist+title already in the catalog)
    ext_by_artist: dict[str, str] = {}
    for artist, title, img in EXTERNALS:
        r = c.get("/inspirations/search-targets", params={"q": artist})
        r.raise_for_status()
        # Reuse any existing external by this artist (exact title first) — a
        # member may have already added the piece via the app with a shorter
        # or missing title, and a second node would split the connection.
        candidates = [n for n in r.json() if n["kind"] == "external" and n["artist"] == artist]
        existing = next((n for n in candidates if n["title"] == title), None) or (
            candidates[0] if candidates else None
        )
        if existing:
            ext_by_artist[artist] = existing["id"]
            note = "" if existing["title"] == title else f" (kept member title: {existing['title']!r})"
            print(f"= external exists: {artist} — {title}{note}")
            continue
        if not img.exists():
            print(f"! missing image, skipping: {img}")
            continue
        mime = "image/png" if img.suffix == ".png" else "image/jpeg"
        r = c.post("/external-art", data={"artist": artist, "title": title},
                   files={"file": (img.name, img.read_bytes(), mime)})
        r.raise_for_status()
        ext_by_artist[artist] = r.json()["id"]
        print(f"+ external created: {artist} — {title}")

    # 2) resolve charlie's pieces by creator+title (as the mock did) and link.
    # search-targets (not /art/search) — it covers every medium and doesn't
    # filter on profile-hidden media.
    def find_art(creator: str, title: str) -> str | None:
        r = c.get("/inspirations/search-targets", params={"q": title})
        r.raise_for_status()
        for a in r.json():
            if (a["kind"] == "art" and a["creator"] == creator
                    and (a["title"] or "").strip().lower() == title):
                return a["id"]
        return None

    failures = 0
    for creator, title, artist in EDGES:
        art_id = find_art(creator, title)
        ext_id = ext_by_artist.get(artist)
        if not art_id or not ext_id:
            print(f"! could not resolve edge {creator} '{title}' -> {artist} "
                  f"(art={'ok' if art_id else 'MISSING'}, ext={'ok' if ext_id else 'MISSING'})")
            failures += 1
            continue
        r = c.post("/inspirations", json={"from_art_id": art_id, "to_external_id": ext_id})
        r.raise_for_status()
        print(f"+ edge: {creator} '{title}' -> {artist} ({r.json()['id']})")

    print("done" + (f" — {failures} edge(s) unresolved" if failures else ""))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
