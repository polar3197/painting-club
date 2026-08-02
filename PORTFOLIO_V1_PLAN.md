# Public Artist Portfolios V1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each member can publish a public, artist-branded portfolio website at `/p/{slug}`, rendered live from the club database, curated and themed in a desktop-webapp editor, and shareable from the iOS app — without exposing the club's existence to visitors.

**Architecture:** A new `art.visibility` flag (`club` default / `public`) plus three portfolio tables (`portfolio`, `portfolio_block`, `portfolio_block_piece`) drive a server-rendered Jinja2 public page served by the existing FastAPI app under a new `/p/` namespace. Public visitors only ever receive a downscaled, EXIF-stripped "public derivative" (never original bytes; originals stay behind nginx `secure_link`). The editor is a new page in `src/ui` (block stack with drag-reorder + theme knobs); iOS only gains a share touchpoint.

**Tech Stack:** FastAPI + SQLAlchemy async + Pillow (existing), Jinja2 (new dep), React 19 / react-router 7 (existing `src/ui`), nginx (`nginx.conf.template` only).

## Global Constraints

- **Branch from `origin/main`, NOT from `stream-b-events-obs`** — this branch's `src/nginx/nginx.conf.template` is behind main and missing the `/static/external*` + `/static/display/` lockdowns; branching from it would regress them.
- **Every git action (branch, commit, push, merge) needs Charlie's explicit per-action approval. No `Co-Authored-By: Claude` trailer on commits.** Commit steps below are gated on that approval.
- **nginx: edit `src/nginx/nginx.conf.template` ONLY.** The sibling `nginx.conf` is inert (only the template is envsubst-mounted). Deploys need `docker restart nginx`; the api hot-reloads on `git pull`.
- **Migration number: 026** (`026_portfolios.sql`). At execution time, check `ls src/db/migrations/ | tail -1` — if 026 is taken by parallel work, use the next free number and rename consistently.
- **Do not edit the `ios-v1/` working tree without coordinating** — a parallel session may be editing it live (see project memory). Task 12 is deliberately last and skippable.
- **No instructional/helper text in user-facing UI** (standing preference).
- **The public page must contain zero club branding**: no "paint club" name, no links to the app, login, or any club route. Public HTML/CSS/images only reference `/p/...` paths.
- **V1 scope limits (deliberate):** visibility is two-state (`club` | `public`) — no `private` tier (that would require filtering every club listing); `visual_2d` pieces only; no custom domains; no static publish pipeline (SSR + Cache-Control instead).
- Python tests: `pytest tests/ -v` (route tests stub the DB per `tests/conftest.py`; real-DB verification is the Task 13 throwaway-postgres smoke, matching repo practice). Web: `cd src/ui && npm run build` must pass (there is no web test rig; ESLint is not TS-aware — pre-existing).

---

### Task 1: Lockdown prerequisites (roster leak + JWT console logs)

The public feature is pointless if the club leaks. Two known leaks block the "invisible ecosystem" goal.

**Files:**
- Modify: `src/api/main.py` (route `list_members`, ~line 623 on main — grep `get_optional_member`)
- Modify: `src/ui/src/hooks/useProfile.ts`, `src/ui/src/hooks/useMembers.ts`
- Modify: `src/ui/src/components/LandingPage/Login.tsx`
- Test: `tests/test_lockdown.py` (create)

**Interfaces:**
- Consumes: existing `get_current_member` dependency (`src/api/main.py:336`).
- Produces: `GET /members` now 401s anonymously. No new symbols.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_lockdown.py
from fastapi.testclient import TestClient
from api.main import app


def test_members_roster_requires_auth():
    """Anonymous GET /members must 401/403 — it used to return the full roster
    with signed profile-pic URLs, defeating the member-only lockdown."""
    c = TestClient(app)  # no dependency overrides: real auth deps run
    r = c.get("/members")
    assert r.status_code in (401, 403)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_lockdown.py -v`
Expected: FAIL — currently returns 200 with the roster.

- [ ] **Step 3: Implement**

In `src/api/main.py`, in the `GET /members` route (`list_members`), change the dependency `current_user: Member | None = Depends(get_optional_member)` to `current_user: Member = Depends(get_current_member)`. Delete any now-dead `if current_user is None` branches inside the route, and delete the debug `print(profiles)` / `print(visual_2ds)` statements in that route while there (~lines 621, 662 — they dump member PII into logs).

- [ ] **Step 4: Run tests**

Run: `pytest tests/test_lockdown.py tests/test_api.py -v`
Expected: PASS (test_api.py confirms no regression — its client overrides auth).

- [ ] **Step 5: Web cleanup (no test rig — verify by build)**

1. `src/ui/src/hooks/useProfile.ts` — delete the `console.log` that prints the token (line ~21).
2. `src/ui/src/hooks/useMembers.ts` — delete the token `console.log`s (lines ~16-17).
3. `src/ui/src/components/LandingPage/Login.tsx` — remove the "view artists profiles" button and its handler (grep for `view artists`; the flow it fed is now a 401 dead end).

Run: `cd src/ui && npm run build` — must succeed.

- [ ] **Step 6: Commit (with Charlie's go-ahead)** — `lockdown: member-gate GET /members; drop JWT console logs + dead anonymous roster entry`

---

### Task 2: Schema — `art.visibility` + portfolio tables

**Files:**
- Modify: `src/db/models.py` (add column to `Art`; three new model classes after `Bookmark`)
- Modify: `src/db/db_manager.py` (`run_migrations()` — append idempotent guards)
- Create: `src/db/migrations/026_portfolios.sql` (paper trail, matching 013–025 style)
- Test: `tests/test_portfolio_schema.py` (create)

**Interfaces:**
- Produces: `Art.visibility` (str, `'club'`|`'public'`, server default `'club'`); models `Portfolio`, `PortfolioBlock`, `PortfolioBlockPiece` importable from `db.models`. Later tasks import exactly these names.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_portfolio_schema.py
from db.models import Art, Base


def test_art_visibility_column():
    assert "visibility" in Art.__table__.c
    assert Art.__table__.c.visibility.default.arg == "club"


def test_portfolio_tables_registered():
    for t in ("portfolio", "portfolio_block", "portfolio_block_piece"):
        assert t in Base.metadata.tables
    p = Base.metadata.tables["portfolio"]
    assert p.c.slug.unique
    assert p.c.member_id.unique
```

- [ ] **Step 2: Run to verify failure** — `pytest tests/test_portfolio_schema.py -v` → FAIL (ImportError / KeyError).

- [ ] **Step 3: Add to `src/db/models.py`**

On `Art`, after `comments_enabled`:

```python
    # Who may see this piece: 'club' (members only — the default, today's
    # behavior) or 'public' (also rendered on the owner's public portfolio and
    # servable as a downscaled public derivative). Validated app-side
    # (VALID_ART_VISIBILITY in db_ops/portfolios.py), free VARCHAR like role.
    visibility = Column(String(10), nullable=False, default="club", server_default="club")
```

New models (import `JSONB` from `sqlalchemy.dialects.postgresql` — already imported for `profile_colors`):

```python
class Portfolio(Base):
    """A member's public portfolio site. One per member. `slug` is the public
    URL segment (/p/{slug}) — a strict-charset field deliberately separate from
    username (usernames allow arbitrary chars). Nothing here is served publicly
    until `published` is true."""
    __tablename__ = "portfolio"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    member_id = Column(UUID(as_uuid=True), ForeignKey("member.id", ondelete="CASCADE"), nullable=False, unique=True)
    slug = Column(String(60), nullable=False, unique=True)
    title = Column(String(120))
    published = Column(Boolean, nullable=False, default=False)
    theme = Column(JSONB, nullable=False, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime)


class PortfolioBlock(Base):
    """One vertical block of a portfolio page. kind: 'statement' | 'gallery' |
    'spotlight'. `config` holds per-kind knobs (gallery: {"layout": "grid"|"single"};
    statement: {"text": str} overriding the member bio; spotlight: {"caption": str})."""
    __tablename__ = "portfolio_block"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    portfolio_id = Column(UUID(as_uuid=True), ForeignKey("portfolio.id", ondelete="CASCADE"), nullable=False)
    kind = Column(String(20), nullable=False)
    position = Column(Integer, nullable=False, default=0)
    config = Column(JSONB, nullable=False, default=dict)


class PortfolioBlockPiece(Base):
    """Ordered membership of an art piece in a gallery/spotlight block. Render
    filters on art.visibility='public', so flipping a piece back to club
    instantly removes it from the live site without touching these rows."""
    __tablename__ = "portfolio_block_piece"
    block_id = Column(UUID(as_uuid=True), ForeignKey("portfolio_block.id", ondelete="CASCADE"), primary_key=True)
    art_id = Column(UUID(as_uuid=True), ForeignKey("art.id", ondelete="CASCADE"), primary_key=True)
    position = Column(Integer, nullable=False, default=0)
```

- [ ] **Step 4: Append guards to `run_migrations()` in `src/db/db_manager.py`**

Follow the existing idempotent-statement pattern (same helper/exec style as the `external_art` block directly above), appending these statements:

