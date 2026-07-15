"""Device/perf telemetry (#6) — ingest + contributor rollups (#7).

Separate from usage.py by design: crashes / memory pressure / perf samples are a
different shape and a different reader ("infra stats"). Owned by Stream B.
"""
from datetime import datetime, timedelta

from sqlalchemy import select, func, cast, Date
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import DeviceEvent

VALID_KINDS = {"crash", "memory_warning", "perf"}


def _clip(s, n):
    if s is None:
        return None
    s = str(s).strip()
    return s[:n] if s else None


async def db_record_device_events(db: AsyncSession, member_id, events) -> int:
    """Persist a batch of device events. `events` are DeviceEventIn-shaped.
    Unknown kinds are dropped. Returns rows written."""
    written = 0
    for e in events:
        kind = (e.kind or "").strip()
        if kind not in VALID_KINDS:
            continue
        db.add(
            DeviceEvent(
                member_id=member_id,
                kind=kind,
                platform=_clip(e.platform, 20),
                app_version=_clip(e.app_version, 40),
                os_version=_clip(e.os_version, 40),
                device_model=_clip(e.device_model, 80),
                detail=(e.detail or None),
                occurred_at=e.at or datetime.utcnow(),
            )
        )
        written += 1
    if written:
        await db.commit()
    return written


async def db_telemetry_summary(db: AsyncSession, days: int = 14) -> dict:
    """Contributor "infra stats": counts by kind, app-version spread, and the
    most recent crashes/warnings. Rolls up on server receive time."""
    days = max(1, min(days, 90))
    since = datetime.utcnow() - timedelta(days=days)

    # Counts per kind.
    kind_rows = (
        await db.execute(
            select(DeviceEvent.kind, func.count().label("n"))
            .filter(DeviceEvent.created_at >= since)
            .group_by(DeviceEvent.kind)
            .order_by(func.count().desc())
        )
    ).all()

    # App-version spread.
    version_rows = (
        await db.execute(
            select(DeviceEvent.app_version, func.count().label("n"))
            .filter(DeviceEvent.created_at >= since, DeviceEvent.app_version.isnot(None))
            .group_by(DeviceEvent.app_version)
            .order_by(func.count().desc())
            .limit(20)
        )
    ).all()

    # Crashes per day.
    day = cast(DeviceEvent.created_at, Date)
    crash_rows = (
        await db.execute(
            select(day.label("d"), func.count().label("n"))
            .filter(DeviceEvent.created_at >= since, DeviceEvent.kind == "crash")
            .group_by(day)
            .order_by(day)
        )
    ).all()

    # Most recent crashes/warnings for a quick triage list.
    recent_rows = (
        await db.execute(
            select(DeviceEvent)
            .filter(DeviceEvent.created_at >= since, DeviceEvent.kind.in_(["crash", "memory_warning"]))
            .order_by(DeviceEvent.occurred_at.desc())
            .limit(30)
        )
    ).scalars().all()

    return {
        "days": days,
        "counts_by_kind": [{"kind": k, "count": int(n)} for k, n in kind_rows],
        "app_versions": [{"version": v, "count": int(n)} for v, n in version_rows],
        "crashes_per_day": [{"date": d.isoformat(), "count": int(n)} for d, n in crash_rows],
        "recent": [
            {
                "kind": r.kind,
                "platform": r.platform,
                "app_version": r.app_version,
                "os_version": r.os_version,
                "device_model": r.device_model,
                "detail": r.detail,
                "occurred_at": (r.occurred_at.isoformat() if r.occurred_at else None),
            }
            for r in recent_rows
        ],
    }
