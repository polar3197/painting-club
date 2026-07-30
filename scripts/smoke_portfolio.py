"""Portfolio V1 smoke — run against a THROWAWAY stack, never prod.

There is no self-registration route, so this script bootstraps two members
(A and B) with a direct Postgres insert (bcrypt-hashed password, mirroring
db_ops/members.py) and then drives everything else through the real HTTP
API — including member A's one visual_2d piece, uploaded via the real
POST /art/upload/visual-2d route with a Pillow-generated JPEG (more robust
than hand-rolling the Art/Visual2D/Media_Members rows). The bootstrap also
inserts one `media` row ("painting", type visual_2d): the codebase has no
seed for base media rows on a fresh DB (only admin-gated POST /media, and
there's no admin yet) — this is fixture setup, not feature-code behavior.

Checks (each prints PASS/FAIL, exits non-zero on any FAIL):
 1.  GET  /members without auth            -> 401/403           (Task 1)
 2.  GET  /portfolio/mine (member A)       -> 200, draft created, slug valid, published=false
 3.  PATCH /portfolio/mine slug='jane'     -> 200
 4.  PATCH /portfolio/mine slug='jane' as member B -> 409 (taken)
 5.  POST /portfolio/blocks gallery        -> 200, block present
 6.  PUT  .../pieces with B's art id       -> 400 (not yours)
 7.  PUT  .../pieces with A's club piece   -> 400 (not public)
 8.  PATCH /art/{id}/visibility public (A) -> 200; /static/public/{id}.jpg exists in the static volume
 9.  PUT  .../pieces with that piece       -> 200, ordered
10.  GET  /p/jane unauthenticated          -> 404 (unpublished)
11.  GET  /portfolio/preview-link          -> 200; GET that url -> 200 HTML containing the piece
12.  PATCH /portfolio/mine published=true  -> 200; GET /p/jane -> 200; body has og:title, no 'paintingclub'/'paint club'
13.  GET  /p/img/{id} unauthenticated      -> 200 image/jpeg, Cache-Control public
14.  GET  /static/public/{id}.jpg direct   -> 403 (nginx lockdown; only when run through nginx)
15.  PATCH /art/{id}/visibility club       -> 200; GET /p/img/{id} -> 404; GET /p/jane omits the piece
16.  DELETE block; GET /portfolio/mine     -> blocks empty

Usage (mirrors the rig in the task-13 brief):
    docker run --rm -d --name pc-smoke-pg -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=pc \\
        -p 5544:5432 postgres:16
    PG_USER=postgres PG_PASSWORD=pw PG_NAME=pc PG_HOST=localhost PG_PORT=5544 \\
        JWT_SECRET=smokesecret STATIC_ROOT=/tmp/pc-smoke uvicorn api.main:app --port 8011
    .venv/bin/python scripts/smoke_portfolio.py --base http://localhost:8011
"""
import argparse
import io
import sys
import time
import urllib.parse
import uuid

import bcrypt
import httpx
import psycopg2
from PIL import Image

SMOKE_PASSWORD = "Sm0ke-Test-Pass-1234!"


def make_jpeg_bytes(size=(400, 300), color=(120, 60, 30)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, format="JPEG", quality=90)
    return buf.getvalue()


def wait_for_health(base: str, timeout: float = 30.0) -> None:
    deadline = time.time() + timeout
    last_err = None
    while time.time() < deadline:
        try:
            r = httpx.get(f"{base}/health", timeout=5)
            if r.status_code == 200:
                print(f"= uvicorn healthy at {base}")
                return
        except httpx.HTTPError as e:
            last_err = e
        time.sleep(1)
    raise RuntimeError(f"uvicorn never became healthy at {base}/health: {last_err}")


