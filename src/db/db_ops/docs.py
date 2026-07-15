from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from db.models import Doc


async def db_list_docs(db: AsyncSession):
    """All docs, ordered for the About hub (order_index, then slug)."""
    return (
        await db.execute(select(Doc).order_by(Doc.order_index, Doc.slug))
    ).scalars().all()


async def db_get_doc(db: AsyncSession, slug: str) -> Doc | None:
    return (
        await db.execute(select(Doc).filter(Doc.slug == slug))
    ).scalar_one_or_none()


async def db_update_doc(
    db: AsyncSession, slug: str, title: str, body: str
) -> Doc | None:
    """Edit an existing doc's title/body. Returns None if the slug is unknown
    (docs are seeded, not created on the fly)."""
    doc = await db_get_doc(db, slug)
    if doc is None:
        return None
    doc.title = title.strip()
    doc.body = body
    await db.commit()
    await db.refresh(doc)
    return doc
