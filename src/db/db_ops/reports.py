from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from db.models import Member, Report, Art, Comment


VALID_STATUSES = {"resolved", "dismissed"}
VALID_TARGETS = {"art", "comment"}
PREVIEW_LEN = 80


async def db_create_report(
    db: AsyncSession,
    reporter_id,
    target_type: str,
    target_id,
    reason: str | None,
) -> Report:
    if target_type not in VALID_TARGETS:
        raise ValueError(f"target_type must be one of {sorted(VALID_TARGETS)}")
    row = Report(
        reporter_id=reporter_id,
        target_type=target_type,
        target_id=target_id,
        reason=reason,
        status="pending",
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def db_list_reports(db: AsyncSession):
    """Returns list of (report, reporter_username, target_preview) tuples.
    target_preview is the art title or comment text snippet, or None if the
    target row no longer exists."""
    rows = (
        await db.execute(
            select(Report, Member.username)
            .join(Member, Member.id == Report.reporter_id)
            .order_by(desc(Report.created_at))
        )
    ).all()

    out = []
    for report, reporter_username in rows:
        preview: str | None = None
        if report.target_type == "art":
            title = (
                await db.execute(select(Art.title).filter(Art.id == report.target_id))
            ).scalar_one_or_none()
            preview = title
        elif report.target_type == "comment":
            text = (
                await db.execute(select(Comment.text).filter(Comment.id == report.target_id))
            ).scalar_one_or_none()
            if text is not None:
                preview = text[:PREVIEW_LEN] + ("…" if len(text) > PREVIEW_LEN else "")
        out.append((report, reporter_username, preview))
    return out


async def db_resolve_report(db: AsyncSession, report_id, status: str) -> Report:
    if status not in VALID_STATUSES:
        raise ValueError(f"status must be one of {sorted(VALID_STATUSES)}")
    row = (
        await db.execute(select(Report).filter(Report.id == report_id))
    ).scalar_one_or_none()
    if row is None:
        raise ValueError("Report not found")
    row.status = status
    await db.commit()
    await db.refresh(row)
    return row
