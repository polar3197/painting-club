from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from db.models import Comment, Member


async def db_get_comments(db: AsyncSession, art_id: str):
    result = await db.execute(
        select(Comment, Member.username, Member.firstname)
        .join(Member, Comment.member_id == Member.id)
        .filter(Comment.art_id == art_id)
        .order_by(Comment.created_at)
    )
    return result.all()


async def db_add_comment(db: AsyncSession, art_id: str, member_id: str, text: str) -> Comment:
    comment = Comment(art_id=art_id, member_id=member_id, text=text)
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    return comment


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
