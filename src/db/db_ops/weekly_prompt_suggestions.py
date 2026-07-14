from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from db.models import Member, Media, WeeklyPromptSuggestion


async def db_create_suggestion(
    db: AsyncSession,
    member_id,
    prompt_text: str,
    media_id=None,
):
    """Create a proposed weekly-prompt suggestion. media_id NULL = medium
    agnostic. Returns (suggestion, media_name | None)."""
    text_clean = (prompt_text or "").strip()
    if not text_clean:
        raise ValueError("Prompt text cannot be empty")

    media_name = None
    if media_id is not None:
        media = (
            await db.execute(select(Media).filter(Media.id == media_id))
        ).scalar_one_or_none()
        if media is None:
            raise ValueError("Medium not found")
        media_name = media.name

    suggestion = WeeklyPromptSuggestion(
        member_id=member_id,
        media_id=media_id,
        prompt_text=text_clean,
    )
    db.add(suggestion)
    await db.commit()
    await db.refresh(suggestion)
    return suggestion, media_name


async def db_list_suggestions_admin(db: AsyncSession):
    """Admin queue view: (proposed, up_next) as lists of
    (suggestion, media_name | None, username) rows. proposed is newest-first;
    up_next is the approved queue in order_index order (nulls last, oldest
    first as a tiebreak so legacy rows keep a stable position)."""
    base = (
        select(WeeklyPromptSuggestion, Media.name, Member.username)
        .outerjoin(Media, Media.id == WeeklyPromptSuggestion.media_id)
        .join(Member, Member.id == WeeklyPromptSuggestion.member_id)
    )
    proposed = (
        await db.execute(
            base.filter(WeeklyPromptSuggestion.status == "proposed")
            .order_by(WeeklyPromptSuggestion.created_at.desc())
        )
    ).all()
    up_next = (
        await db.execute(
            base.filter(WeeklyPromptSuggestion.status == "approved")
            .order_by(
                WeeklyPromptSuggestion.order_index.asc().nulls_last(),
                WeeklyPromptSuggestion.created_at.asc(),
            )
        )
    ).all()
    return proposed, up_next


async def db_review_suggestion(db: AsyncSession, suggestion_id, status: str):
    """Approve (→ append to the up-next queue) or reject a suggestion.
    Returns (suggestion, media_name | None, username)."""
    if status not in ("approved", "rejected"):
        raise ValueError("status must be 'approved' or 'rejected'")

    suggestion = (
        await db.execute(
            select(WeeklyPromptSuggestion).filter(WeeklyPromptSuggestion.id == suggestion_id)
        )
    ).scalar_one_or_none()
    if suggestion is None:
        raise ValueError("Suggestion not found")

    if status == "approved":
        max_index = (
            await db.execute(
                select(func.max(WeeklyPromptSuggestion.order_index)).filter(
                    WeeklyPromptSuggestion.status == "approved"
                )
            )
        ).scalar_one()
        suggestion.order_index = (max_index + 1) if max_index is not None else 0
    else:
        suggestion.order_index = None
    suggestion.status = status
    await db.commit()
    await db.refresh(suggestion)

    media_name = None
    if suggestion.media_id is not None:
        media_name = (
            await db.execute(select(Media.name).filter(Media.id == suggestion.media_id))
        ).scalar_one_or_none()
    username = (
        await db.execute(select(Member.username).filter(Member.id == suggestion.member_id))
    ).scalar_one_or_none()
    return suggestion, media_name, username


async def db_reorder_suggestions(db: AsyncSession, suggestion_ids: list[str]) -> None:
    """Persist a new up-next order: the full list of APPROVED suggestion ids in
    the desired order. Mirrors db_set_series_order's contract."""
    rows = (
        await db.execute(
            select(WeeklyPromptSuggestion).filter(WeeklyPromptSuggestion.status == "approved")
        )
    ).scalars().all()
    by_id = {str(s.id): s for s in rows}

    if set(suggestion_ids) != set(by_id.keys()):
        raise ValueError("suggestion_ids must be exactly the approved suggestions")

    for position, sid in enumerate(suggestion_ids):
        by_id[sid].order_index = position
    await db.commit()
