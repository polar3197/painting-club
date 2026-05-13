from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from db.models import Member, MediaRequest
from db.db_ops.media import db_create_media


VALID_TYPES = {"visual_2d", "written_form"}


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
    name_override: str | None = None,
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
        # Admin may rename the requested medium before approval. `requested_name` on
        # the request row stays as the original user ask (audit trail); the Media row
        # is created with whatever the admin chose.
        from db.models import Media
        final_name = (name_override or row.requested_name).strip()
        if not final_name:
            raise ValueError("name cannot be empty")
        if name_override and name_override.strip() != row.requested_name:
            # Collision check only on a true rename — if the admin left the name as-is
            # we fall through to db_create_media's idempotent path.
            existing = (
                await db.execute(select(Media).filter(Media.name == final_name))
            ).scalar_one_or_none()
            if existing:
                raise ValueError(f"A medium named '{final_name}' already exists")
        await db_create_media(db, final_name, type_=type_)
        row.resolved_type = type_

    row.status = status
    await db.commit()
    await db.refresh(row)
    return row
