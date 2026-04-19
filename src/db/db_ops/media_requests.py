from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from db.models import Member, MediaRequest
from db.db_ops.media import db_create_media


VALID_TYPES = {"visual_2d", "written_word"}


async def db_create_media_request(db: AsyncSession, member_id: str, name: str) -> MediaRequest:
    row = MediaRequest(member_id=member_id, requested_name=name, status="pending")
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def db_list_media_requests(db: AsyncSession):
    result = await db.execute(
        select(MediaRequest, Member.username)
        .join(Member, Member.id == MediaRequest.member_id)
        .order_by(desc(MediaRequest.created_at))
    )
    return result.all()


async def db_resolve_media_request(
    db: AsyncSession,
    request_id: str,
    status: str,
    type_: str | None = None,
):
    if status not in {"approved", "rejected"}:
        raise ValueError("status must be 'approved' or 'rejected'")

    row = (
        await db.execute(select(MediaRequest).filter(MediaRequest.id == request_id))
    ).scalar_one_or_none()
    if row is None:
        raise ValueError("Media request not found")

    if status == "approved":
        if type_ not in VALID_TYPES:
            raise ValueError(f"type must be one of {sorted(VALID_TYPES)}")
        # Create the media row with the approved type. db_create_media is idempotent:
        # if the medium name already exists it returns the existing row and stamps its
        # type if it was NULL.
        await db_create_media(db, row.requested_name, type_=type_)
        row.resolved_type = type_

    row.status = status
    await db.commit()
    await db.refresh(row)
    return row