```sql
ALTER TABLE art ADD COLUMN IF NOT EXISTS visibility VARCHAR(10) NOT NULL DEFAULT 'club'
```
```sql
CREATE TABLE IF NOT EXISTS portfolio (
    id UUID PRIMARY KEY,
    member_id UUID NOT NULL UNIQUE REFERENCES member(id) ON DELETE CASCADE,
    slug VARCHAR(60) NOT NULL UNIQUE,
    title VARCHAR(120),
    published BOOLEAN NOT NULL DEFAULT FALSE,
    theme JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP
)
```
```sql
CREATE TABLE IF NOT EXISTS portfolio_block (
    id UUID PRIMARY KEY,
    portfolio_id UUID NOT NULL REFERENCES portfolio(id) ON DELETE CASCADE,
    kind VARCHAR(20) NOT NULL,
    position INT NOT NULL DEFAULT 0,
    config JSONB NOT NULL DEFAULT '{}'
)
```
```sql
CREATE TABLE IF NOT EXISTS portfolio_block_piece (
    block_id UUID NOT NULL REFERENCES portfolio_block(id) ON DELETE CASCADE,
    art_id UUID NOT NULL REFERENCES art(id) ON DELETE CASCADE,
    position INT NOT NULL DEFAULT 0,
    PRIMARY KEY (block_id, art_id)
)
```

Create `src/db/migrations/026_portfolios.sql` containing the same four statements plus the standard header comment noting the app applies the equivalent at boot (copy the tone of `025_inspiration_web.sql`).

- [ ] **Step 5: Run tests** — `pytest tests/test_portfolio_schema.py -v` → PASS.

