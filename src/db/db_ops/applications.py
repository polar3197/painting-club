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


async def db_delete_application(db: AsyncSession, application_id: str) -> None:
    """Hard-delete an application. If it's still in pending_setup (member created but
    setup never completed), also delete the orphan Member row so the placeholder
    username and temp password don't linger."""
    app = (await db.execute(
        select(Application).filter(Application.id == application_id)
    )).scalar_one_or_none()
    if not app:
        raise ValueError("Application not found")
    if app.status == "pending_setup" and app.member_id:
        member = (await db.execute(
            select(Member).filter(Member.id == app.member_id)
        )).scalar_one_or_none()
        if member is not None:
            await db.delete(member)
    await db.delete(app)
    await db.commit()


async def _unique_temp_password(db: AsyncSession) -> tuple[str, str]:
    """Generate a temp password unique among active (non-null) plaintext values, since
    the setup-code login looks members up by this column. Collisions are astronomically
    rare, but cheap to guard against. Returns (plaintext, bcrypt_hash)."""
    for _ in range(5):
        temp_password = _gen_temp_password()
        clash = (await db.execute(
            select(Member.id).filter(Member.temp_password_plaintext == temp_password)
        )).scalar_one_or_none()
        if clash is None:
            break
    else:
        raise RuntimeError("Could not generate a unique temp password after 5 attempts")
    password_hash = bcrypt.hashpw(temp_password.encode(), bcrypt.gensalt(rounds=12)).decode()
    return temp_password, password_hash


async def db_approve_application(db: AsyncSession, application_id: str) -> tuple[Application, Member, str]:
    """Approve an application: create a Member with a temp password, link it to the app,
    move the app to 'pending_setup'. Returns (application, member, plaintext_temp_password).

    member.email is UNIQUE, so a re-application with an email that already has a member
    can't just insert a second row (that used to escape as a 500 IntegrityError). Two
    cases instead: an un-finished pending_setup orphan (applied before, approved, never
    completed setup) is REUSED with a fresh temp password; a completed account raises a
    clear 'already exists' error the route maps to 409."""
    result = await db.execute(select(Application).filter(Application.id == application_id))
    app = result.scalar_one_or_none()
    if not app:
        raise ValueError("Application not found")
    if app.status not in ("pending", "approved"):
        raise ValueError(f"Application is already {app.status}")

    existing = (await db.execute(
        select(Member).filter(Member.email == app.email)
    )).scalar_one_or_none()
    if existing is not None:
        if not existing.must_change_password:
            # A real, completed account owns this email.
            raise ValueError(
                "a member with this email already exists — delete the earlier request "
                "or have them log in / reset their password"
            )
        # Orphan invite (approved earlier, setup never finished): reuse it with a
        # fresh temp password + expiry, and point this application at it. Any older
        # pending_setup application stays linked to the same member and simply
        # becomes another path to the same account.
        temp_password, password_hash = await _unique_temp_password(db)
        existing.password_hash = password_hash
        existing.temp_password_plaintext = temp_password
        existing.temp_password_expires_at = datetime.utcnow() + timedelta(days=TEMP_PASSWORD_TTL_DAYS)

        app.status = "pending_setup"
        app.member_id = existing.id

        await db.commit()
        await db.refresh(existing)
        await db.refresh(app)
        return app, existing, temp_password

    member_id = uuid.uuid4()
    placeholder_username = f"user_{str(member_id)[:8]}"
    temp_password, password_hash = await _unique_temp_password(db)

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
    # Flush so the member INSERT is emitted before the application UPDATE with member_id FK.
    await db.flush()

    app.status = "pending_setup"
    app.member_id = member_id

    await db.commit()
    await db.refresh(member)
    await db.refresh(app)
    return app, member, temp_password
