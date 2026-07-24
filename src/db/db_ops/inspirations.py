"""Inspiration web (#10): directed "inspired by" edges between club pieces,
plus a club-shared catalog of external (outside-the-club) pieces to cite.

Graph ops return plain dicts in the client's frozen node/edge shape
(ios-v1/src/api/inspiration.ts): art nodes carry creator username, medium
name, file_path, aspect_ratio and artKind; external nodes carry artist,
title and image_path (the route turns that into the gated image URL).
The whole web is club-scale (hundreds of edges at most), so graph traversal
loads all edges once and BFSes in Python rather than doing recursive SQL.
"""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, or_

from db.models import Art, ExternalArt, Inspiration, Media, Member, Visual2D

# art.type discriminator → the client's artKind (decides node rendering).
_ART_KIND = {"visual_2d": "visual", "written_form": "written", "audio": "audio"}


def _edge_out(e: Inspiration) -> dict:
    return {
        "id": str(e.id),
        "from": str(e.from_art_id),
        "to": str(e.to_art_id or e.to_external_id),
    }


async def _fetch_nodes(db: AsyncSession, ids: set, viewer_id) -> list[dict]:
    """Resolve a mixed set of node ids (club art and/or external art) into
    client node dicts. Ids that match neither table are silently dropped —
    an edge can outlive a piece only within a single request's race window."""
    if not ids:
        return []
    nodes: list[dict] = []
    visual = Visual2D.__table__
    art_rows = await db.execute(
        select(
            Art.id,
            Art.title,
            Art.type,
            Art.file_path,
            Media.name.label("medium"),
            Member.username.label("creator"),
            Art.creator_id,
            visual.c.aspect_ratio,
        )
        .join(Media, Media.id == Art.media_id)
        .join(Member, Member.id == Art.creator_id)
        .outerjoin(visual, visual.c.id == Art.id)
        .filter(Art.id.in_(ids))
    )
    for r in art_rows.all():
        nodes.append({
            "kind": "art",
            "id": str(r.id),
            "title": r.title,
            "creator": r.creator,
            "medium": r.medium,
            "file_path": r.file_path,
            "aspect_ratio": r.aspect_ratio,
            "mine": r.creator_id == viewer_id,
            "artKind": _ART_KIND.get(r.type, "visual"),
        })
    found = {n["id"] for n in nodes}
    ext_ids = {i for i in ids if str(i) not in found}
    if ext_ids:
        ext_rows = await db.execute(select(ExternalArt).filter(ExternalArt.id.in_(ext_ids)))
        for x in ext_rows.scalars().all():
            nodes.append({
                "kind": "external",
                "id": str(x.id),
                "artist": x.artist,
                "title": x.title,
                "image_path": x.image_path,
            })
    return nodes


async def db_get_web(db: AsyncSession, art_id: str, depth: int, viewer_id) -> dict:
    """Neighborhood subgraph `depth` hops in both directions from a focus
    piece. The focus node is ALWAYS included, even with zero edges — the
    client relies on that to render an unconnected piece's empty web."""
    focus = (
        await db.execute(select(Art.id).filter(Art.id == art_id))
    ).scalar_one_or_none()
    if focus is None:
        raise ValueError("Art not found")

    edges = (await db.execute(select(Inspiration))).scalars().all()
    keep = {str(art_id)}
    frontier = keep.copy()
    for _ in range(max(0, depth)):
        nxt = set()
        for e in edges:
            a, b = str(e.from_art_id), str(e.to_art_id or e.to_external_id)
            if a in frontier and b not in keep:
                keep.add(b)
                nxt.add(b)
            if b in frontier and a not in keep:
                keep.add(a)
                nxt.add(a)
        frontier = nxt
        if not frontier:
            break
    return {
        "focusId": str(art_id),
        "nodes": await _fetch_nodes(db, keep, viewer_id),
        "edges": [
            _edge_out(e) for e in edges
            if str(e.from_art_id) in keep and str(e.to_art_id or e.to_external_id) in keep
        ],
    }


async def db_get_full_web(db: AsyncSession, viewer_id) -> dict:
    """The entire web: every node touched by at least one edge (singletons
    excluded by construction), across all disconnected clusters."""
    edges = (await db.execute(select(Inspiration))).scalars().all()
    connected: set = set()
    for e in edges:
        connected.add(str(e.from_art_id))
        connected.add(str(e.to_art_id or e.to_external_id))
    return {
        "focusId": "",
        "nodes": await _fetch_nodes(db, connected, viewer_id),
        "edges": [_edge_out(e) for e in edges],
    }