def bootstrap_db(pg_dsn: dict) -> dict[str, str]:
    """Direct-insert two members (bcrypt password_hash, mirroring
    db_ops/members.py::db_create_member) and one base 'painting' media row
    (visual_2d) — there's no self-registration route and no seed for base
    media on a fresh DB. Returns {username: id} for reference."""
    conn = psycopg2.connect(**pg_dsn)
    conn.autocommit = True
    ids: dict[str, str] = {}
    try:
        with conn.cursor() as cur:
            for username in ("smoke-alice", "smoke-bob"):
                member_id = str(uuid.uuid4())
                password_hash = bcrypt.hashpw(
                    SMOKE_PASSWORD.encode(), bcrypt.gensalt(rounds=12)
                ).decode()
                cur.execute(
                    """
                    INSERT INTO member (id, username, password_hash, role, must_change_password)
                    VALUES (%s, %s, %s, 'member', false)
                    ON CONFLICT (username) DO NOTHING
                    """,
                    (member_id, username, password_hash),
                )
                cur.execute("SELECT id FROM member WHERE username = %s", (username,))
                ids[username] = str(cur.fetchone()[0])

            # media.name has no unique constraint (mirrors the WHERE NOT EXISTS
            # pattern db_manager.py uses for the audio seed).
            cur.execute(
                """
                INSERT INTO media (id, name, type)
                SELECT %s, 'painting', 'visual_2d'
                WHERE NOT EXISTS (SELECT 1 FROM media WHERE name = 'painting')
                """,
                (str(uuid.uuid4()),),
            )
    finally:
        conn.close()
    print(f"= bootstrapped members: {ids}")
    return ids


def login(c: httpx.Client, username: str) -> str:
    r = c.post("/members/login", json={"username": username, "password": SMOKE_PASSWORD})
    r.raise_for_status()
    return r.json()["access_token"]


def upload_piece(c: httpx.Client, token: str, username: str, title: str) -> str:
    """Upload a real visual_2d piece as `username` and return its art id
    (the upload route only returns file_path, so we resolve the id via
    GET /portfolio/my-pieces afterward)."""
    headers = {"Authorization": f"Bearer {token}"}
    r = c.post(
        "/art/upload/visual-2d",
        headers=headers,
        data={"username": username, "medium": "painting", "title": title},
        files={"file": (f"{title}.jpg", make_jpeg_bytes(), "image/jpeg")},
    )
    r.raise_for_status()
    r = c.get("/portfolio/my-pieces", headers=headers)
    r.raise_for_status()
    match = next(p for p in r.json() if p["title"] == title)
    return match["id"]


class Fail(AssertionError):
    pass


