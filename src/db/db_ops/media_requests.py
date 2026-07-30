from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from db.models import Member, MediaRequest
from db.db_ops.media import db_create_media


VALID_TYPES = {"visual_2d", "written_form", "audio"}
VALID_WRITTEN_FORMATS = {"short", "long"}


async def db_create_media_request(
    db: AsyncSession,
    member_id: str,
    name: str,
    requested_type: str | None = None,
    requested_format: str | None = None,
) -> MediaRequest:
    if requested_type is not None and requested_type not in VALID_TYPES:
        raise ValueError(f"type must be one of {sorted(VALID_TYPES)}")
    if requested_format is not None and requested_format not in VALID_WRITTEN_FORMATS:
        raise ValueError(f"format must be one of {sorted(VALID_WRITTEN_FORMATS)}")
    # The short/long split only exists for written media — drop the format
    # rather than erroring if a client sends it alongside another type.
    if requested_type != "written_form":
        requested_format = None
    row = MediaRequest(
        member_id=member_id,
        requested_name=name,
        requested_type=requested_type,
        requested_format=requested_format,
        status="pending",
    )
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
    format_override: str | None = None,
):
    if status not in {"approved", "rejected"}:
        raise ValueError("status must be 'approved' or 'rejected'")
    if format_override is not None and format_override not in VALID_WRITTEN_FORMATS:
        raise ValueError(f"format must be one of {sorted(VALID_WRITTEN_FORMATS)}")

    row = (
        await db.execute(select(MediaRequest).filter(MediaRequest.id == request_id))
    ).scalar_one_or_none()
    if row is None:
        raise ValueError("Media request not found")

    if status == "approved":
        # The requester picks the type at submission; the admin approval just
        # confirms it. Fall back to the requester's choice when the admin didn't
        # send an explicit override (which the current admin UI never does).
        type_ = type_ or row.requested_type
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
        # The requester's short/long pick rides through to the medium; on
        # legacy type-less requests the admin supplies it instead. Only
        # meaningful on written media (NULL otherwise).
        written_format = (
            (format_override or row.requested_format)
            if type_ == "written_form"
            else None
        )
        await db_create_media(db, final_name, type_=type_, written_format=written_format)
        row.resolved_type = type_

    row.status = status
    await db.commit()
    await db.refresh(row)
    return row
