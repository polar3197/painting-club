from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from db.models import Comment, Member


async def db_get_comments(db: AsyncSession, art_id: str):
    result = await db.execute(
        select(Comment, Member.firstname)
        .join(Member, Comment.username == Member.username)
        .filter(Comment.art_id == art_id)
        .order_by(Comment.created_at)
    )
    return result.all()


async def db_add_comment(db: AsyncSession, art_id: str, username: str, text: str) -> Comment:
    comment = Comment(art_id=art_id, username=username, text=text)
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    return comment
