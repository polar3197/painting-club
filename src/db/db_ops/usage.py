"""Behavioral usage trail (#5) — ingest + contributor rollups (#7).

Owned by Stream B. Do not share this file with Stream A.
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, func, cast, Date
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import UsageEvent, Member

VALID_KINDS = {"login", "screen"}


def naive_utc(dt):
    """Client `at` timestamps arrive offset-AWARE (ISO 'Z' from
    Date.toISOString()); the DateTime columns are naive, and asyncpg rejects the
    mismatch ("can't subtract offset-naive and offset-aware"). Normalize to
    naive UTC — or now() if the client didn't send one."""
    if dt is None:
        return datetime.utcnow()
    if getattr(dt, "tzinfo", None) is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


async def db_record_usage(db: AsyncSession, member_id, events) -> int:
    """Persist a batch of usage events. `events` are UsageEventIn-shaped
    (kind, screen?, at?). Unknown kinds are dropped so a bad client can't
    write junk. Returns the number of rows written."""
    written = 0
    for e in events:
        kind = (e.kind or "").strip()
        if kind not in VALID_KINDS:
            continue
        screen = (e.screen or None)
        if screen:
            screen = screen.strip()[:120]
        db.add(
            UsageEvent(
                member_id=member_id,
                kind=kind,
                screen=screen if kind == "screen" else None,
                occurred_at=naive_utc(e.at),
            )
        )
        written += 1
    if written:
        await db.commit()
    return written


async def db_usage_summary(db: AsyncSession, days: int = 14) -> dict:
    """Contributor "user stats": per-day logins + active users, plus the most-
    trafficked screens over the window. Rolls up on server receive time
    (created_at) so device clock skew can't smear the buckets."""
    days = max(1, min(days, 90))
    since = datetime.utcnow() - timedelta(days=days)
    day = cast(UsageEvent.created_at, Date)

    # Logins per day.
    logins_rows = (
        await db.execute(
            select(day.label("d"), func.count().label("n"))
            .filter(UsageEvent.created_at >= since, UsageEvent.kind == "login")
            .group_by(day)
            .order_by(day)
        )
    ).all()

    # Distinct active members per day (any event kind).
    active_rows = (
        await db.execute(
            select(day.label("d"), func.count(func.distinct(UsageEvent.member_id)).label("n"))
            .filter(UsageEvent.created_at >= since)
            .group_by(day)
            .order_by(day)
        )
    ).all()

    # Most-visited screens.
    screen_rows = (
        await db.execute(
            select(UsageEvent.screen, func.count().label("n"))
            .filter(
                UsageEvent.created_at >= since,
                UsageEvent.kind == "screen",
                UsageEvent.screen.isnot(None),
            )
            .group_by(UsageEvent.screen)
            .order_by(func.count().desc())
            .limit(20)
        )
    ).all()

    total_logins = sum(int(n) for _, n in logins_rows)
    total_events = (
        await db.execute(select(func.count()).select_from(UsageEvent).filter(UsageEvent.created_at >= since))
    ).scalar_one()

    return {
        "days": days,
        "total_logins": total_logins,
        "total_events": int(total_events or 0),
        "logins_per_day": [{"date": d.isoformat(), "count": int(n)} for d, n in logins_rows],
        "active_per_day": [{"date": d.isoformat(), "count": int(n)} for d, n in active_rows],
        "top_screens": [{"screen": s, "count": int(n)} for s, n in screen_rows],
    }