- [ ] **Step 6: Commit (with Charlie's go-ahead)** — `portfolio: schema — art.visibility + portfolio/block/piece tables (migration 026)`

---

### Task 3: `db_ops/portfolios.py`

**Files:**
- Create: `src/db/db_ops/portfolios.py`
- Test: `tests/test_portfolio_slug.py` (create — pure-logic tests; DB paths are covered by Task 13's smoke, matching repo practice)

**Interfaces:**
- Consumes: `Portfolio`, `PortfolioBlock`, `PortfolioBlockPiece`, `Art`, `Visual2D`, `Member` from `db.models`.
- Produces (exact signatures later tasks use):
  - `validate_slug(slug: str) -> str` (raises `ValueError`)
  - `async db_get_or_create_my_portfolio(db, member) -> Portfolio`
  - `async db_update_portfolio(db, member_id, *, slug=None, title=None, published=None, theme=None) -> Portfolio`
  - `async db_add_block(db, member_id, kind, position=None, config=None) -> PortfolioBlock`
  - `async db_update_block(db, member_id, block_id, *, config=None, position=None) -> PortfolioBlock`
  - `async db_delete_block(db, member_id, block_id) -> None`
  - `async db_set_block_pieces(db, member_id, block_id, art_ids: list) -> None`
  - `async db_my_portfolio_payload(db, member) -> dict`
  - `async db_list_my_visual_pieces(db, member_id) -> list` (rows: id, title, file_path, aspect_ratio, visibility)
  - `async db_public_portfolio_payload(db, slug: str, include_unpublished: bool = False) -> dict | None`
  - `async db_public_art_file_path(db, art_id) -> str | None`
  - `async db_set_art_visibility(db, member_id, art_id, visibility: str) -> str` (returns file_path; raises `PermissionError`/`ValueError`)

- [ ] **Step 1: Write the failing slug tests**

```python
# tests/test_portfolio_slug.py
import pytest
from db.db_ops.portfolios import validate_slug


def test_valid_slugs():
    assert validate_slug("charlie") == "charlie"
    assert validate_slug("Jane-Doe") == "jane-doe"  # lowercased


@pytest.mark.parametrize("bad", ["", "a", "-lead", "trail-", "has space", "dots.here", "sl/ash", "x" * 61, "ünïcode"])
def test_invalid_slugs(bad):
    with pytest.raises(ValueError):
        validate_slug(bad)
```

- [ ] **Step 2: Run to verify failure** — `pytest tests/test_portfolio_slug.py -v` → FAIL (module missing).

- [ ] **Step 3: Write `src/db/db_ops/portfolios.py`**

```python
import re
import uuid
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from db.models import Art, Member, Portfolio, PortfolioBlock, PortfolioBlockPiece, Visual2D

VALID_ART_VISIBILITY = {"club", "public"}
VALID_BLOCK_KINDS = {"statement", "gallery", "spotlight"}
# 2-60 chars, lowercase alnum + hyphens, no leading/trailing hyphen. Deliberately
# NOT the username (usernames allow any chars); the slug is the public URL segment.
SLUG_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$")


def validate_slug(slug: str) -> str:
    slug = (slug or "").strip().lower()
    if len(slug) < 2 or not SLUG_RE.match(slug):
        raise ValueError("slug must be 2-60 chars: lowercase letters, digits, hyphens; no leading/trailing hyphen")
    return slug


def _default_slug(username: str) -> str:
    """Best-effort slug from the username; falls back to a random handle when
    the username's charset can't make a valid slug."""
    candidate = re.sub(r"-{2,}", "-", re.sub(r"[^a-z0-9-]", "-", username.lower())).strip("-")
    try:
        return validate_slug(candidate)
    except ValueError:
        return f"artist-{uuid.uuid4().hex[:6]}"


async def _get_owned_portfolio(db: AsyncSession, member_id) -> Portfolio:
    p = (await db.execute(select(Portfolio).filter(Portfolio.member_id == member_id))).scalar_one_or_none()
    if p is None:
        raise ValueError("Portfolio not found")
    return p


async def _get_owned_block(db: AsyncSession, member_id, block_id) -> PortfolioBlock:
    row = (await db.execute(
        select(PortfolioBlock)
        .join(Portfolio, Portfolio.id == PortfolioBlock.portfolio_id)
        .filter(PortfolioBlock.id == block_id)
    )).scalar_one_or_none()
    if row is None:
        raise ValueError("Block not found")
    owner = (await db.execute(select(Portfolio.member_id).filter(Portfolio.id == row.portfolio_id))).scalar_one()
    if owner != member_id:
        raise PermissionError("Not your portfolio")
    return row


async def db_get_or_create_my_portfolio(db: AsyncSession, member) -> Portfolio:
    """The member's portfolio, created as an unpublished draft on first access
    (slug derived from username, uniquified with a numeric suffix on collision)."""
    p = (await db.execute(select(Portfolio).filter(Portfolio.member_id == member.id))).scalar_one_or_none()
    if p is not None:
        return p
    base = _default_slug(member.username)
    slug = base
    n = 2
    while (await db.execute(select(Portfolio.id).filter(Portfolio.slug == slug))).scalar_one_or_none():
        slug = f"{base}-{n}"
        n += 1
    p = Portfolio(member_id=member.id, slug=slug, title=None, published=False, theme={})
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


async def db_update_portfolio(db: AsyncSession, member_id, *, slug=None, title=None, published=None, theme=None) -> Portfolio:
    p = await _get_owned_portfolio(db, member_id)
    if slug is not None:
        slug = validate_slug(slug)
        taken = (await db.execute(
            select(Portfolio.id).filter(Portfolio.slug == slug, Portfolio.member_id != member_id)
        )).scalar_one_or_none()
        if taken:
            raise ValueError("slug already taken")
        p.slug = slug
    if title is not None:
        p.title = title.strip()[:120] or None
    if published is not None:
        p.published = bool(published)
    if theme is not None:
        if not isinstance(theme, dict):
            raise ValueError("theme must be an object")
        p.theme = theme
    p.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(p)
    return p


async def db_add_block(db: AsyncSession, member_id, kind: str, position=None, config=None) -> PortfolioBlock:
    if kind not in VALID_BLOCK_KINDS:
        raise ValueError(f"kind must be one of {sorted(VALID_BLOCK_KINDS)}")
    p = await _get_owned_portfolio(db, member_id)
    if position is None:
        max_pos = (await db.execute(
            select(PortfolioBlock.position).filter(PortfolioBlock.portfolio_id == p.id)
            .order_by(PortfolioBlock.position.desc()).limit(1)
        )).scalar_one_or_none()
        position = 0 if max_pos is None else max_pos + 1
    b = PortfolioBlock(portfolio_id=p.id, kind=kind, position=position, config=config or {})
    db.add(b)
    await db.commit()
    await db.refresh(b)
    return b


async def db_update_block(db: AsyncSession, member_id, block_id, *, config=None, position=None) -> PortfolioBlock:
    b = await _get_owned_block(db, member_id, block_id)
    if config is not None:
        if not isinstance(config, dict):
            raise ValueError("config must be an object")
        b.config = config
    if position is not None:
        b.position = int(position)
    await db.commit()
    await db.refresh(b)
    return b


async def db_delete_block(db: AsyncSession, member_id, block_id) -> None:
    b = await _get_owned_block(db, member_id, block_id)
    await db.delete(b)
    await db.commit()


async def db_set_block_pieces(db: AsyncSession, member_id, block_id, art_ids: list) -> None:
    """Replace a block's pieces with the given ordered list. Every id must be
    the member's own PUBLIC visual_2d piece — the editor flips visibility first."""
    b = await _get_owned_block(db, member_id, block_id)
    if art_ids:
        ok = {row[0] for row in (await db.execute(
            select(Art.id).filter(
                Art.id.in_(art_ids), Art.creator_id == member_id,
                Art.type == "visual_2d", Art.visibility == "public",
            )
        )).all()}
        bad = [str(a) for a in art_ids if a not in ok]
        if bad:
            raise ValueError(f"not your public visual pieces: {', '.join(bad)}")
    await db.execute(delete(PortfolioBlockPiece).where(PortfolioBlockPiece.block_id == b.id))
    for i, art_id in enumerate(art_ids):
        db.add(PortfolioBlockPiece(block_id=b.id, art_id=art_id, position=i))
    await db.commit()


async def _blocks_with_piece_ids(db: AsyncSession, portfolio_id):
    blocks = (await db.execute(
        select(PortfolioBlock).filter(PortfolioBlock.portfolio_id == portfolio_id)
        .order_by(PortfolioBlock.position, PortfolioBlock.id)
    )).scalars().all()
    out = []
    for b in blocks:
        ids = [str(r[0]) for r in (await db.execute(
            select(PortfolioBlockPiece.art_id).filter(PortfolioBlockPiece.block_id == b.id)
            .order_by(PortfolioBlockPiece.position)
        )).all()]
        out.append((b, ids))
    return out


async def db_my_portfolio_payload(db: AsyncSession, member) -> dict:
    p = await db_get_or_create_my_portfolio(db, member)
    blocks = await _blocks_with_piece_ids(db, p.id)
    return {
        "id": str(p.id), "slug": p.slug, "title": p.title,
        "published": p.published, "theme": p.theme or {},
        "blocks": [
            {"id": str(b.id), "kind": b.kind, "position": b.position,
             "config": b.config or {}, "piece_ids": ids}
            for b, ids in blocks
        ],
    }


async def db_list_my_visual_pieces(db: AsyncSession, member_id):
    """The member's own visual pieces for the editor palette, newest first."""
    return (await db.execute(
        select(Art.id, Art.title, Art.file_path, Art.visibility, Visual2D.aspect_ratio)
        .join(Visual2D, Visual2D.id == Art.id)
        .filter(Art.creator_id == member_id)
        .order_by(Art.created_at.desc())
    )).all()


async def db_public_portfolio_payload(db: AsyncSession, slug: str, include_unpublished: bool = False) -> dict | None:
    """Everything the public page template needs. None when the slug doesn't
    exist or isn't published (unless previewing). Pieces are filtered to
    visibility='public' at render time — flipping a piece to club takes it off
    the live site immediately."""
    row = (await db.execute(
        select(Portfolio, Member).join(Member, Member.id == Portfolio.member_id)
        .filter(Portfolio.slug == slug)
    )).one_or_none()
    if row is None:
        return None
    p, m = row
    if not p.published and not include_unpublished:
        return None
    blocks_out = []
    for b, ids in await _blocks_with_piece_ids(db, p.id):
        pieces = []
        if ids:
            rows = (await db.execute(
                select(Art.id, Art.title, Art.date, Visual2D.aspect_ratio)
                .join(Visual2D, Visual2D.id == Art.id)
                .filter(Art.id.in_(ids), Art.visibility == "public")
            )).all()
            by_id = {str(r.id): r for r in rows}
            pieces = [
                {"id": i, "title": by_id[i].title, "date": by_id[i].date,
                 "aspect_ratio": by_id[i].aspect_ratio}
                for i in ids if i in by_id
            ]
        blocks_out.append({"kind": b.kind, "config": b.config or {}, "pieces": pieces})
    artist_name = " ".join(x for x in (m.firstname, m.lastname) if x) or m.username
    return {
        "slug": p.slug, "title": p.title or artist_name, "artist_name": artist_name,
        "statement": m.bio, "theme": p.theme or {}, "blocks": blocks_out,
    }


async def db_public_art_file_path(db: AsyncSession, art_id) -> str | None:
    """Source file path IF the piece is public — the public image route's gate."""
    return (await db.execute(
        select(Art.file_path).filter(Art.id == art_id, Art.visibility == "public")
    )).scalar_one_or_none()


async def db_set_art_visibility(db: AsyncSession, member_id, art_id, visibility: str) -> str:
    """Owner-only visibility flip. Returns the piece's file_path so the caller
    can manage the public derivative. V1: visual_2d only."""
    if visibility not in VALID_ART_VISIBILITY:
        raise ValueError(f"visibility must be one of {sorted(VALID_ART_VISIBILITY)}")
    art = (await db.execute(select(Art).filter(Art.id == art_id))).scalar_one_or_none()
    if art is None:
        raise ValueError("Art not found")
    if art.creator_id != member_id:
        raise PermissionError("Not your piece")
    if art.type != "visual_2d":
        raise ValueError("only visual pieces can be made public in v1")
    art.visibility = visibility
    await db.commit()
    return art.file_path
```

- [ ] **Step 4: Run tests** — `pytest tests/test_portfolio_slug.py -v` → PASS.

- [ ] **Step 5: Commit (with Charlie's go-ahead)** — `portfolio: db_ops — CRUD, block pieces, visibility, public payloads`

---

### Task 4: Editor API — Pydantic models + member-gated routes

**Files:**
- Modify: `src/api/models.py` (append), `src/api/main.py` (append one block at file end; import the new db_ops at the top with the other `db_ops` imports)
- Test: `tests/test_portfolio_routes.py` (create)

**Interfaces:**
- Consumes: everything Task 3 produces; `get_current_member`, `get_db` (existing).
- Produces routes (all `Depends(get_current_member)`):
  - `GET /portfolio/mine` → `PortfolioOut`
  - `PATCH /portfolio/mine` (`PortfolioUpdateIn`) → `PortfolioOut`
  - `POST /portfolio/blocks` (`BlockCreateIn`) → `PortfolioOut`
  - `PATCH /portfolio/blocks/{block_id}` (`BlockUpdateIn`) → `PortfolioOut`
  - `DELETE /portfolio/blocks/{block_id}` → `PortfolioOut`
  - `PUT /portfolio/blocks/{block_id}/pieces` (`BlockPiecesIn`) → `PortfolioOut`
  - `GET /portfolio/my-pieces` → `list[PortfolioPieceOut]`
  - `PATCH /art/{art_id}/visibility` (`ArtVisibilityIn`) → `{"art_id", "visibility"}`
- Produces Pydantic models: `PortfolioBlockOut{id,kind,position,config,piece_ids}`, `PortfolioOut{id,slug,title,published,theme,blocks,public_url}`, `PortfolioUpdateIn{slug?,title?,published?,theme?}`, `BlockCreateIn{kind,position?,config?}`, `BlockUpdateIn{config?,position?}`, `BlockPiecesIn{art_ids}`, `PortfolioPieceOut{id,title,file_path,visibility,aspect_ratio}` (`file_path` runs through the existing `sign_path` field_serializer pattern — copy the serializer from `Visual2DOut`), `ArtVisibilityIn{visibility}`.
- `PUBLIC_SITE_ORIGIN = os.environ.get("PUBLIC_SITE_ORIGIN", "https://paintingclub.art")` in `main.py`; `public_url = f"{PUBLIC_SITE_ORIGIN}/p/{slug}"`.

- [ ] **Step 1: Write the failing route tests**

```python
# tests/test_portfolio_routes.py
import uuid
import pytest
from fastapi.testclient import TestClient
from api import main as main_mod
from api.main import app, get_current_member
from db.session import get_db


PAYLOAD = {
    "id": str(uuid.uuid4()), "slug": "testuser", "title": None,
    "published": False, "theme": {},
    "blocks": [{"id": str(uuid.uuid4()), "kind": "gallery", "position": 0,
                "config": {"layout": "grid"}, "piece_ids": []}],
}


@pytest.fixture
def pclient(fake_member, monkeypatch):
    async def fake_get_db():
        yield None
    async def fake_payload(db, member):
        return dict(PAYLOAD)
    async def fake_update(db, member_id, **kw):
        if kw.get("slug") == "taken":
            raise ValueError("slug already taken")
        return None
    monkeypatch.setattr(main_mod, "db_my_portfolio_payload", fake_payload)
    monkeypatch.setattr(main_mod, "db_update_portfolio", fake_update)
    app.dependency_overrides[get_current_member] = lambda: fake_member
    app.dependency_overrides[get_db] = fake_get_db
    c = TestClient(app)
    try:
        yield c
    finally:
        app.dependency_overrides.clear()


def test_get_mine(pclient):
    r = pclient.get("/portfolio/mine")
    assert r.status_code == 200
    body = r.json()
    assert body["slug"] == "testuser"
    assert body["public_url"].endswith("/p/testuser")
    assert body["blocks"][0]["kind"] == "gallery"


def test_patch_mine_slug_conflict(pclient):
    r = pclient.patch("/portfolio/mine", json={"slug": "taken"})
    assert r.status_code == 409


def test_routes_require_auth():
    c = TestClient(app)
    assert c.get("/portfolio/mine").status_code in (401, 403)
    assert c.patch("/art/%s/visibility" % uuid.uuid4(), json={"visibility": "public"}).status_code in (401, 403)
```

- [ ] **Step 2: Run to verify failure** — `pytest tests/test_portfolio_routes.py -v` → FAIL (404s).

- [ ] **Step 3: Append models to `src/api/models.py`**

```python
class PortfolioBlockOut(BaseModel):
    id: str
    kind: str
    position: int
    config: dict
    piece_ids: List[str]


class PortfolioOut(BaseModel):
    id: str
    slug: str
    title: Optional[str] = None
    published: bool
    theme: dict
    blocks: List[PortfolioBlockOut]
    public_url: str


class PortfolioUpdateIn(BaseModel):
    slug: Optional[str] = None
    title: Optional[str] = None
    published: Optional[bool] = None
    theme: Optional[dict] = None


class BlockCreateIn(BaseModel):
    kind: str
    position: Optional[int] = None
    config: Optional[dict] = None


class BlockUpdateIn(BaseModel):
    config: Optional[dict] = None
    position: Optional[int] = None


class BlockPiecesIn(BaseModel):
    art_ids: List[str]


class ArtVisibilityIn(BaseModel):
    visibility: str


class PortfolioPieceOut(BaseModel):
    id: str
    title: Optional[str] = None
    file_path: Optional[str] = None
    visibility: str
    aspect_ratio: Optional[float] = None

    @field_serializer("file_path")
    def _sign_file_path(self, v: Optional[str], _info):
        return sign_path(v)
```

(`field_serializer` and `sign_path` are already imported in `models.py` — used by `Visual2DOut`.)

- [ ] **Step 4: Append routes to `src/api/main.py`**

Add to the existing `from db.db_ops...` import block:

```python
from db.db_ops.portfolios import (
    db_get_or_create_my_portfolio, db_update_portfolio, db_add_block,
    db_update_block, db_delete_block, db_set_block_pieces,
    db_my_portfolio_payload, db_list_my_visual_pieces,
    db_public_portfolio_payload, db_public_art_file_path, db_set_art_visibility,
)
```

Append at the end of `main.py` (one contiguous block, per the collision rules):

```python
# --- Public portfolios (editor API; public serving is in the same block) -----
PUBLIC_SITE_ORIGIN = os.environ.get("PUBLIC_SITE_ORIGIN", "https://paintingclub.art")


def _portfolio_out(payload: dict) -> PortfolioOut:
    return PortfolioOut(**payload, public_url=f"{PUBLIC_SITE_ORIGIN}/p/{payload['slug']}")


@app.get("/portfolio/mine", response_model=PortfolioOut)
async def get_my_portfolio(db: AsyncSession = Depends(get_db), current_user: Member = Depends(get_current_member)):
    return _portfolio_out(await db_my_portfolio_payload(db, current_user))


@app.patch("/portfolio/mine", response_model=PortfolioOut)
async def update_my_portfolio(payload: PortfolioUpdateIn, db: AsyncSession = Depends(get_db),
                              current_user: Member = Depends(get_current_member)):
    try:
        await db_update_portfolio(db, current_user.id, slug=payload.slug, title=payload.title,
                                  published=payload.published, theme=payload.theme)
    except ValueError as e:
        raise HTTPException(status_code=409 if "taken" in str(e) else 400, detail=str(e))
    return _portfolio_out(await db_my_portfolio_payload(db, current_user))


@app.post("/portfolio/blocks", response_model=PortfolioOut)
async def add_portfolio_block(payload: BlockCreateIn, db: AsyncSession = Depends(get_db),
                              current_user: Member = Depends(get_current_member)):
    try:
        await db_add_block(db, current_user.id, payload.kind, payload.position, payload.config)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return _portfolio_out(await db_my_portfolio_payload(db, current_user))


@app.patch("/portfolio/blocks/{block_id}", response_model=PortfolioOut)
async def update_portfolio_block(block_id: str, payload: BlockUpdateIn, db: AsyncSession = Depends(get_db),
                                 current_user: Member = Depends(get_current_member)):
    try:
        await db_update_block(db, current_user.id, block_id, config=payload.config, position=payload.position)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return _portfolio_out(await db_my_portfolio_payload(db, current_user))


@app.delete("/portfolio/blocks/{block_id}", response_model=PortfolioOut)
async def delete_portfolio_block(block_id: str, db: AsyncSession = Depends(get_db),
                                 current_user: Member = Depends(get_current_member)):
    try:
        await db_delete_block(db, current_user.id, block_id)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return _portfolio_out(await db_my_portfolio_payload(db, current_user))


@app.put("/portfolio/blocks/{block_id}/pieces", response_model=PortfolioOut)
async def set_portfolio_block_pieces(block_id: str, payload: BlockPiecesIn, db: AsyncSession = Depends(get_db),
                                     current_user: Member = Depends(get_current_member)):
    try:
        await db_set_block_pieces(db, current_user.id, block_id, payload.art_ids)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return _portfolio_out(await db_my_portfolio_payload(db, current_user))


@app.get("/portfolio/my-pieces", response_model=List[PortfolioPieceOut])
async def list_my_portfolio_pieces(db: AsyncSession = Depends(get_db),
                                   current_user: Member = Depends(get_current_member)):
    rows = await db_list_my_visual_pieces(db, current_user.id)
    return [PortfolioPieceOut(id=str(r.id), title=r.title, file_path=r.file_path,
                              visibility=r.visibility, aspect_ratio=r.aspect_ratio) for r in rows]
```

(The `PATCH /art/{art_id}/visibility` route lands in Task 5 with the derivative lifecycle it manages.)

- [ ] **Step 5: Run tests** — `pytest tests/test_portfolio_routes.py -v` → the two `/portfolio/mine` tests + auth test PASS (the visibility auth assertion still fails until Task 5 — acceptable; or split that assertion into Task 5's test file).

- [ ] **Step 6: Commit (with Charlie's go-ahead)** — `portfolio: editor API — mine/blocks/pieces routes + models`

---

### Task 5: Public derivative pipeline + visibility route + cleanup hooks

**Files:**
- Modify: `src/api/main.py` (helpers near `generate_display`/`generate_thumbnail`; route appended to the Task-4 block; unlink hooks at existing cleanup sites)
- Test: `tests/test_public_derivative.py` (create)

**Interfaces:**
- Consumes: `db_set_art_visibility`, `db_public_art_file_path` (Task 3); `abs_path`, `STATIC_ROOT` (existing).
- Produces: `PUBLIC_SIZE = 1600`; `public_file(art_id) -> Path` (`STATIC_ROOT / "static" / "public" / f"{art_id}.jpg"`); `generate_public_image(art_id, src_abs) -> Path | None`; route `PATCH /art/{art_id}/visibility`.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_public_derivative.py
import uuid
import pytest
from PIL import Image
from fastapi.testclient import TestClient
from api import main as main_mod
from api.main import app, get_current_member
from db.session import get_db
from tests.conftest import make_jpeg_bytes


def _write_src(tmp_static, name="src.jpg", size=(2400, 1200)):
    p = tmp_static / "static" / "art" / name
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(make_jpeg_bytes(size=size))
    return p


def test_generate_public_image_downscales_and_strips(tmp_static):
    src = _write_src(tmp_static)
    art_id = str(uuid.uuid4())
    out = main_mod.generate_public_image(art_id, src)
    assert out == main_mod.public_file(art_id) and out.exists()
    with Image.open(out) as img:
        assert max(img.size) <= main_mod.PUBLIC_SIZE
        assert img.format == "JPEG"
        assert not img.getexif()  # EXIF stripped


def test_visibility_flip_manages_derivative(tmp_static, fake_member, monkeypatch):
    src = _write_src(tmp_static)
    art_id = str(uuid.uuid4())
    rel = "/static/art/src.jpg"

    async def fake_get_db():
        yield None
    async def fake_set(db, member_id, aid, vis):
        return rel
    monkeypatch.setattr(main_mod, "db_set_art_visibility", fake_set)
    app.dependency_overrides[get_current_member] = lambda: fake_member
    app.dependency_overrides[get_db] = fake_get_db
    c = TestClient(app)
    try:
        r = c.patch(f"/art/{art_id}/visibility", json={"visibility": "public"})
        assert r.status_code == 200 and r.json()["visibility"] == "public"
        assert main_mod.public_file(art_id).exists()  # eager-generated
        r = c.patch(f"/art/{art_id}/visibility", json={"visibility": "club"})
        assert r.status_code == 200
        assert not main_mod.public_file(art_id).exists()  # revoked = deleted
    finally:
        app.dependency_overrides.clear()
```

- [ ] **Step 2: Run to verify failure** — `pytest tests/test_public_derivative.py -v` → FAIL.

- [ ] **Step 3: Implement in `src/api/main.py`**

Next to the display/thumb helpers (mirror `generate_display` exactly — same draft/convert/thumbnail/save shape):

```python
PUBLIC_SIZE = 1600  # public pages never receive original bytes — this is the ceiling


def public_file(art_id: str) -> Path:
    return STATIC_ROOT / "static" / "public" / f"{art_id}.jpg"


def generate_public_image(art_id: str, src_abs: Path) -> Path | None:
    """Downscaled, EXIF-stripped JPEG served to ANONYMOUS portfolio visitors.
    Saving a fresh RGB image via Pillow drops all metadata (EXIF/GPS/etc.)."""
    out = public_file(art_id)
    try:
        out.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(src_abs) as img:
            img.draft("RGB", (PUBLIC_SIZE, PUBLIC_SIZE))
            if img.mode != "RGB":
                img = img.convert("RGB")
            img.thumbnail((PUBLIC_SIZE, PUBLIC_SIZE * 4), Image.LANCZOS)
            img.save(out, format="JPEG", quality=82, optimize=True)
        return out
    except Exception as e:
        print(f"[public] gen failed for {art_id}: {type(e).__name__}: {e}")
        out.unlink(missing_ok=True)
        return None
```

Route (append to the portfolio block):

```python
@app.patch("/art/{art_id}/visibility")
async def set_art_visibility(art_id: str, payload: ArtVisibilityIn, db: AsyncSession = Depends(get_db),
                             current_user: Member = Depends(get_current_member)):
    try:
        file_path = await db_set_art_visibility(db, current_user.id, art_id, payload.visibility)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404 if "not found" in str(e).lower() else 400, detail=str(e))
    if payload.visibility == "public":
        src = abs_path(file_path) if file_path else None
        if src is not None and src.exists() and src.suffix.lower() != ".pdf":
            generate_public_image(art_id, src)
    else:
        public_file(art_id).unlink(missing_ok=True)
    return {"art_id": art_id, "visibility": payload.visibility}
```

Cleanup hooks: grep `main.py` for every `display_file(` unlink call (art delete, file replace, account delete — the sites Track 3 added on main) and add `public_file(<same id>).unlink(missing_ok=True)` alongside each, so deleting/replacing a piece never strands a public derivative.

- [ ] **Step 4: Run tests** — `pytest tests/test_public_derivative.py tests/test_display.py -v` → PASS (test_display.py guards the neighboring helpers).

- [ ] **Step 5: Commit (with Charlie's go-ahead)** — `portfolio: public derivative pipeline + PATCH /art/{id}/visibility`

---

### Task 6: Public pages — `/p/{slug}` HTML + `/p/img/{art_id}` + preview links

**Files:**
- Create: `src/api/templates/portfolio_page.html`
- Modify: `src/api/main.py` (append to the portfolio block), `src/api/requirements.txt` (add `jinja2`)
- Test: `tests/test_public_portfolio_pages.py` (create)

**Interfaces:**
- Consumes: `db_public_portfolio_payload`, `db_public_art_file_path` (Task 3); `public_file`, `generate_public_image`, `abs_path` (Task 5); `JWT_SECRET` from `api.auth`.
- Produces: `GET /p/{slug}` (HTML, no auth), `GET /p/img/{art_id}` (JPEG, no auth), `GET /portfolio/preview-link` (member) → `{"url"}`; helpers `mint_preview_sig(slug, exp) -> str`, `check_preview_sig(slug, sig, exp) -> bool`.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_public_portfolio_pages.py
import time
import uuid
import pytest
from fastapi.testclient import TestClient
from api import main as main_mod
from api.main import app
from db.session import get_db
from tests.conftest import make_jpeg_bytes

PUB = {
    "slug": "jane", "title": "Jane Doe", "artist_name": "Jane Doe",
    "statement": "I paint.", "theme": {"bg": "#faf8f4", "accent": "#8a6d3b"},
    "blocks": [{"kind": "gallery", "config": {"layout": "grid"},
                "pieces": [{"id": str(uuid.uuid4()), "title": "Dunes", "date": None, "aspect_ratio": 1.5}]}],
}


@pytest.fixture
def pub_client(tmp_static, monkeypatch):
    async def fake_get_db():
        yield None
    async def fake_payload(db, slug, include_unpublished=False):
        return dict(PUB) if slug == "jane" or include_unpublished else None
    monkeypatch.setattr(main_mod, "db_public_portfolio_payload", fake_payload)
    app.dependency_overrides[get_db] = fake_get_db
    c = TestClient(app)
    try:
        yield c
    finally:
        app.dependency_overrides.clear()


def test_public_page_renders_without_auth(pub_client):
    r = pub_client.get("/p/jane")
    assert r.status_code == 200
    html = r.text
    assert "Jane Doe" in html and "Dunes" in html
    assert 'property="og:title"' in html
    # invisibility: the page must never mention the club
    assert "paint club" not in html.lower() and "paintingclub" not in html.lower()


def test_unknown_or_unpublished_404(pub_client):
    assert pub_client.get("/p/nobody").status_code == 404


def test_preview_sig_roundtrip():
    exp = int(time.time()) + 600
    sig = main_mod.mint_preview_sig("jane", exp)
    assert main_mod.check_preview_sig("jane", sig, exp)
    assert not main_mod.check_preview_sig("jane", sig, exp + 1)
    assert not main_mod.check_preview_sig("other", sig, exp)
    assert not main_mod.check_preview_sig("jane", sig, int(time.time()) - 10)


def test_public_img_gated_on_visibility(pub_client, tmp_static, monkeypatch):
    art_id = str(uuid.uuid4())
    src = tmp_static / "static" / "art" / "x.jpg"
    src.parent.mkdir(parents=True, exist_ok=True)
    src.write_bytes(make_jpeg_bytes(size=(2000, 1000)))

    async def fake_path(db, aid):
        return "/static/art/x.jpg" if aid == art_id else None
    monkeypatch.setattr(main_mod, "db_public_art_file_path", fake_path)
    r = pub_client.get(f"/p/img/{art_id}")
    assert r.status_code == 200 and r.headers["content-type"] == "image/jpeg"
    assert "public" in r.headers["cache-control"]
    assert pub_client.get(f"/p/img/{uuid.uuid4()}").status_code == 404
```

- [ ] **Step 2: Run to verify failure** — `pytest tests/test_public_portfolio_pages.py -v` → FAIL.

- [ ] **Step 3: Add `jinja2` to `src/api/requirements.txt`** (own line; rebuild note: the api container installs requirements at build — local `pip install jinja2` for tests).

- [ ] **Step 4: Create `src/api/templates/portfolio_page.html`**

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{ p.title }}</title>
<meta property="og:title" content="{{ p.title }}">
<meta property="og:type" content="website">
{% if og_image %}<meta property="og:image" content="{{ og_image }}">{% endif %}
{% if p.theme.get('noindex') %}<meta name="robots" content="noindex">{% endif %}
<style>
  :root {
    --bg: {{ p.theme.get('bg', '#ffffff') }};
    --text: {{ p.theme.get('text', '#1a1a1a') }};
    --accent: {{ p.theme.get('accent', '#8a6d3b') }};
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: var(--bg); color: var(--text);
    font-family: {{ "Georgia, 'Times New Roman', serif" if p.theme.get('font', 'serif') == 'serif' else "-apple-system, 'Helvetica Neue', Arial, sans-serif" }};
    line-height: 1.6;
  }
  .wrap { max-width: 1100px; margin: 0 auto; padding: 4rem 1.5rem; }
  header h1 { font-size: 2.2rem; font-weight: normal; letter-spacing: 0.02em; }
  header .rule { width: 3rem; border-bottom: 2px solid var(--accent); margin: 1.2rem 0 3rem; }
  .statement { max-width: 42rem; font-size: 1.05rem; margin: 0 0 3.5rem; white-space: pre-wrap; }
  .gallery { display: grid; gap: 1.5rem; margin-bottom: 3.5rem; }
  .gallery.grid { grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
  .gallery.single { grid-template-columns: 1fr; max-width: 48rem; }
  figure img {
    width: 100%; height: auto; display: block;
    {% if p.theme.get('frame', 'line') == 'line' %}border: 1px solid var(--text);{% endif %}
  }
  figcaption { font-size: 0.85rem; margin-top: 0.5rem; opacity: 0.75; }
  .spotlight { margin: 0 0 3.5rem; }
  .spotlight img { width: 100%; height: auto; display: block; }
  .spotlight figcaption { font-style: italic; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>{{ p.artist_name }}</h1>
    <div class="rule"></div>
  </header>
  {% for b in p.blocks %}
    {% if b.kind == 'statement' %}
      <p class="statement">{{ b.config.get('text') or p.statement or '' }}</p>
    {% elif b.kind == 'gallery' %}
      <div class="gallery {{ 'single' if b.config.get('layout') == 'single' else 'grid' }}">
        {% for piece in b.pieces %}
        <figure>
          <img src="/p/img/{{ piece.id }}" alt="{{ piece.title or '' }}" loading="lazy"
               {% if piece.aspect_ratio %}style="aspect-ratio: {{ piece.aspect_ratio }};"{% endif %}>
          {% if piece.title %}<figcaption>{{ piece.title }}{% if piece.date %}, {{ piece.date.year }}{% endif %}</figcaption>{% endif %}
        </figure>
        {% endfor %}
      </div>
    {% elif b.kind == 'spotlight' %}
      {% for piece in b.pieces[:1] %}
      <figure class="spotlight">
        <img src="/p/img/{{ piece.id }}" alt="{{ piece.title or '' }}">
        {% if b.config.get('caption') or piece.title %}<figcaption>{{ b.config.get('caption') or piece.title }}</figcaption>{% endif %}
      </figure>
      {% endfor %}
    {% endif %}
  {% endfor %}
</div>
</body>
</html>
```

- [ ] **Step 5: Append routes + helpers to `main.py` portfolio block**

Imports at top of file: `import hmac`, `import time as time_mod`, `from fastapi.responses import HTMLResponse`, `from fastapi.templating import Jinja2Templates`, and add `JWT_SECRET` to the existing `from api.auth import ...` line.

```python
_templates = Jinja2Templates(directory=str(Path(__file__).parent / "templates"))


def mint_preview_sig(slug: str, exp: int) -> str:
    return hmac.new(JWT_SECRET.encode(), f"{slug}:{exp}".encode(), "sha256").hexdigest()


def check_preview_sig(slug: str, sig: str, exp) -> bool:
    try:
        exp = int(exp)
    except (TypeError, ValueError):
        return False
    if exp < time_mod.time():
        return False
    return hmac.compare_digest(mint_preview_sig(slug, exp), sig or "")


@app.get("/portfolio/preview-link")
async def get_portfolio_preview_link(db: AsyncSession = Depends(get_db),
                                     current_user: Member = Depends(get_current_member)):
    p = await db_get_or_create_my_portfolio(db, current_user)
    exp = int(time_mod.time()) + 3600
    return {"url": f"{PUBLIC_SITE_ORIGIN}/p/{p.slug}?pv={mint_preview_sig(p.slug, exp)}&exp={exp}"}


@app.get("/p/{slug}", response_class=HTMLResponse)
async def public_portfolio_page(slug: str, request: Request, pv: str | None = None, exp: str | None = None,
                                db: AsyncSession = Depends(get_db)):
    """The public portfolio site. NO auth — but only published portfolios render
    (a valid preview signature admits the owner's unpublished draft). The page
    contains zero club references."""
    previewing = bool(pv) and check_preview_sig(slug, pv, exp)
    payload = await db_public_portfolio_payload(db, slug, include_unpublished=previewing)
    if payload is None:
        raise HTTPException(status_code=404, detail="Not found")
    first_piece = next((pc for b in payload["blocks"] for pc in b["pieces"]), None)
    og_image = f"{PUBLIC_SITE_ORIGIN}/p/img/{first_piece['id']}" if first_piece else None
    resp = _templates.TemplateResponse(request, "portfolio_page.html", {"p": payload, "og_image": og_image})
    resp.headers["Cache-Control"] = "no-store" if previewing else "public, max-age=300"
    return resp


@app.get("/p/img/{art_id}")
async def public_portfolio_image(art_id: str, db: AsyncSession = Depends(get_db)):
    """Public derivative ONLY — never original bytes. 404 unless the piece is
    visibility='public'; flipping a piece back to club 404s this immediately."""
    file_path = await db_public_art_file_path(db, art_id)
    if not file_path:
        raise HTTPException(status_code=404, detail="Not found")
    out = public_file(art_id)
    if not out.exists():
        src = abs_path(file_path)
        if not src.exists() or src.suffix.lower() == ".pdf" or generate_public_image(art_id, src) is None:
            raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(out, media_type="image/jpeg",
                        headers={"Cache-Control": "public, max-age=86400"})
```

(`Request` needs importing from `fastapi` — extend the existing first-line import.)

- [ ] **Step 6: Run tests** — `pytest tests/test_public_portfolio_pages.py -v`, then full `pytest tests/ -v` → PASS.

- [ ] **Step 7: Commit (with Charlie's go-ahead)** — `portfolio: public pages — SSR /p/{slug}, gated /p/img, preview links`

---

### Task 7: nginx — route `/p/`, lock `/static/public/`, robots.txt

**Files:**
- Modify: `src/nginx/nginx.conf.template` ONLY

**Interfaces:**
- Produces: public `/p/...` reaches the api unauthenticated; raw `/static/public/` blocked (the gated `/p/img/` route is the only way in); `/robots.txt` served.

- [ ] **Step 1: Add three location blocks**

Above the catch-all `location /static/` block:

```nginx
        # Public portfolio derivatives are served ONLY via the api's
        # visibility-gated /p/img/ route; block raw file access so flipping a
        # piece private is instant revocation.
        location /static/public/ {
            return 403;
        }
```

Above the `location /api/` block:

```nginx
        # Public portfolio pages + images (no auth — the api gates on
        # portfolio.published / art.visibility). Kept off /api/ so public URLs
        # carry no hint of the app behind them.
        location /p/ {
            proxy_pass http://backend/p/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        location = /robots.txt {
            default_type text/plain;
            # nginx does NOT unescape \n in return strings — the literal
            # multi-line quoted string below is the correct way to emit newlines.
            return 200 "User-agent: *
Disallow: /api/
Disallow: /static/
Allow: /p/
";
        }
```

- [ ] **Step 2: Verify config syntax**

Run: `docker run --rm -v /Users/polar1738/painting-club/src/nginx/nginx.conf.template:/etc/nginx/nginx.conf:ro -e STATIC_URL_SECRET=x nginx:alpine sh -c "envsubst '\$STATIC_URL_SECRET' < /etc/nginx/nginx.conf > /tmp/n.conf && nginx -t -c /tmp/n.conf"`
Expected: `syntax is ok` (upstream resolution warnings about `api`/`frontend` hosts are fine outside compose; if `nginx -t` hard-fails on them, verify via `docker compose up` instead).

- [ ] **Step 3: Commit (with Charlie's go-ahead)** — `portfolio: nginx — /p/ proxy, /static/public lockdown, robots.txt`. **Deploy note: this task requires `docker restart nginx` on the Pi.**

---

### Task 8: Webapp API layer — types + functions

**Files:**
- Modify: `src/ui/src/api.ts` (append at bottom, matching the parity-port convention)

**Interfaces:**
- Consumes: existing `request()` helper and `Visual2D` types in `api.ts`.
- Produces (exact names Tasks 9–11 import):

```typescript
export interface PortfolioBlock {
  id: string;
  kind: "statement" | "gallery" | "spotlight";
  position: number;
  config: Record<string, any>;
  piece_ids: string[];
}

export interface Portfolio {
  id: string;
  slug: string;
  title: string | null;
  published: boolean;
  theme: Record<string, any>;
  blocks: PortfolioBlock[];
  public_url: string;
}

export interface PortfolioPiece {
  id: string;
  title: string | null;
  file_path: string | null;
  visibility: "club" | "public";
  aspect_ratio: number | null;
}
```

- [ ] **Step 1: Append functions to `api.ts`**

```typescript
export const get_my_portfolio = (token: string) =>
  request("/portfolio/mine", { headers: { Authorization: `Bearer ${token}` } }) as Promise<Portfolio>;

export const update_my_portfolio = (
  token: string,
  payload: { slug?: string; title?: string; published?: boolean; theme?: Record<string, any> },
) =>
  request("/portfolio/mine", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  }) as Promise<Portfolio>;

export const add_portfolio_block = (token: string, kind: PortfolioBlock["kind"], position?: number) =>
  request("/portfolio/blocks", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ kind, position }),
  }) as Promise<Portfolio>;

export const update_portfolio_block = (
  token: string,
  blockId: string,
  payload: { config?: Record<string, any>; position?: number },
) =>
  request(`/portfolio/blocks/${blockId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  }) as Promise<Portfolio>;

export const delete_portfolio_block = (token: string, blockId: string) =>
  request(`/portfolio/blocks/${blockId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  }) as Promise<Portfolio>;

export const set_portfolio_block_pieces = (token: string, blockId: string, artIds: string[]) =>
  request(`/portfolio/blocks/${blockId}/pieces`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ art_ids: artIds }),
  }) as Promise<Portfolio>;

