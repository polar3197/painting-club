from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from db.models import Art, Bookmark, Media, Member, Series, Visual2D


async def db_add_bookmark(db: AsyncSession, member_id, art_id) -> None:
    """Bookmark a piece for a member. Idempotent — re-bookmarking is a no-op."""
    art_exists = (
        await db.execute(select(Art.id).filter(Art.id == art_id))
    ).scalar_one_or_none()
    if art_exists is None:
        raise ValueError("Art not found")
    existing = await db.get(Bookmark, (member_id, art_id))
    if existing is not None:
        return
    db.add(Bookmark(member_id=member_id, art_id=art_id))
    await db.commit()


async def db_remove_bookmark(db: AsyncSession, member_id, art_id) -> None:
    """Remove a bookmark. Idempotent — removing a non-bookmark is a no-op."""
    existing = await db.get(Bookmark, (member_id, art_id))
    if existing is None:
        return
    await db.delete(existing)
    await db.commit()


async def db_list_bookmarks(db: AsyncSession, member_id):
    """The member's bookmarked pieces, newest-bookmarked first. Returns rows of
    (art fields..., medium name, creator username, bookmarked_at, aspect_ratio).
    aspect_ratio comes from the visual_2d subtype via LEFT JOIN — NULL for
    written/audio pieces, which is what clients already expect."""
    visual = Visual2D.__table__
    result = await db.execute(
        select(
            Art.id,
            Art.title,
            Art.type,
            Art.file_path,
            Art.date,
            Media.name.label("medium"),
            Member.username.label("creator_username"),
            Bookmark.created_at.label("bookmarked_at"),
            visual.c.aspect_ratio,
            # series_id groups saved pieces into their collection/album on the
            # client; series_name labels it. NULL for standalone pieces.
            Art.series_id,
            Series.name.label("series_name"),
        )
        .select_from(Bookmark)
        .join(Art, Art.id == Bookmark.art_id)
        .join(Media, Media.id == Art.media_id)
        .join(Member, Member.id == Art.creator_id)
        .outerjoin(visual, visual.c.id == Art.id)
        .outerjoin(Series, Series.id == Art.series_id)
        .filter(Bookmark.member_id == member_id)
        .order_by(desc(Bookmark.created_at))
    )
    return result.all()


async def db_bookmarked_art_ids(db: AsyncSession, member_id) -> set:
    """The set of art ids this member has bookmarked — lets piece serializers
    flag `bookmarked` for the viewer without N per-piece queries."""
    result = await db.execute(
        select(Bookmark.art_id).filter(Bookmark.member_id == member_id)
    )
    return {row[0] for row in result.all()}
