"""Smoke test for the inspiration-web backend (#10) against a throwaway
postgres + local uvicorn. Run AFTER the server is up (it self-migrates on
startup). Direct DB inserts seed members/media/art; HTTP exercises the routes.
"""
import asyncio
import io
import os
import sys
import uuid

import httpx
from jose import jwt
from datetime import datetime, timedelta, timezone
from PIL import Image
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import text

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))

BASE = "http://127.0.0.1:8177"
SECRET = os.environ["JWT_SECRET"]
DB_URL = "postgresql+asyncpg://pc:pc@localhost:55439/pc"

PASSED = []
FAILED = []


def check(name, cond, extra=""):
    (PASSED if cond else FAILED).append(name)
    print(("PASS " if cond else "FAIL ") + name + (f"  [{extra}]" if extra and not cond else ""))


def token(member_id):
    payload = {"sub": str(member_id), "exp": datetime.now(timezone.utc) + timedelta(days=1)}
    return jwt.encode(payload, SECRET, algorithm="HS256")


def hdr(member_id):
    return {"Authorization": f"Bearer {token(member_id)}"}


def png_bytes(color=(200, 30, 30), size=(64, 48)):
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, format="PNG")
    return buf.getvalue()


async def seed():
    engine = create_async_engine(DB_URL)
    ids = {}
    async with engine.begin() as conn:
        async def member(name, role="member"):
            mid = uuid.uuid4()
            await conn.execute(text(
                "INSERT INTO member (id, username, email, password_hash, role, must_change_password) "
                "VALUES (:i, :u, :e, 'x', :r, false)"
            ), {"i": str(mid), "u": name, "e": f"{name}@x.test", "r": role})
            return mid

        async def media(name, mtype):
            got = await conn.execute(text("SELECT id FROM media WHERE name = :n LIMIT 1"), {"n": name})
            existing = got.scalar_one_or_none()
            if existing is not None:
                return existing
            mid = uuid.uuid4()
            await conn.execute(text(
                "INSERT INTO media (id, name, type) VALUES (:i, :n, :t)"
            ), {"i": str(mid), "n": name, "t": mtype})
            return mid

        async def art(creator, media_id, title, atype):
            aid = uuid.uuid4()
            await conn.execute(text(
                "INSERT INTO art (id, creator_id, media_id, title, file_path, comments_enabled, type, created_at) "
                "VALUES (:i, :c, :m, :t, :f, false, :ty, now())"
            ), {"i": str(aid), "c": str(creator), "m": str(media_id), "t": title,
                "f": f"/static/{title.replace(' ', '-')}.jpg", "ty": atype})
            sub = {"visual_2d": "INSERT INTO visual_2d (id) VALUES (:i)",
                   "written_form": "INSERT INTO written_form (id) VALUES (:i)",
                   "audio": "INSERT INTO audio (id) VALUES (:i)"}[atype]
            await conn.execute(text(sub), {"i": str(aid)})
            return aid

        ids["alice"] = await member("alice")
        ids["bob"] = await member("bob")
        ids["carol"] = await member("carol", role="contributor")
        painting = await media("painting", "visual_2d")
        writing = await media("writing", "written_form")
        music = await media("music", "audio")
        ids["A1"] = await art(ids["alice"], painting, "alice one", "visual_2d")
        ids["A2"] = await art(ids["alice"], painting, "alice two", "visual_2d")
        ids["B1"] = await art(ids["bob"], painting, "bob one", "visual_2d")
        ids["W1"] = await art(ids["alice"], writing, "alice poem", "written_form")
        ids["AU1"] = await art(ids["bob"], music, "bob song", "audio")
        ids["LONER"] = await art(ids["bob"], painting, "loner piece", "visual_2d")

    # DB-level guardrails — each in its own transaction so a (deliberate)
    # constraint failure can't roll back the seed above.
    try:
        async with engine.begin() as conn:
            await conn.execute(text(
                "INSERT INTO inspiration (id, from_art_id) VALUES (:i, :f)"
            ), {"i": str(uuid.uuid4()), "f": str(ids["A1"])})
        check("CHECK constraint rejects zero targets", False)
    except Exception:
        check("CHECK constraint rejects zero targets", True)
    try:
        async with engine.begin() as conn:
            await conn.execute(text(
                "INSERT INTO inspiration (id, from_art_id, to_art_id, to_external_id) "
                "VALUES (:i, :f, :a, :e)"
            ), {"i": str(uuid.uuid4()), "f": str(ids["A1"]), "a": str(ids["B1"]),
                "e": str(uuid.uuid4())})
        check("CHECK constraint rejects two targets", False)
    except Exception:
        check("CHECK constraint rejects two targets", True)
    await engine.dispose()
    return ids


