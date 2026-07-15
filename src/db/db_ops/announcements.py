from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func

from db.models import Member, Announcement, AnnouncementComment


async def db_create_announcement(
    db: AsyncSession, author_id, title: str, body: str
) -> Announcement:
    row = Announcement(author_id=author_id, title=title.strip(), body=body.strip())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def db_list_announcements(db: AsyncSession):
    """Newest-first list of (announcement, author_username, author_firstname,
    comment_count). Author fields are None if the author's account was removed."""
    comment_counts = (
        select(
            AnnouncementComment.announcement_id.label("aid"),
            func.count().label("cnt"),
        )
        .group_by(AnnouncementComment.announcement_id)
        .subquery()
    )
    rows = (
        await db.execute(
            select(
                Announcement,
                Member.username,
                Member.firstname,
                func.coalesce(comment_counts.c.cnt, 0),
            )
            .outerjoin(Member, Member.id == Announcement.author_id)
            .outerjoin(comment_counts, comment_counts.c.aid == Announcement.id)
            .order_by(desc(Announcement.created_at))
        )
    ).all()
    return rows


async def db_get_announcement(db: AsyncSession, announcement_id):
    """Returns (announcement, author_username, author_firstname) or None."""
    return (
        await db.execute(
            select(Announcement, Member.username, Member.firstname)
            .outerjoin(Member, Member.id == Announcement.author_id)
            .filter(Announcement.id == announcement_id)
        )
    ).first()


async def db_delete_announcement(db: AsyncSession, announcement_id) -> bool:
    row = (
        await db.execute(select(Announcement).filter(Announcement.id == announcement_id))
    ).scalar_one_or_none()
    if row is None:
        return False
    await db.delete(row)  # ON DELETE CASCADE clears the discussion
    await db.commit()
    return True


async def db_list_comments(db: AsyncSession, announcement_id):
    """Oldest-first list of (comment, username, firstname) for one announcement."""
    return (
        await db.execute(
            select(AnnouncementComment, Member.username, Member.firstname)
            .join(Member, Member.id == AnnouncementComment.member_id)
            .filter(AnnouncementComment.announcement_id == announcement_id)
            .order_by(AnnouncementComment.created_at)
        )
    ).all()


async def db_add_comment(
    db: AsyncSession, announcement_id, member_id, text: str
) -> AnnouncementComment:
    row = AnnouncementComment(
        announcement_id=announcement_id, member_id=member_id, text=text.strip()
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def db_get_comment(db: AsyncSession, comment_id) -> AnnouncementComment | None:
    return (
        await db.execute(
            select(AnnouncementComment).filter(AnnouncementComment.id == comment_id)
        )
    ).scalar_one_or_none()


async def db_delete_comment(db: AsyncSession, comment_id) -> bool:
    row = await db_get_comment(db, comment_id)
    if row is None:
        return False
    await db.delete(row)
    await db.commit()
    return True
