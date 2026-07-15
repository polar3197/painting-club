import uuid

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from db.models import Doc

VALID_SECTIONS = {"ethos", "art", "aims"}


async def db_list_docs(db: AsyncSession):
    """All docs, ordered for the About hub (section, order_index, slug)."""
    return (
        await db.execute(select(Doc).order_by(Doc.section, Doc.order_index, Doc.slug))
    ).scalars().all()


async def db_list_docs_by_section(db: AsyncSession, section: str):
    """Docs within one About section, in display order."""
    return (
        await db.execute(
            select(Doc)
            .filter(Doc.section == section)
            .order_by(Doc.order_index, Doc.slug)
        )
    ).scalars().all()


async def db_get_doc(db: AsyncSession, slug: str) -> Doc | None:
    return (
        await db.execute(select(Doc).filter(Doc.slug == slug))
    ).scalar_one_or_none()


async def db_create_doc(db: AsyncSession, section: str, title: str, body: str) -> Doc:
    """Add a new doc to a section. slug is a generated stable id; order_index
    goes to the end of the section."""
    max_order = (
        await db.execute(
            select(func.coalesce(func.max(Doc.order_index), -1)).filter(Doc.section == section)
        )
    ).scalar_one()
    doc = Doc(
        slug=f"{section}-{uuid.uuid4().hex[:8]}",
        section=section,
        title=title.strip(),
        body=body,
        order_index=int(max_order) + 1,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return doc


async def db_delete_doc(db: AsyncSession, slug: str) -> bool:
    """Remove a doc. Returns False if the slug is unknown."""
    doc = await db_get_doc(db, slug)
    if doc is None:
        return False
    await db.delete(doc)
    await db.commit()
    return True


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
