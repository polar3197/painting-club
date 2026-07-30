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
        ok = {str(row[0]) for row in (await db.execute(
            select(Art.id).filter(
                Art.id.in_(art_ids), Art.creator_id == member_id,
                Art.type == "visual_2d", Art.visibility == "public",
            )
        )).all()}
        bad = [str(a) for a in art_ids if str(a) not in ok]
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
        select(Art.id, Art.title, Art.file_path, Visual2D.aspect_ratio, Art.visibility)
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
        "id": str(p.id), "published": p.published,
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
    if visibility == "public" and art.file_path and art.file_path.lower().endswith(".pdf"):
        raise ValueError("pdf pieces cannot be made public")
    art.visibility = visibility
    await db.commit()
    return art.file_path