async def db_add_inspiration(
    db: AsyncSession,
    viewer_id,
    from_art_id: str,
    to_art_id: str | None,
    to_external_id: str | None,
    to_node_id: str | None = None,
) -> dict:
    """Add an edge from the viewer's own piece to its inspiration. Idempotent:
    an existing identical edge is returned, not an error. `to_node_id` is the
    untyped target — resolved here to whichever table it lives in."""
    if to_node_id is not None:
        if to_art_id is not None or to_external_id is not None:
            raise ValueError("Provide either to_node_id or an explicit target, not both")
        try:
            uuid.UUID(str(to_node_id))
        except ValueError:
            raise ValueError("Target not found")
        is_art = (
            await db.execute(select(Art.id).filter(Art.id == to_node_id))
        ).scalar_one_or_none()
        if is_art is not None:
            to_art_id = to_node_id
        else:
            to_external_id = to_node_id
    if (to_art_id is None) == (to_external_id is None):
        raise ValueError("Exactly one of to_art_id / to_external_id is required")
    if to_art_id is not None and str(to_art_id) == str(from_art_id):
        raise ValueError("A piece cannot inspire itself")

    from_art = (
        await db.execute(select(Art.creator_id).filter(Art.id == from_art_id))
    ).scalar_one_or_none()
    if from_art is None:
        raise ValueError("Art not found")
    if from_art != viewer_id:
        raise PermissionError("You can only add inspirations to your own pieces")

    if to_art_id is not None:
        target = (
            await db.execute(select(Art.id).filter(Art.id == to_art_id))
        ).scalar_one_or_none()
    else:
        target = (
            await db.execute(select(ExternalArt.id).filter(ExternalArt.id == to_external_id))
        ).scalar_one_or_none()
    if target is None:
        raise ValueError("Target not found")

    target_filter = (
        Inspiration.to_art_id == to_art_id
        if to_art_id is not None
        else Inspiration.to_external_id == to_external_id
    )
    existing = (
        await db.execute(
            select(Inspiration).filter(Inspiration.from_art_id == from_art_id, target_filter)
        )
    ).scalars().first()
    if existing is not None:
        return _edge_out(existing)

    edge = Inspiration(
        from_art_id=from_art_id,
        to_art_id=to_art_id,
        to_external_id=to_external_id,
        created_by=viewer_id,
    )
    db.add(edge)
    await db.commit()
    await db.refresh(edge)
    return _edge_out(edge)


async def db_remove_inspiration(db: AsyncSession, viewer_id, inspiration_id: str, moderator: bool = False) -> None:
    """Remove an edge. Only the owner of the inspired (`from`) piece may —
    `moderator` (contributor) overrides for cleanup."""
    edge = (
        await db.execute(select(Inspiration).filter(Inspiration.id == inspiration_id))
    ).scalars().first()
    if edge is None:
        raise ValueError("Inspiration not found")
    if not moderator:
        owner = (
            await db.execute(select(Art.creator_id).filter(Art.id == edge.from_art_id))
        ).scalar_one_or_none()
        if owner != viewer_id:
            raise PermissionError("You can only remove inspirations from your own pieces")
    await db.delete(edge)
    await db.commit()


async def db_search_targets(db: AsyncSession, q: str, viewer_id, limit: int = 12) -> list[dict]:
    """The connect pane's combined search: club art across ALL mediums (the
    Art base table covers visual/written/audio uniformly) + the external
    catalog. Empty query → a recent sample of each."""
    q = (q or "").strip()
    visual = Visual2D.__table__
    art_query = (
        select(
            Art.id,
            Art.title,
            Art.type,
            Art.file_path,
            Media.name.label("medium"),
            Member.username.label("creator"),
            Art.creator_id,
            visual.c.aspect_ratio,
        )
        .join(Media, Media.id == Art.media_id)
        .join(Member, Member.id == Art.creator_id)
        .outerjoin(visual, visual.c.id == Art.id)
    )
    ext_query = select(ExternalArt)
    if q:
        like = f"%{q}%"
        art_query = art_query.filter(
            or_(Art.title.ilike(like), Member.username.ilike(like), Media.name.ilike(like))
        )
        ext_query = ext_query.filter(
            or_(ExternalArt.artist.ilike(like), ExternalArt.title.ilike(like))
        )
    art_rows = (
        await db.execute(art_query.order_by(desc(Art.created_at)).limit(limit))
    ).all()
    ext_rows = (
        await db.execute(ext_query.order_by(desc(ExternalArt.created_at)).limit(limit))
    ).scalars().all()

    nodes: list[dict] = [
        {
            "kind": "art",
            "id": str(r.id),
            "title": r.title,
            "creator": r.creator,
            "medium": r.medium,
            "file_path": r.file_path,
            "aspect_ratio": r.aspect_ratio,
            "mine": r.creator_id == viewer_id,
            "artKind": _ART_KIND.get(r.type, "visual"),
        }
        for r in art_rows
    ]
    nodes.extend(
        {
            "kind": "external",
            "id": str(x.id),
            "artist": x.artist,
            "title": x.title,
            "image_path": x.image_path,
        }
        for x in ext_rows
    )
    return nodes[:limit] if not q else nodes


async def db_create_external_art(
    db: AsyncSession, ext_id, artist: str, title: str | None, image_path: str, creator_id
) -> dict:
    """Insert a catalog row for an already-saved image (the route writes the
    file first so image_path is known — it's NOT NULL by design)."""
    row = ExternalArt(id=ext_id, artist=artist, title=title, image_path=image_path, created_by=creator_id)
    db.add(row)
    await db.commit()
    return {
        "kind": "external",
        "id": str(row.id),
        "artist": row.artist,
        "title": row.title,
        "image_path": row.image_path,
    }


async def db_get_external_art(db: AsyncSession, ext_id: str) -> ExternalArt | None:
    return (
        await db.execute(select(ExternalArt).filter(ExternalArt.id == ext_id))
    ).scalars().first()
