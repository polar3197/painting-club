import bcrypt
import secrets
import uuid
from datetime import datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from db.models import Application, Member


TEMP_PASSWORD_TTL_DAYS = 7
TEMP_PASSWORD_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789abcdefghjkmnpqrstuvwxyz"  # no 0/O/1/l/I


def _gen_temp_password(length: int = 12) -> str:
    return "".join(secrets.choice(TEMP_PASSWORD_ALPHABET) for _ in range(length))


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


async def db_approve_application(db: AsyncSession, application_id: str) -> tuple[Application, Member, str]:
    """Approve an application: create a Member with a temp password, link it to the app,
    move the app to 'pending_setup'. Returns (application, member, plaintext_temp_password)."""
    result = await db.execute(select(Application).filter(Application.id == application_id))
    app = result.scalar_one_or_none()
    if not app:
        raise ValueError("Application not found")
    if app.status not in ("pending", "approved"):
        raise ValueError(f"Application is already {app.status}")

    member_id = uuid.uuid4()
    placeholder_username = f"user_{str(member_id)[:8]}"
    temp_password = _gen_temp_password()
    password_hash = bcrypt.hashpw(temp_password.encode(), bcrypt.gensalt(rounds=12)).decode()

    member = Member(
        id=member_id,
        username=placeholder_username,
        email=app.email,
        firstname=app.firstname,
        lastname=app.lastname,
        city=app.city,
        state=app.state,
        password_hash=password_hash,
        must_change_password=True,
        temp_password_plaintext=temp_password,
        temp_password_expires_at=datetime.utcnow() + timedelta(days=TEMP_PASSWORD_TTL_DAYS),
    )
    db.add(member)

    app.status = "pending_setup"
    app.member_id = member_id

    await db.commit()
    await db.refresh(member)
    await db.refresh(app)
    return app, member, temp_password
