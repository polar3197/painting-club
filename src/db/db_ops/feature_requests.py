from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func, case

from db.models import Member, FeatureRequest, FeatureRequestVote


async def db_create_feature_request(db: AsyncSession, member_id, title: str) -> FeatureRequest:
    row = FeatureRequest(member_id=member_id, title=title)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def db_list_feature_requests(db: AsyncSession, viewer_id):
    """All requests with vote tallies and the viewer's own vote.

    Returns rows of (FeatureRequest, username, up, down, my_vote) ordered by
    net score then recency. my_vote is +1/-1/None.
    """
    up_count = func.count(case((FeatureRequestVote.value == 1, 1)))
    down_count = func.count(case((FeatureRequestVote.value == -1, 1)))
    my_vote = func.max(case((FeatureRequestVote.member_id == viewer_id, FeatureRequestVote.value)))
    result = await db.execute(
        select(FeatureRequest, Member.username, up_count, down_count, my_vote)
        .join(Member, Member.id == FeatureRequest.member_id)
        .outerjoin(FeatureRequestVote, FeatureRequestVote.request_id == FeatureRequest.id)
        .group_by(FeatureRequest.id, Member.username)
        .order_by(desc(up_count - down_count), desc(FeatureRequest.created_at))
    )
    return result.all()


async def _db_get_vote_tally(db: AsyncSession, request_id, viewer_id):
    up_count = func.count(case((FeatureRequestVote.value == 1, 1)))
    down_count = func.count(case((FeatureRequestVote.value == -1, 1)))
    my_vote = func.max(case((FeatureRequestVote.member_id == viewer_id, FeatureRequestVote.value)))
    result = await db.execute(
        select(up_count, down_count, my_vote).filter(FeatureRequestVote.request_id == request_id)
    )
    return result.one()


async def db_vote_feature_request(db: AsyncSession, request_id, member_id, value: int):
    """Apply a vote and return the fresh (up, down, my_vote) tally.

    Same-direction re-vote retracts; opposite direction switches.
    """
    if value not in (1, -1):
        raise ValueError("value must be 1 or -1")

    req = (
        await db.execute(select(FeatureRequest).filter(FeatureRequest.id == request_id))
    ).scalar_one_or_none()
    if req is None:
        raise ValueError("Feature request not found")

    existing = (
        await db.execute(
            select(FeatureRequestVote).filter(
                FeatureRequestVote.request_id == request_id,
                FeatureRequestVote.member_id == member_id,
            )
        )
    ).scalar_one_or_none()

    if existing is None:
        db.add(FeatureRequestVote(request_id=request_id, member_id=member_id, value=value))
    elif existing.value == value:
        await db.delete(existing)
    else:
        existing.value = value
    await db.commit()

    return await _db_get_vote_tally(db, request_id, member_id)


async def db_delete_feature_request(db: AsyncSession, request_id, member_id, is_admin: bool):
    row = (
        await db.execute(select(FeatureRequest).filter(FeatureRequest.id == request_id))
    ).scalar_one_or_none()
    if row is None:
        raise ValueError("Feature request not found")
    if not is_admin and row.member_id != member_id:
        raise PermissionError("Only the requester or an admin can delete this")
    await db.delete(row)  # votes cascade via FK
    await db.commit()
