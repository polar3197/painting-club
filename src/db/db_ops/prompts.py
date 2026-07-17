from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update
from datetime import datetime

from db.models import Member, Media, Art, Visual2D, WeeklyPrompt


async def db_get_active_prompt(db: AsyncSession):
    """Return (WeeklyPrompt, media_name, submission_count) for the active prompt,
    or None when no prompt is active. submission_count counts art rows whose
    collection_id matches the prompt id."""
    row = (
        await db.execute(
            select(WeeklyPrompt, Media.name)
            .outerjoin(Media, Media.id == WeeklyPrompt.media_id)
            .filter(WeeklyPrompt.is_active.is_(True))
            .limit(1)
        )
    ).first()
    if row is None:
        return None
    prompt, media_name = row
    count = (
        await db.execute(
            select(func.count()).select_from(Art).filter(Art.collection_id == prompt.id)
        )
    ).scalar_one()
    return prompt, media_name, count


async def db_list_prompts(db: AsyncSession):
    """All weekly prompts (active + archived), newest first by creation date."""
    rows = (
        await db.execute(
            select(WeeklyPrompt, Media.name)
            .outerjoin(Media, Media.id == WeeklyPrompt.media_id)
            .order_by(WeeklyPrompt.created_at.desc())
        )
    ).all()
    return rows


async def db_get_prompt(db: AsyncSession, prompt_id):
    row = (
        await db.execute(
            select(WeeklyPrompt, Media.name)
            .outerjoin(Media, Media.id == WeeklyPrompt.media_id)
            .filter(WeeklyPrompt.id == prompt_id)
        )
    ).first()
    if row is None:
        return None
    return row


async def db_list_prompt_submissions(db: AsyncSession, prompt_id):
    """Returns a list of dicts shaped for the ArtResult Pydantic model. Only
    Visual2D for now — written-form submissions can be added when prompts target
    that subtype."""
    rows = (
        await db.execute(
            select(
                Visual2D,
                Media.name.label("medium_name"),
                Member.username,
                Member.city,
            )
            .join(Media, Media.id == Visual2D.media_id)
            .join(Member, Member.id == Visual2D.creator_id)
            .filter(Visual2D.collection_id == prompt_id)
            .order_by(Visual2D.created_at.desc())
        )
    ).all()
    submissions = []
    for art, medium_name, username, city in rows:
        submissions.append({
            "id": str(art.id),
            "title": art.title,
            "medium": medium_name,
            "keywords": [],
            "song": art.song,
            "file_path": art.file_path,
            "date": art.date.isoformat() if art.date else None,
            "location": art.location,
            "creator_username": username,
            "creator_city": city,
            "aspect_ratio": float(art.aspect_ratio) if art.aspect_ratio is not None else None,
        })
    return submissions


async def db_get_user_submission(db: AsyncSession, prompt_id, member_id):
    """Return the art id (or None) of this member's submission to this prompt."""
    row = (
        await db.execute(
            select(Art.id).filter(
                Art.collection_id == prompt_id,
                Art.creator_id == member_id,
            )
        )
    ).scalar_one_or_none()
    return row


async def db_create_prompt(
    db: AsyncSession,
    title: str,
    short_summary: str | None,
    media_id,
    activate: bool = False,
) -> WeeklyPrompt:
    if activate:
        # Deactivate the current active prompt in the same txn so the partial
        # unique index doesn't fire.
        await db.execute(
            update(WeeklyPrompt)
            .where(WeeklyPrompt.is_active.is_(True))
            .values(is_active=False, archived_at=datetime.utcnow())
        )
    prompt = WeeklyPrompt(
        title=title.strip(),
        short_summary=(short_summary or None),
        media_id=media_id,
        is_active=activate,
        # Only stamped when it goes live now; a drafted prompt gets its
        # activated_at when someone actually activates it.
        activated_at=datetime.utcnow() if activate else None,
    )
    db.add(prompt)
    await db.flush()
    await db.commit()
    await db.refresh(prompt)
    return prompt


async def db_activate_prompt(db: AsyncSession, prompt_id) -> WeeklyPrompt:
    await db.execute(
        update(WeeklyPrompt)
        .where(WeeklyPrompt.is_active.is_(True), WeeklyPrompt.id != prompt_id)
        .values(is_active=False, archived_at=datetime.utcnow())
    )
    prompt = (
        await db.execute(select(WeeklyPrompt).filter(WeeklyPrompt.id == prompt_id))
    ).scalar_one_or_none()
    if prompt is None:
        raise ValueError("Prompt not found")
    prompt.is_active = True
    # Restamp on every activation: the week runs from when it went live, so a
    # re-run of an old prompt starts a fresh 7 days rather than reading as expired.
    prompt.activated_at = datetime.utcnow()
    prompt.archived_at = None
    await db.commit()
    await db.refresh(prompt)
    return prompt


async def db_archive_prompt(db: AsyncSession, prompt_id) -> WeeklyPrompt:
    prompt = (
        await db.execute(select(WeeklyPrompt).filter(WeeklyPrompt.id == prompt_id))
    ).scalar_one_or_none()
    if prompt is None:
        raise ValueError("Prompt not found")
    prompt.is_active = False
    prompt.archived_at = datetime.utcnow()
    await db.commit()
    return prompt


async def db_validate_submission_medium(db: AsyncSession, prompt_id, medium: str) -> bool:
    """Return True when the medium is acceptable for the prompt. A medium-agnostic
    prompt (media_id NULL) accepts any real medium; a medium-specific prompt
    accepts only its own."""
    media_id = (
        await db.execute(select(Media.id).filter(Media.name == medium))
    ).scalar_one_or_none()
    if media_id is None:
        return False
    prompt = (
        await db.execute(select(WeeklyPrompt).filter(WeeklyPrompt.id == prompt_id))
    ).scalar_one_or_none()
    if prompt is None:
        return False
    # Agnostic prompt: any real medium is fine.
    if prompt.media_id is None:
        return True
    return str(prompt.media_id) == str(media_id)