export const get_my_portfolio_pieces = (token: string) =>
  request("/portfolio/my-pieces", { headers: { Authorization: `Bearer ${token}` } }) as Promise<PortfolioPiece[]>;

export const set_art_visibility = (token: string, artId: string, visibility: "club" | "public") =>
  request(`/art/${artId}/visibility`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ visibility }),
  }) as Promise<{ art_id: string; visibility: string }>;

export const get_portfolio_preview_link = (token: string) =>
  request("/portfolio/preview-link", { headers: { Authorization: `Bearer ${token}` } }) as Promise<{ url: string }>;
```

- [ ] **Step 2: Verify** — `cd src/ui && npm run build` → success.

- [ ] **Step 3: Commit (with Charlie's go-ahead)** — `portfolio web: api functions + types`

---

### Task 9: Webapp editor — page shell, data load, pieces palette with visibility toggle

**Files:**
- Create: `src/ui/src/components/Pages/PortfolioEditor.tsx`, `src/ui/src/styles/portfolio-editor.css`
- Modify: `src/ui/src/App.tsx` (register `/portfolio-editor` ABOVE the `/:username` catch-all — order matters)

**Interfaces:**
- Consumes: all Task-8 exports; localStorage `token` (the app's existing auth pattern).
- Produces: `<PortfolioEditor/>` at `/portfolio-editor`; internal state contract used by Tasks 10–11: `portfolio: Portfolio | null`, `pieces: PortfolioPiece[]`, `reload(p?: Portfolio): void` (mutation responses replace `portfolio` directly — every editor API call returns the full `Portfolio`).

- [ ] **Step 1: Register the route in `App.tsx`**

Inside the `<Route element={<PageLayout />}>` group, above the `/:username` catch-all:

```tsx
<Route path="/portfolio-editor" element={<PortfolioEditor />} />
```

with the import `import PortfolioEditor from "./components/Pages/PortfolioEditor";`.

- [ ] **Step 2: Create the page (shell + palette)**

```tsx
// src/ui/src/components/Pages/PortfolioEditor.tsx
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Portfolio, PortfolioPiece,
  get_my_portfolio, get_my_portfolio_pieces, set_art_visibility,
} from "../../api";
import "../../styles/portfolio-editor.css";

