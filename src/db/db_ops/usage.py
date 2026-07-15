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


# Two events from the same member more than this far apart start a new "visit"
# (app-use session). 30 min is the usual web-analytics session window.
SESSION_GAP = timedelta(minutes=30)


async def db_usage_summary(db: AsyncSession, days: int = 14) -> dict:
    """Contributor "user stats": per-day VISITS (app-use sessions) + active
    members, who's active today, and the most-trafficked screens. Rolls up on
    server receive time (created_at) so device clock skew can't smear buckets.

    Logins were dropped as a metric — with sliding sessions members rarely
    re-auth, so logins undercount real use. A "visit" instead = a burst of any
    activity: we walk each member's events in time order and start a new session
    whenever the gap exceeds SESSION_GAP. This is derived from data already
    collected (no client change) and dedupes a sitting's many events into one."""
    days = max(1, min(days, 90))
    since = datetime.utcnow() - timedelta(days=days)
    day = cast(UsageEvent.created_at, Date)

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

    # Visits per day, by sessionizing each member's event stream on gaps.
    ev_rows = (
        await db.execute(
            select(UsageEvent.member_id, UsageEvent.created_at)
            .filter(UsageEvent.created_at >= since)
            .order_by(UsageEvent.member_id, UsageEvent.created_at)
        )
    ).all()
    visits_by_day: dict = {}
    total_visits = 0
    prev_member = None
    prev_time = None
    for member_id, created_at in ev_rows:
        if member_id != prev_member or prev_time is None or (created_at - prev_time) > SESSION_GAP:
            d = created_at.date()
            visits_by_day[d] = visits_by_day.get(d, 0) + 1
            total_visits += 1
        prev_member = member_id
        prev_time = created_at
    visits_per_day = [{"date": d.isoformat(), "count": c} for d, c in sorted(visits_by_day.items())]

    # Who was active today (distinct members with any event today).
    today = datetime.utcnow().date()
    active_today_rows = (
        await db.execute(
            select(Member.username, Member.firstname)
            .join(UsageEvent, UsageEvent.member_id == Member.id)
            .filter(cast(UsageEvent.created_at, Date) == today)
            .distinct()
            .order_by(Member.username)
        )
    ).all()

    total_events = (
        await db.execute(select(func.count()).select_from(UsageEvent).filter(UsageEvent.created_at >= since))
    ).scalar_one()

    return {
        "days": days,
        "total_visits": total_visits,
        "total_events": int(total_events or 0),
        "visits_per_day": visits_per_day,
        "active_per_day": [{"date": d.isoformat(), "count": int(n)} for d, n in active_rows],
        "active_today": [{"username": u, "firstname": f} for u, f in active_today_rows],
        "top_screens": [{"screen": s, "count": int(n)} for s, n in screen_rows],
    }
