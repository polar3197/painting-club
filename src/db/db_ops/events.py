from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, exists

from db.models import Event, EventHost, EventInvite, Member


# --- helpers -----------------------------------------------------------------

async def _resolve_usernames(db: AsyncSession, usernames: list[str]) -> list[Member]:
    """Resolve usernames to members; raises on any unknown name so a typo in an
    invite list fails loudly instead of silently dropping one person."""
    wanted = [u.strip() for u in usernames if u and u.strip()]
    if not wanted:
        return []
    result = await db.execute(select(Member).filter(Member.username.in_(wanted)))
    members = result.scalars().all()
    found = {m.username for m in members}
    missing = [u for u in wanted if u not in found]
    if missing:
        raise ValueError(f"Unknown member(s): {', '.join(missing)}")
    return members


async def db_get_event(db: AsyncSession, event_id) -> Event:
    event = (
        await db.execute(select(Event).filter(Event.id == event_id))
    ).scalar_one_or_none()
    if event is None:
        raise ValueError("Event not found")
    return event


async def db_event_host_ids(db: AsyncSession, event_id) -> set:
    result = await db.execute(
        select(EventHost.member_id).filter(EventHost.event_id == event_id)
    )
    return {row[0] for row in result.all()}


async def db_is_event_host(db: AsyncSession, event: Event, member_id) -> bool:
    """Creator counts as a host for every permission check."""
    if event.creator_id == member_id:
        return True
    return member_id in await db_event_host_ids(db, event.id)


async def db_can_view_event(db: AsyncSession, event: Event, member_id) -> bool:
    """Visibility rule: public, or viewer is creator / host / invited."""
    if event.is_public or event.creator_id == member_id:
        return True
    if member_id in await db_event_host_ids(db, event.id):
        return True
    invited = (
        await db.execute(
            select(EventInvite.member_id).filter(
                EventInvite.event_id == event.id,
                EventInvite.member_id == member_id,
            )
        )
    ).scalar_one_or_none()
    return invited is not None


# --- core ops ----------------------------------------------------------------

async def db_create_event(
    db: AsyncSession,
    creator_id,
    title: str,
    description: str | None,
    event_date,
    event_time,
    is_public: bool,
    host_usernames: list[str] | None = None,
) -> Event:
    event = Event(
        creator_id=creator_id,
        title=title,
        description=description,
        event_date=event_date,
        event_time=event_time,
        is_public=is_public,
    )
    db.add(event)
    await db.flush()  # event.id needed for the host rows
    # The creator always hosts their own event; extra hosts are optional.
    db.add(EventHost(event_id=event.id, member_id=creator_id))
    for m in await _resolve_usernames(db, host_usernames or []):
        if m.id != creator_id:
            db.add(EventHost(event_id=event.id, member_id=m.id))
    await db.commit()
    await db.refresh(event)
    return event


async def db_update_event(db: AsyncSession, event: Event, fields: dict) -> Event:
    """Apply the provided fields (already validated by the route's schema)."""
    for key, value in fields.items():
        setattr(event, key, value)
    await db.commit()
    await db.refresh(event)
    return event


async def db_delete_event(db: AsyncSession, event: Event) -> None:
    # host/invite rows go with it via DB-level ON DELETE CASCADE
    await db.delete(event)
    await db.commit()


async def db_add_event_members(
    db: AsyncSession, event_id, usernames: list[str], as_hosts: bool
) -> None:
    """Add hosts or invitees by username. Idempotent per member."""
    model = EventHost if as_hosts else EventInvite
    existing = {
        row[0]
        for row in (
            await db.execute(select(model.member_id).filter(model.event_id == event_id))
        ).all()
    }
    for m in await _resolve_usernames(db, usernames):
        if m.id not in existing:
            db.add(model(event_id=event_id, member_id=m.id))
    await db.commit()


async def db_remove_event_member(
    db: AsyncSession, event_id, username: str, as_host: bool
) -> None:
    model = EventHost if as_host else EventInvite
    members = await _resolve_usernames(db, [username])
    if not members:
        return
    row = await db.get(model, (event_id, members[0].id))
    if row is not None:
        await db.delete(row)
        await db.commit()


async def db_list_visible_events(db: AsyncSession, member_id):
    """Every event the viewer may see: public + created + hosting + invited.
    Soonest event first (date, then time; undated-time events sort first within
    their day)."""
    hosted = exists().where(
        EventHost.event_id == Event.id, EventHost.member_id == member_id
    )
    invited = exists().where(
        EventInvite.event_id == Event.id, EventInvite.member_id == member_id
    )
    result = await db.execute(
        select(Event)
        .filter(or_(Event.is_public, Event.creator_id == member_id, hosted, invited))
        .order_by(Event.event_date, Event.event_time)
    )
    return result.scalars().all()


async def db_event_participants(db: AsyncSession, event_id) -> tuple[list[str], list[str]]:
    """(host_usernames, invited_usernames) for serialization."""
    hosts = (
        await db.execute(
            select(Member.username)
            .join(EventHost, EventHost.member_id == Member.id)
            .filter(EventHost.event_id == event_id)
            .order_by(Member.username)
        )
    ).scalars().all()
    invited = (
        await db.execute(
            select(Member.username)
            .join(EventInvite, EventInvite.member_id == Member.id)
            .filter(EventInvite.event_id == event_id)
            .order_by(Member.username)
        )
    ).scalars().all()
    return list(hosts), list(invited)