async def main():
    ids = await seed()
    alice, bob, carol = ids["alice"], ids["bob"], ids["carol"]
    A1, A2, B1, W1, AU1, LONER = (str(ids[k]) for k in ("A1", "A2", "B1", "W1", "AU1", "LONER"))

    async with httpx.AsyncClient(base_url=BASE, timeout=30) as c:
        r = await c.get("/inspirations/web")
        check("unauth full web -> 401/403", r.status_code in (401, 403), str(r.status_code))

        r = await c.get(f"/art/{A1}/web", headers=hdr(alice))
        g = r.json()
        check("empty web still includes focus node",
              r.status_code == 200 and g["focusId"] == A1
              and [n["id"] for n in g["nodes"]] == [A1] and g["edges"] == [], r.text[:200])
        check("focus node is mine for owner", g["nodes"][0]["mine"] is True)

        r = await c.post("/inspirations", json={"from_art_id": A1, "to_art_id": B1}, headers=hdr(alice))
        check("owner links own piece -> club piece", r.status_code == 200, r.text[:200])
        e1 = r.json()
        r = await c.post("/inspirations", json={"from_art_id": A1, "to_art_id": B1}, headers=hdr(alice))
        check("re-link is idempotent (same edge id)", r.status_code == 200 and r.json()["id"] == e1["id"])

        r = await c.post("/inspirations", json={"from_art_id": B1, "to_art_id": A2}, headers=hdr(alice))
        check("linking someone else's piece -> 403", r.status_code == 403, str(r.status_code))
        r = await c.post("/inspirations", json={"from_art_id": A1, "to_art_id": A1}, headers=hdr(alice))
        check("self-link -> 400", r.status_code == 400, str(r.status_code))
        r = await c.post("/inspirations", json={"from_art_id": A1}, headers=hdr(alice))
        check("no target -> 400", r.status_code == 400, str(r.status_code))
        r = await c.post("/inspirations", json={"from_art_id": A1, "to_art_id": A2, "to_external_id": str(uuid.uuid4())},
                         headers=hdr(alice))
        check("two targets -> 400", r.status_code == 400, str(r.status_code))
        r = await c.post("/inspirations", json={"from_art_id": A1, "to_art_id": str(uuid.uuid4())}, headers=hdr(alice))
        check("unknown target -> 404", r.status_code == 404, str(r.status_code))

        r = await c.post("/external-art", data={"artist": "Gustav Klimt", "title": "Litzlberg"},
                         files={"file": ("k.png", png_bytes(), "image/png")}, headers=hdr(alice))
        check("create external art", r.status_code == 200 and r.json()["kind"] == "external", r.text[:200])
        ext = r.json()
        static_root = os.environ["SMOKE_STATIC_ROOT"]
        check("external original + eager thumb on disk",
              os.path.exists(f"{static_root}/static/external/{ext['id']}.png")
              and os.path.exists(f"{static_root}/static/external-thumbs/{ext['id']}.jpg"))

        r = await c.post("/inspirations", json={"from_art_id": A2, "to_external_id": ext["id"]}, headers=hdr(alice))
        check("link to external", r.status_code == 200, r.text[:200])
        e_ext = r.json()

        # untyped to_node_id (what the client's frozen signature sends)
        r = await c.post("/inspirations", json={"from_art_id": A1, "to_node_id": B1}, headers=hdr(alice))
        check("to_node_id resolves club art (same edge as typed)",
              r.status_code == 200 and r.json()["id"] == e1["id"], r.text[:200])
        r = await c.post("/inspirations", json={"from_art_id": W1, "to_node_id": ext["id"]}, headers=hdr(alice))
        check("to_node_id resolves external", r.status_code == 200, r.text[:200])
        r = await c.delete(f"/inspirations/{r.json()['id']}", headers=hdr(alice))
        check("to_node_id edge deletes cleanly", r.status_code == 204, str(r.status_code))
        r = await c.post("/inspirations", json={"from_art_id": A1, "to_node_id": B1, "to_art_id": B1}, headers=hdr(alice))
        check("to_node_id + typed target -> 400", r.status_code == 400, str(r.status_code))
        r = await c.post("/inspirations", json={"from_art_id": A1, "to_node_id": "not-a-uuid"}, headers=hdr(alice))
        check("garbage to_node_id -> 404", r.status_code == 404, str(r.status_code))

        # bob chains his own: B1 -> AU1 (so A1 is 2 hops from AU1)
        r = await c.post("/inspirations", json={"from_art_id": B1, "to_art_id": AU1}, headers=hdr(bob))
        check("bob links his piece -> his audio", r.status_code == 200, r.text[:200])
        e_bob = r.json()
        # alice's written piece joins too: W1 -> B1
        r = await c.post("/inspirations", json={"from_art_id": W1, "to_art_id": B1}, headers=hdr(alice))
        check("written piece can be a from-node", r.status_code == 200, r.text[:200])

        r = await c.get(f"/art/{A1}/web", params={"depth": 1}, headers=hdr(alice))
        n1 = {n["id"] for n in r.json()["nodes"]}
        check("depth=1 excludes 2-hop nodes", AU1 not in n1 and B1 in n1, str(sorted(n1)))
        r = await c.get(f"/art/{A1}/web", params={"depth": 2}, headers=hdr(alice))
        n2 = {n["id"] for n in r.json()["nodes"]}
        check("depth=2 includes 2-hop nodes", AU1 in n2 and W1 in n2)
        kinds = {n["id"]: n.get("artKind") for n in r.json()["nodes"] if n["kind"] == "art"}
        check("artKind mapping (visual/written/audio)",
              kinds.get(A1) == "visual" and kinds.get(W1) == "written" and kinds.get(AU1) == "audio", str(kinds))
        check("mine flags follow the viewer",
              {n["id"]: n.get("mine") for n in r.json()["nodes"] if n["kind"] == "art"}[B1] is False)

        r = await c.get("/inspirations/web", headers=hdr(bob))
        full = r.json()
        full_ids = {n["id"] for n in full["nodes"]}
        check("full web excludes singletons", LONER not in full_ids and A1 in full_ids and ext["id"] in full_ids)
        check("full web edge count", len(full["edges"]) == 4, str(len(full["edges"])))

        r = await c.get("/inspirations/search-targets", params={"q": "bob"}, headers=hdr(alice))
        names = {n.get("title") for n in r.json()}
        check("search-targets finds by creator across mediums",
              {"bob one", "bob song", "loner piece"} <= names, str(names))
        r = await c.get("/inspirations/search-targets", params={"q": "klimt"}, headers=hdr(alice))
        check("search-targets finds externals by artist",
              any(n["kind"] == "external" for n in r.json()), r.text[:200])
        r = await c.get("/inspirations/search-targets", headers=hdr(alice))
        check("empty q -> non-empty sample", len(r.json()) > 0)

        r = await c.get(f"/external-art/{ext['id']}/image", headers=hdr(bob))
        check("gated external image serves jpeg thumb",
              r.status_code == 200 and r.headers["content-type"] == "image/jpeg")
        r = await c.get(f"/external-art/{ext['id']}/image")
        check("external image unauth -> 401/403", r.status_code in (401, 403))

        r = await c.delete(f"/inspirations/{e1['id']}", headers=hdr(bob))
        check("non-owner delete -> 403", r.status_code == 403, str(r.status_code))
        r = await c.delete(f"/inspirations/{e1['id']}", headers=hdr(carol))
        check("contributor moderator delete -> 204", r.status_code == 204, str(r.status_code))
        r = await c.delete(f"/inspirations/{e_ext['id']}", headers=hdr(alice))
        check("owner delete -> 204", r.status_code == 204, str(r.status_code))
        r = await c.delete(f"/inspirations/{e_ext['id']}", headers=hdr(alice))
        check("double delete -> 404", r.status_code == 404, str(r.status_code))
        r = await c.get(f"/art/{AU1}/web", headers=hdr(bob))
        check("deleted edges leave the graph",
              {n["id"] for n in r.json()["nodes"]} == {AU1, B1, W1}, r.text[:300])
        check("bob's own edge survives moderation",
              any(e["id"] == e_bob["id"] for e in r.json()["edges"]))

    print(f"\n{len(PASSED)} passed, {len(FAILED)} failed")
    if FAILED:
        print("FAILED:", FAILED)
        sys.exit(1)


asyncio.run(main())