export default function PortfolioEditor() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [pieces, setPieces] = useState<PortfolioPiece[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      navigate("/not-a-member");
      return;
    }
    get_my_portfolio(token).then(setPortfolio).catch(() => setError("could not load portfolio"));
    get_my_portfolio_pieces(token).then(setPieces).catch(() => {});
  }, [token, navigate]);

  const reload = useCallback((p?: Portfolio) => {
    if (p) setPortfolio(p);
    else if (token) get_my_portfolio(token).then(setPortfolio).catch(() => {});
  }, [token]);

  const toggleVisibility = async (piece: PortfolioPiece) => {
    if (!token) return;
    const next = piece.visibility === "public" ? "club" : "public";
    try {
      await set_art_visibility(token, piece.id, next);
      setPieces((ps) => ps.map((p) => (p.id === piece.id ? { ...p, visibility: next } : p)));
      reload();
    } catch {
      alert("could not change visibility");
    }
  };

  if (error) return <div className="pe-error">{error}</div>;
  if (!portfolio) return <div className="pe-loading">loading…</div>;

  return (
    <div className="pe-root">
      <aside className="pe-palette">
        <h3>your pieces</h3>
        <div className="pe-palette-grid">
          {pieces.map((piece) => (
            <div
              key={piece.id}
              className={`pe-piece ${piece.visibility === "public" ? "pe-piece-public" : ""}`}
              draggable
              onDragStart={(e) => e.dataTransfer.setData("text/art-id", piece.id)}
            >
              {piece.file_path && <img src={piece.file_path} alt={piece.title ?? ""} />}
              <button className="pe-vis-toggle" onClick={() => toggleVisibility(piece)}>
                {piece.visibility === "public" ? "public" : "club only"}
              </button>
            </div>
          ))}
        </div>
      </aside>
      <main className="pe-canvas">{/* Task 10: block stack */}</main>
      <aside className="pe-side">{/* Task 11: theme + publish */}</aside>
    </div>
  );
}
```

- [ ] **Step 3: Create `src/ui/src/styles/portfolio-editor.css`**

```css
.pe-root { display: grid; grid-template-columns: 260px 1fr 240px; gap: 1rem; padding: 1rem; }
.pe-palette, .pe-side { border: 1px solid black; padding: 0.75rem; overflow-y: auto; max-height: calc(100vh - 4rem); }
.pe-palette h3, .pe-side h3 { font-weight: normal; margin-bottom: 0.75rem; }
.pe-palette-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
.pe-piece { position: relative; cursor: grab; border: 1px solid #999; }
.pe-piece-public { border: 2px solid rgb(238, 190, 100); }
.pe-piece img { width: 100%; height: auto; display: block; }
.pe-vis-toggle { width: 100%; font-size: 0.7rem; border: none; border-top: 1px solid #999; background: white; cursor: pointer; padding: 2px; }
.pe-piece-public .pe-vis-toggle { background: rgb(238, 190, 100); }
.pe-canvas { min-height: 60vh; }
.pe-error, .pe-loading { padding: 2rem; }
```

- [ ] **Step 4: Verify** — `npm run build`, then browser: log in, visit `/portfolio-editor`, confirm the palette shows your pieces, the toggle flips gold/plain and persists on reload.

- [ ] **Step 5: Commit (with Charlie's go-ahead)** — `portfolio web: editor shell + pieces palette with visibility toggle`

---

### Task 10: Webapp editor — block stack with drag-reorder + gallery piece ordering

**Files:**
- Modify: `src/ui/src/components/Pages/PortfolioEditor.tsx` (fill the `pe-canvas` main), `src/ui/src/styles/portfolio-editor.css` (append)

**Interfaces:**
- Consumes: `add_portfolio_block`, `update_portfolio_block`, `delete_portfolio_block`, `set_portfolio_block_pieces` (Task 8); the `portfolio`/`pieces`/`reload` state (Task 9); palette drag payload `text/art-id`.
- Produces: interactive block stack. Drag semantics: drag a palette piece onto a gallery/spotlight block to append it; drag pieces within a block to reorder; drag a block's handle over another block to swap positions.

- [ ] **Step 1: Implement the block stack inside `PortfolioEditor`**

Replace the `pe-canvas` placeholder with:

```tsx
      <main className="pe-canvas">
        {portfolio.blocks.map((block) => (
          <div
            key={block.id}
            className="pe-block"
            onDragOver={(e) => e.preventDefault()}
            onDrop={async (e) => {
              e.preventDefault();
              if (!token) return;
              const artId = e.dataTransfer.getData("text/art-id");
              const fromBlock = e.dataTransfer.getData("text/block-id");
              if (artId && (block.kind === "gallery" || block.kind === "spotlight")) {
                if (block.piece_ids.includes(artId)) return;
                const piece = pieces.find((p) => p.id === artId);
                if (piece && piece.visibility !== "public") {
                  await set_art_visibility(token, artId, "public");
                  setPieces((ps) => ps.map((p) => (p.id === artId ? { ...p, visibility: "public" } : p)));
                }
                reload(await set_portfolio_block_pieces(token, block.id, [...block.piece_ids, artId]));
              } else if (fromBlock && fromBlock !== block.id) {
                const other = portfolio.blocks.find((b) => b.id === fromBlock);
                if (!other) return;
                await update_portfolio_block(token, fromBlock, { position: block.position });
                reload(await update_portfolio_block(token, block.id, { position: other.position }));
              }
            }}
          >
            <div className="pe-block-head">
              <span
                className="pe-block-handle"
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/block-id", block.id)}
              >⠿</span>
              <span className="pe-block-kind">{block.kind}</span>
              {block.kind === "gallery" && (
                <select
                  value={block.config.layout ?? "grid"}
                  onChange={async (e) =>
                    token && reload(await update_portfolio_block(token, block.id, {
                      config: { ...block.config, layout: e.target.value },
                    }))
                  }
                >
                  <option value="grid">grid</option>
                  <option value="single">single column</option>
                </select>
              )}
              {block.kind === "statement" && (
                <textarea
                  defaultValue={block.config.text ?? ""}
                  placeholder="artist statement (blank = your bio)"
                  onBlur={async (e) =>
                    token && reload(await update_portfolio_block(token, block.id, {
                      config: { ...block.config, text: e.target.value },
                    }))
                  }
                />
              )}
              <button
                className="pe-block-delete"
                onClick={async () => token && reload(await delete_portfolio_block(token, block.id))}
              >×</button>
            </div>
            {(block.kind === "gallery" || block.kind === "spotlight") && (
              <div className="pe-block-pieces">
                {block.piece_ids.map((pid, idx) => {
                  const piece = pieces.find((p) => p.id === pid);
                  return (
                    <div
                      key={pid}
                      className="pe-block-piece"
                      draggable
                      onDragStart={(e) => {
                        e.stopPropagation();
                        e.dataTransfer.setData("text/reorder", `${block.id}:${idx}`);
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={async (e) => {
                        e.stopPropagation();
                        const data = e.dataTransfer.getData("text/reorder");
                        if (!data || !token) return;
                        const [srcBlock, srcIdxStr] = data.split(":");
                        if (srcBlock !== block.id) return;
                        const ids = [...block.piece_ids];
                        const [moved] = ids.splice(Number(srcIdxStr), 1);
                        ids.splice(idx, 0, moved);
                        reload(await set_portfolio_block_pieces(token, block.id, ids));
                      }}
                    >
                      {piece?.file_path && <img src={piece.file_path} alt={piece?.title ?? ""} />}
                      <button
                        onClick={async () =>
                          token && reload(await set_portfolio_block_pieces(
                            token, block.id, block.piece_ids.filter((x) => x !== pid),
                          ))
                        }
                      >remove</button>
                    </div>
                  );
                })}
                {block.piece_ids.length === 0 && <div className="pe-block-empty">drop pieces here</div>}
              </div>
            )}
          </div>
        ))}
        <div className="pe-add-block">
          {(["gallery", "spotlight", "statement"] as const).map((kind) => (
            <button key={kind} onClick={async () => token && reload(await add_portfolio_block(token, kind))}>
              + {kind}
            </button>
          ))}
        </div>
      </main>
```

Add the new imports (`add_portfolio_block`, `update_portfolio_block`, `delete_portfolio_block`, `set_portfolio_block_pieces`) to the existing `../../api` import.

- [ ] **Step 2: Append styles**

```css
.pe-block { border: 1px solid black; margin-bottom: 1rem; padding: 0.5rem; }
.pe-block-head { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; }
.pe-block-handle { cursor: grab; user-select: none; }
.pe-block-kind { font-size: 0.85rem; }
.pe-block-head textarea { flex: 1; min-height: 3rem; font: inherit; }
.pe-block-delete { margin-left: auto; border: 1px solid black; background: white; cursor: pointer; }
.pe-block-pieces { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.pe-block-piece { width: 110px; border: 1px solid #999; }
.pe-block-piece img { width: 100%; height: auto; display: block; }
.pe-block-piece button { width: 100%; font-size: 0.7rem; border: none; border-top: 1px solid #999; background: white; cursor: pointer; }
.pe-block-empty { padding: 1.5rem; opacity: 0.5; font-size: 0.85rem; }
.pe-add-block { display: flex; gap: 0.5rem; }
.pe-add-block button { border: 1px solid black; background: white; padding: 0.35rem 0.75rem; cursor: pointer; }
```

- [ ] **Step 3: Verify** — `npm run build`; browser: add a gallery block, drag two palette pieces in (a club-only piece flips public automatically), reorder them by drag, add a second block and swap block order via the ⠿ handle, delete a block. Reload the page: everything persisted.

- [ ] **Step 4: Commit (with Charlie's go-ahead)** — `portfolio web: block stack — add/delete, drag-reorder blocks and pieces, per-block config`

---

### Task 11: Webapp editor — theme panel, slug/title, publish, preview, share URL + profile entry point

**Files:**
- Modify: `src/ui/src/components/Pages/PortfolioEditor.tsx` (fill `pe-side`), `src/ui/src/styles/portfolio-editor.css` (append), `src/ui/src/components/UserProfile/UserInfo.tsx` (owner-only entry link)

**Interfaces:**
- Consumes: `update_my_portfolio`, `get_portfolio_preview_link` (Task 8). Theme keys the template understands (Task 6): `bg`, `text`, `accent` (hex strings), `font` (`'serif'|'sans'`), `frame` (`'line'|'none'`), `noindex` (bool).

- [ ] **Step 1: Implement the side panel**

Replace the `pe-side` placeholder with:

```tsx
      <aside className="pe-side">
        <h3>site</h3>
        <label className="pe-field">
          address
          <input
            defaultValue={portfolio.slug}
            onBlur={async (e) => {
              if (!token || e.target.value === portfolio.slug) return;
              try {
                reload(await update_my_portfolio(token, { slug: e.target.value }));
              } catch {
                alert("that address is taken or invalid");
                e.target.value = portfolio.slug;
              }
            }}
          />
        </label>
        <label className="pe-field">
          title
          <input
            defaultValue={portfolio.title ?? ""}
            onBlur={async (e) => token && reload(await update_my_portfolio(token, { title: e.target.value }))}
          />
        </label>
        {(["bg", "text", "accent"] as const).map((key) => (
          <label className="pe-field pe-color" key={key}>
            {key === "bg" ? "background" : key}
            <input
              type="color"
              value={portfolio.theme[key] ?? { bg: "#ffffff", text: "#1a1a1a", accent: "#8a6d3b" }[key]}
              onChange={async (e) =>
                token && reload(await update_my_portfolio(token, {
                  theme: { ...portfolio.theme, [key]: e.target.value },
                }))
              }
            />
          </label>
        ))}
        <label className="pe-field">
          type
          <select
            value={portfolio.theme.font ?? "serif"}
            onChange={async (e) =>
              token && reload(await update_my_portfolio(token, { theme: { ...portfolio.theme, font: e.target.value } }))
            }
          >
            <option value="serif">serif</option>
            <option value="sans">sans</option>
          </select>
        </label>
        <label className="pe-field">
          frames
          <select
            value={portfolio.theme.frame ?? "line"}
            onChange={async (e) =>
              token && reload(await update_my_portfolio(token, { theme: { ...portfolio.theme, frame: e.target.value } }))
            }
          >
            <option value="line">line</option>
            <option value="none">none</option>
          </select>
        </label>
        <div className="pe-actions">
          <button
            onClick={async () => {
              if (!token) return;
              const { url } = await get_portfolio_preview_link(token);
              window.open(url, "_blank");
            }}
          >preview</button>
          <button
            className={portfolio.published ? "pe-live" : ""}
            onClick={async () =>
              token && reload(await update_my_portfolio(token, { published: !portfolio.published }))
            }
          >{portfolio.published ? "unpublish" : "publish"}</button>
        </div>
        {portfolio.published && (
          <button
            className="pe-copy"
            onClick={() => navigator.clipboard.writeText(portfolio.public_url)}
          >{portfolio.public_url.replace(/^https?:\/\//, "")}</button>
        )}
      </aside>
```

Extend the `../../api` import with `update_my_portfolio, get_portfolio_preview_link`.

- [ ] **Step 2: Append styles**

```css
.pe-field { display: block; font-size: 0.85rem; margin-bottom: 0.75rem; }
.pe-field input, .pe-field select { width: 100%; font: inherit; border: 1px solid black; padding: 0.25rem; margin-top: 0.2rem; }
.pe-color input { height: 2rem; padding: 0; }
.pe-actions { display: flex; gap: 0.5rem; margin: 1rem 0 0.75rem; }
.pe-actions button { flex: 1; border: 1px solid black; background: white; padding: 0.4rem; cursor: pointer; }
.pe-actions .pe-live { background: rgb(238, 190, 100); }
.pe-copy { width: 100%; border: 1px dashed black; background: white; padding: 0.35rem; cursor: pointer; font-size: 0.8rem; overflow-wrap: anywhere; }
```

- [ ] **Step 3: Entry point** — in `src/ui/src/components/UserProfile/UserInfo.tsx`, inside the owner-only controls (`is_owner` conditional), add a link/button navigating to `/portfolio-editor` labeled `portfolio`. Match whichever control style is adjacent on main (plain bordered button).

- [ ] **Step 4: Verify** — `npm run build`; browser: change colors → open preview (unpublished draft renders via `?pv=` link); publish → open `/p/{slug}` in a private window (no auth) and confirm it renders; unpublish → private window now 404s; copy-URL button puts the address on the clipboard.

- [ ] **Step 5: Commit (with Charlie's go-ahead)** — `portfolio web: theme panel, publish/preview/share, profile entry`

---

### Task 12: iOS share touchpoint (coordinate first — shared working tree)

**⚠️ Do not start this task without confirming no parallel session is editing `ios-v1/`** (project memory: shared tree, shared EAS channel). This task is deliberately minimal and skippable for V1 — the web copy-URL button already makes portfolios shareable.

**Files:**
- Modify: `ios-v1/src/api/index.ts` (one function), `ios-v1/src/api/client.ts` (`getPortfolioUrl`), `ios-v1/src/screens/Portfolio.tsx` (share affordance)

**Interfaces:**
- Consumes: `GET /portfolio/mine` (Task 4) — returns `public_url` + `published`.

- [ ] **Step 1:** Add to `ios-v1/src/api/index.ts` (mirroring neighboring functions' style):

```typescript
export type MyPortfolio = { slug: string; published: boolean; public_url: string };

export async function getMyPortfolio(token: string): Promise<MyPortfolio> {
  return apiFetch("/portfolio/mine", { token });
}
```

(Match the actual transport helper name used by adjacent functions in that file — the module's local `request`/fetch wrapper — rather than inventing one.)

- [ ] **Step 2:** In `ios-v1/src/screens/Portfolio.tsx`, where the share sheet currently shares `getPortfolioUrl()` (the broken member-gated web URL): fetch `getMyPortfolio` on mount; when `published`, share `public_url` instead; when not published, hide the share button. Leave `getPortfolioUrl()` itself untouched (other call sites keep club-internal behavior).

- [ ] **Step 3:** Verify — `cd ios-v1 && npx tsc --noEmit` (clean except the 2 known Home.tsx Reanimated errors). On-device/sim check per the isolated-rig memory if a parallel session is active. **No OTA without Charlie's explicit go-ahead** (shared EAS channel).

- [ ] **Step 4: Commit (with Charlie's go-ahead)** — `portfolio ios: share the public site URL when published`

---

### Task 13: End-to-end smoke vs throwaway postgres + browser checklist

**Files:**
- Create: `scripts/smoke_portfolio.py`

**Interfaces:**
- Consumes: the full API from Tasks 2–6, run locally against a scratch DB (repo practice for real-DB verification — same rig as the inspiration-web 39-check smoke).

- [ ] **Step 1: Write `scripts/smoke_portfolio.py`**

A sequential httpx script (mirror `scripts/seed_inspiration_web.py`'s structure: `--base` arg, admin+member credentials or a bootstrap user) asserting, in order:

```python
"""Portfolio V1 smoke — run against a THROWAWAY stack, never prod.
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
"""
```

Implement each check as a plain function using `httpx` with `assert` + printed check numbers, matching the seed script's error-handling style.

- [ ] **Step 2: Run the rig**

```bash
docker run --rm -d --name pc-smoke-pg -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=pc -p 5544:5432 postgres:16
PG_USER=postgres PG_PASSWORD=pw PG_NAME=pc PG_HOST=localhost PG_PORT=5544 \
  JWT_SECRET=smokesecret STATIC_ROOT=/tmp/pc-smoke uvicorn api.main:app --port 8011
python scripts/smoke_portfolio.py --base http://localhost:8011
docker rm -f pc-smoke-pg
```

Expected: 16/16 PASS (check 14 skipped when not behind nginx). Restart uvicorn once mid-run to confirm the 026 guards are idempotent.

- [ ] **Step 3: Manual browser checklist** (against the local docker compose stack)

1. Editor loads at `/portfolio-editor`; palette, blocks, theme all function (Tasks 9–11 verifications).
2. `/p/{slug}` in a private window: renders, images load, no club references in view-source, `robots.txt` serves.
3. Phone-width devtools: the public page is readable and the grid collapses to one column.

- [ ] **Step 4: Commit (with Charlie's go-ahead)** — `portfolio: end-to-end smoke script`

---

## Deploy order (when Charlie says go)

1. Merge to `main`, `git pull` on the Pi (api hot-reloads; 026 guards run at startup), **`docker restart nginx`** (Task 7 blocks need it).
2. Smoke against the Pi: `GET /p/anything` → 404; `GET /static/public/x.jpg` → 403; `GET /api/members` unauthenticated → 401.
3. Web frontend hot-reloads with the pull (Vite dev server bind mount).
4. iOS Task 12 OTA last, only after the API is live, with Charlie's explicit go-ahead.

## Explicitly deferred (V2+ — do not build now)

- `private` visibility tier (needs every club listing filtered); written/audio pieces on portfolios; C2PA signing + invisible watermark of public derivatives; visible-watermark toggle; Cloudflare fronting + AI-crawler blocking (infra, not repo); custom domains (Caddy on-demand TLS — schema is additive: `portfolio.custom_domain` later); multiple templates; per-block backgrounds; hero block kind; static publish pipeline.