def run(args) -> int:
    static_root = args.static_root.rstrip("/")

    ids = bootstrap_db(
        {
            "host": args.pg_host,
            "port": args.pg_port,
            "user": args.pg_user,
            "password": args.pg_password,
            "dbname": args.pg_db,
        }
    )

    c = httpx.Client(base_url=args.base.rstrip("/"), timeout=30)
    wait_for_health(args.base.rstrip("/"))

    token_a = login(c, "smoke-alice")
    token_b = login(c, "smoke-bob")
    hdr_a = {"Authorization": f"Bearer {token_a}"}
    hdr_b = {"Authorization": f"Bearer {token_b}"}

    art_id_a = upload_piece(c, token_a, "smoke-alice", "Smoke Piece A")
    art_id_b = upload_piece(c, token_b, "smoke-bob", "Smoke Piece B")
    print(f"= member A: {ids['smoke-alice']} piece: {art_id_a}")
    print(f"= member B: {ids['smoke-bob']} piece: {art_id_b}")

    state: dict = {}
    failures = 0
    skips = 0
    total = 16

    def ck(n: int, desc: str, fn):
        nonlocal failures
        try:
            fn()
            print(f"PASS {n:2d}: {desc}")
        except Fail as e:
            failures += 1
            print(f"FAIL {n:2d}: {desc} — {e}")
            print(f"\n{total - n} remaining check(s) not run (aborted after first FAIL).")
            _summarize(n, failures)
            sys.exit(1)
        except Exception as e:  # unexpected — still a FAIL, not a crash
            failures += 1
            print(f"FAIL {n:2d}: {desc} — unexpected {type(e).__name__}: {e}")
            print(f"\n{total - n} remaining check(s) not run (aborted after first FAIL).")
            _summarize(n, failures)
            sys.exit(1)

    def _summarize(ran: int, fails: int):
        passed = ran - fails - skips
        parts = [f"{passed} PASS"]
        if skips:
            parts.append(f"{skips} SKIP")
        if fails:
            parts.append(f"{fails} FAIL")
        not_run = total - ran
        if not_run:
            parts.append(f"{not_run} not run")
        print(f"\n{', '.join(parts)} (of {total})")

    # 1
    def _1():
        r = c.get("/members")
        if r.status_code not in (401, 403):
            raise Fail(f"expected 401/403, got {r.status_code}")
    ck(1, "GET /members without auth -> 401/403", _1)

    # 2
    def _2():
        r = c.get("/portfolio/mine", headers=hdr_a)
        if r.status_code != 200:
            raise Fail(f"expected 200, got {r.status_code}: {r.text}")
        d = r.json()
        state["portfolio_id"] = d["id"]
        slug = d["slug"]
        if not slug or len(slug) < 2 or slug != slug.lower():
            raise Fail(f"slug not valid: {slug!r}")
        if d["published"] is not False:
            raise Fail(f"expected published=false on a fresh draft, got {d['published']}")
    ck(2, "GET /portfolio/mine (A) -> 200, draft, slug valid, published=false", _2)

    # 3
    def _3():
        r = c.patch("/portfolio/mine", headers=hdr_a, json={"slug": "jane"})
        if r.status_code != 200:
            raise Fail(f"expected 200, got {r.status_code}: {r.text}")
        if r.json()["slug"] != "jane":
            raise Fail(f"slug did not update: {r.json()['slug']!r}")
    ck(3, "PATCH /portfolio/mine slug='jane' -> 200", _3)

    # 4
    def _4():
        # Member B needs a draft portfolio to exist before the slug-collision check applies.
        c.get("/portfolio/mine", headers=hdr_b).raise_for_status()
        r = c.patch("/portfolio/mine", headers=hdr_b, json={"slug": "jane"})
        if r.status_code != 409:
            raise Fail(f"expected 409, got {r.status_code}: {r.text}")
    ck(4, "PATCH /portfolio/mine slug='jane' as B -> 409 (taken)", _4)

    # 5
    def _5():
        r = c.post("/portfolio/blocks", headers=hdr_a, json={"kind": "gallery"})
        if r.status_code != 200:
            raise Fail(f"expected 200, got {r.status_code}: {r.text}")
        blocks = r.json()["blocks"]
        gallery = next((b for b in blocks if b["kind"] == "gallery"), None)
        if gallery is None:
            raise Fail(f"no gallery block present in {blocks}")
        state["block_id"] = gallery["id"]
    ck(5, "POST /portfolio/blocks gallery -> 200, block present", _5)

    # 6
    def _6():
        r = c.put(
            f"/portfolio/blocks/{state['block_id']}/pieces",
            headers=hdr_a,
            json={"art_ids": [art_id_b]},
        )
        if r.status_code != 400:
            raise Fail(f"expected 400, got {r.status_code}: {r.text}")
    ck(6, "PUT .../pieces with B's art id -> 400 (not yours)", _6)

    # 7
    def _7():
        r = c.put(
            f"/portfolio/blocks/{state['block_id']}/pieces",
            headers=hdr_a,
            json={"art_ids": [art_id_a]},
        )
        if r.status_code != 400:
            raise Fail(f"expected 400, got {r.status_code}: {r.text}")
    ck(7, "PUT .../pieces with A's club piece -> 400 (not public)", _7)

    # 8
    def _8():
        r = c.patch(f"/art/{art_id_a}/visibility", headers=hdr_a, json={"visibility": "public"})
        if r.status_code != 200:
            raise Fail(f"expected 200, got {r.status_code}: {r.text}")
        from pathlib import Path
        p = Path(static_root) / "static" / "public" / f"{art_id_a}.jpg"
        if not p.exists():
            raise Fail(f"expected public derivative at {p}, not found")
    ck(8, "PATCH /art/{id}/visibility public (A) -> 200; public derivative on disk", _8)

    # 9
    def _9():
        r = c.put(
            f"/portfolio/blocks/{state['block_id']}/pieces",
            headers=hdr_a,
            json={"art_ids": [art_id_a]},
        )
        if r.status_code != 200:
            raise Fail(f"expected 200, got {r.status_code}: {r.text}")
        blocks = r.json()["blocks"]
        gallery = next(b for b in blocks if b["id"] == state["block_id"])
        if gallery["piece_ids"] != [art_id_a]:
            raise Fail(f"expected piece_ids == [{art_id_a}], got {gallery['piece_ids']}")
    ck(9, "PUT .../pieces with that piece -> 200, ordered", _9)

    # 10
    def _10():
        r = c.get("/p/jane")
        if r.status_code != 404:
            raise Fail(f"expected 404 (unpublished), got {r.status_code}")
    ck(10, "GET /p/jane unauthenticated -> 404 (unpublished)", _10)

    # 11
    def _11():
        r = c.get("/portfolio/preview-link", headers=hdr_a)
        if r.status_code != 200:
            raise Fail(f"expected 200, got {r.status_code}: {r.text}")
        url = r.json()["url"]
        parsed = urllib.parse.urlsplit(url)
        base_parsed = urllib.parse.urlsplit(args.base.rstrip("/"))
        rewritten = urllib.parse.urlunsplit(
            (base_parsed.scheme, base_parsed.netloc, parsed.path, parsed.query, "")
        )
        r2 = httpx.get(rewritten, timeout=30)
        if r2.status_code != 200:
            raise Fail(f"preview url {rewritten} expected 200, got {r2.status_code}")
        if f"/p/img/{art_id_a}" not in r2.text:
            raise Fail(f"preview HTML did not contain the piece ({rewritten})")
    ck(11, "GET /portfolio/preview-link -> 200; preview url -> 200 HTML with piece", _11)

    # 12
    def _12():
        r = c.patch("/portfolio/mine", headers=hdr_a, json={"published": True})
        if r.status_code != 200:
            raise Fail(f"expected 200, got {r.status_code}: {r.text}")
        r2 = c.get("/p/jane")
        if r2.status_code != 200:
            raise Fail(f"expected 200, got {r2.status_code}")
        html = r2.text
        if 'property="og:title"' not in html:
            raise Fail("missing og:title meta tag")
        low = html.lower()
        if "paintingclub" in low or "paint club" in low:
            raise Fail("public page mentions the club")
    ck(12, "PATCH published=true -> 200; /p/jane -> 200, og:title, no club refs", _12)

    # 13
    def _13():
        r = c.get(f"/p/img/{art_id_a}")
        if r.status_code != 200:
            raise Fail(f"expected 200, got {r.status_code}")
        if r.headers.get("content-type") != "image/jpeg":
            raise Fail(f"expected image/jpeg, got {r.headers.get('content-type')}")
        if "public" not in (r.headers.get("cache-control") or ""):
            raise Fail(f"expected public Cache-Control, got {r.headers.get('cache-control')!r}")
    ck(13, "GET /p/img/{id} unauthenticated -> 200 image/jpeg, Cache-Control public", _13)

    # 14
    if not args.nginx_base:
        skips += 1
        print("SKIP 14: GET /static/public/{id}.jpg direct -> 403 (not running behind nginx)")
    else:
        def _14():
            r = httpx.get(f"{args.nginx_base.rstrip('/')}/static/public/{art_id_a}.jpg", timeout=10)
            if r.status_code != 403:
                raise Fail(f"expected 403 behind nginx, got {r.status_code}")
        ck(14, "GET /static/public/{id}.jpg direct -> 403 (nginx lockdown)", _14)

    # 15
    def _15():
        r = c.patch(f"/art/{art_id_a}/visibility", headers=hdr_a, json={"visibility": "club"})
        if r.status_code != 200:
            raise Fail(f"expected 200, got {r.status_code}: {r.text}")
        r2 = c.get(f"/p/img/{art_id_a}")
        if r2.status_code != 404:
            raise Fail(f"expected 404 after revert to club, got {r2.status_code}")
        r3 = c.get("/p/jane")
        if r3.status_code != 200:
            raise Fail(f"expected 200, got {r3.status_code}")
        if f"/p/img/{art_id_a}" in r3.text:
            raise Fail("piece still present on public page after reverting to club")
    ck(15, "PATCH visibility club -> 200; /p/img 404; /p/jane omits the piece", _15)

    # 16
    def _16():
        r = c.delete(f"/portfolio/blocks/{state['block_id']}", headers=hdr_a)
        if r.status_code != 200:
            raise Fail(f"expected 200, got {r.status_code}: {r.text}")
        r2 = c.get("/portfolio/mine", headers=hdr_a)
        if r2.status_code != 200:
            raise Fail(f"expected 200, got {r2.status_code}")
        if r2.json()["blocks"] != []:
            raise Fail(f"expected empty blocks, got {r2.json()['blocks']}")
    ck(16, "DELETE block; GET /portfolio/mine -> blocks empty", _16)

    _summarize(total, failures)
    return 1 if failures else 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True, help="API base, e.g. http://localhost:8011")
    ap.add_argument("--pg-host", default="localhost")
    ap.add_argument("--pg-port", type=int, default=5544)
    ap.add_argument("--pg-user", default="postgres")
    ap.add_argument("--pg-password", default="pw")
    ap.add_argument("--pg-db", default="pc")
    ap.add_argument(
        "--static-root", default="/tmp/pc-smoke",
        help="STATIC_ROOT the uvicorn process was started with (for the on-disk check)",
    )
    ap.add_argument(
        "--nginx-base", default=None,
        help="If set, run check 14 for real against this nginx-fronted base (e.g. http://localhost)",
    )
    args = ap.parse_args()
    return run(args)


if __name__ == "__main__":
    sys.exit(main())
