from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from db.models import Comment, Member, Art, Media
from db.db_ops.blocks import db_is_blocked


async def db_get_comments(db: AsyncSession, art_id: str):
    result = await db.execute(
        select(Comment, Member.username, Member.firstname)
        .join(Member, Comment.member_id == Member.id)
        .filter(Comment.art_id == art_id)
        .order_by(Comment.created_at)
    )
    return result.all()


async def db_add_comment(db: AsyncSession, art_id: str, member_id, text: str) -> Comment:
    # Asymmetric block: if the art's owner has blocked this commenter, deny.
    owner_id = (
        await db.execute(select(Art.creator_id).filter(Art.id == art_id))
    ).scalar_one_or_none()
    if owner_id is None:
        raise ValueError("Art not found")
    if await db_is_blocked(db, blocker_id=owner_id, blockee_id=member_id):
        raise PermissionError("can't comment here")

    comment = Comment(art_id=art_id, member_id=member_id, text=text)
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    return comment


async def db_get_comments_received(
    db: AsyncSession,
    viewer_id: str,
    cursor: datetime | None,
    limit: int,
):
    """Comments left by OTHER members on art owned by viewer, newest first.
    Returns up to `limit` rows; pass the last row's created_at back as `cursor`
    on subsequent calls to page through older comments.
    """
    q = (
        select(
            Comment,
            Member.username,
            Member.firstname,
            Art.title,
            Media.name,
        )
        .join(Art, Comment.art_id == Art.id)
        .join(Member, Comment.member_id == Member.id)
        .join(Media, Art.media_id == Media.id)
        .filter(Art.creator_id == viewer_id)
        .filter(Comment.member_id != viewer_id)
        .order_by(desc(Comment.created_at))
        .limit(limit)
    )
    if cursor is not None:
        q = q.filter(Comment.created_at < cursor)
    result = await db.execute(q)
    return result.all()


async def db_touch_comments_viewed(db: AsyncSession, member: Member) -> datetime | None:
    """Bump member.comments_last_viewed_at to now() and return the PREVIOUS value.
    Caller uses the previous value as the unseen-threshold to render rows."""
    prev = member.comments_last_viewed_at
    member.comments_last_viewed_at = datetime.utcnow()
    await db.commit()
    return prev


async def db_delete_comment(db: AsyncSession, comment_id: str, member_id: str) -> str:
    """Delete a comment if it belongs to member_id.

    Returns 'ok', 'not_found', or 'forbidden'.
    """
    result = await db.execute(select(Comment).filter(Comment.id == comment_id))
    comment = result.scalar_one_or_none()
    if comment is None:
        return 'not_found'
    if str(comment.member_id) != str(member_id):
        return 'forbidden'
    await db.delete(comment)
    await db.commit()
    return 'ok'
