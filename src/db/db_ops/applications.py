from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from db.models import Application


async def db_submit_application(
    db: AsyncSession,
    firstname: str,
    lastname: str,
    email: str,
    city: str | None,
    state: str | None,
    known_member: str | None,
    reason: str | None,
):
    app = Application(
        firstname=firstname,
        lastname=lastname,
        email=email,
        city=city,
        state=state,
        known_member=known_member,
        reason=reason,
    )
    db.add(app)
    await db.commit()
    return app


async def db_get_applications(db: AsyncSession):
    result = await db.execute(select(Application).order_by(Application.created_at.desc()))
    return result.scalars().all()


async def db_update_application_status(db: AsyncSession, application_id: str, status: str):
    result = await db.execute(select(Application).filter(Application.id == application_id))
    app = result.scalar_one_or_none()
    if not app:
        raise ValueError("Application not found")
    app.status = status
    await db.commit()
    return app
