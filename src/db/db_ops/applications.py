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


class UsernameTaken(Exception):
    """Desired username is owned by a member or claimed by another pending
    application — the route answers 409 so the form can ask for another."""


async def db_username_available(
    db: AsyncSession, username: str, exclude_application_id=None
) -> bool:
    """Free = no member owns it AND no OTHER pending application claims it.

    Checking pending applications too is what stops two people at the same
    meeting picking 'sam' and only discovering the clash at approval time,
    when one of them has already been told they're in.

    `exclude_application_id` is not optional in spirit: approval re-checks the
    name, and at that moment the application being approved is itself still
    'pending' with that exact username. Without excluding it, every self-serve
    application matched itself and approval raised UsernameTaken 100% of the
    time — the approve button did nothing at all.
    """
    uname = (username or "").strip().lower()
    if not uname:
        return False
    owned = (await db.execute(
        select(Member.id).filter(Member.username == uname)
    )).scalar_one_or_none()
    if owned is not None:
        return False
    q = select(Application.id).filter(
        Application.username == uname,
        Application.status == "pending",
    )
    if exclude_application_id is not None:
        q = q.filter(Application.id != exclude_application_id)
    claimed = (await db.execute(q)).scalar_one_or_none()
    return claimed is None


async def db_submit_application(
    db: AsyncSession,
    firstname: str,
    lastname: str,
    email: str,
    city: str | None,
    state: str | None,
    known_member: str | None,
    reason: str | None,
    *,
    username: str | None = None,
    password: str | None = None,
    signup_invite_id: str | None = None,
    art_path: str | None = None,
    art_aspect_ratio: float | None = None,
):
    """Create a pending application.

    When `username`/`password` are supplied (the QR form), they're validated and
    the password is hashed here — approval then creates the member with them, so
    nothing has to be relayed to the applicant. Omitting both keeps the legacy
    behaviour for any caller still on the old application shape.
    """
    uname = (username or "").strip().lower() or None
    password_hash = None
    if uname is not None:
        if not await db_username_available(db, uname):
            raise UsernameTaken(uname)
        # Hashed at submit; the plaintext is never stored, unlike the temp
        # passwords the legacy approval path hands out.
        password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()

    app = Application(
        firstname=firstname,
        lastname=lastname,
        email=email,
        city=city,
        state=state,
        known_member=known_member,
        reason=reason,
        username=uname,
        password_hash=password_hash,
        signup_invite_id=signup_invite_id,
        art_path=art_path,
        art_aspect_ratio=art_aspect_ratio,
    )
    db.add(app)
    await db.commit()
    await db.refresh(app)
    return app


async def db_pending_application_login(
    db: AsyncSession, username: str, password: str
) -> Application | None:
    """Back the "still under review" answer at login.

    A submitted-but-unapproved applicant has no Member row yet, so an ordinary
    login can only tell them their credentials are wrong — which reads as "you
    typed it wrong" to someone who just signed up. This finds the application
    those credentials actually belong to. Returns the row whatever its status;
    the caller decides what each status is allowed to reveal.
    """
    uname = (username or "").strip().lower()
    if not uname or not password:
        return None
    app = (await db.execute(
        select(Application)
        .filter(Application.username == uname)
        .order_by(Application.created_at.desc())
    )).scalars().first()
    if app is None or not app.password_hash:
        return None
    if not bcrypt.checkpw(password.encode(), app.password_hash.encode()):
        return None
    return app


async def db_referenced_application_art(db: AsyncSession) -> set[str]:
    """Every art_path still pointed at by an application row.

    The keep-list for the draft sweeper: uploads happen before the form is
    submitted (so the bytes are already on the server when they hit submit),
    which means anyone who picks a photo and wanders off leaves a file behind.
    Anything not in this set and older than the grace period is abandoned."""
    rows = (await db.execute(
        select(Application.art_path).filter(Application.art_path.isnot(None))
    )).scalars().all()
    return {r for r in rows if r}


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


async def db_delete_application(db: AsyncSession, application_id: str) -> str | None:
    """Hard-delete an application. If it's still in pending_setup (member created but
    setup never completed), also delete the orphan Member row so the placeholder
    username and temp password don't linger.

    Returns the row's art_path (or None) so the caller can unlink the file —
    deleting the row is the only thing that retires an application piece from
    the wall, and leaving its bytes behind would just accumulate on the Pi."""
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
    art_path = app.art_path
    await db.delete(app)
    await db.commit()
    return art_path


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


async def db_approve_application(db: AsyncSession, application_id: str) -> tuple[Application, Member, str | None]:
    """Approve an application. Returns (application, member, temp_password_or_None).

    Two shapes, decided by whether the application carries its own credentials:

    - **With credentials** (the QR form): the member is created with the username
      and password the applicant already chose, immediately usable. The app goes
      to 'approved' and the third element is None — there is nothing to relay,
      they just log in with what they typed.
    - **Without** (rows predating 030): unchanged legacy path — mint a temp
      password, move the app to 'pending_setup', and the caller relays the code.

    member.email is UNIQUE, so a re-application with an email that already has a member
    can't just insert a second row (that used to escape as a 500 IntegrityError). Two
    cases instead: an un-finished pending_setup orphan (applied before, approved, never
    completed setup) is REUSED; a completed account raises a clear 'already exists'
    error the route maps to 409."""
    result = await db.execute(select(Application).filter(Application.id == application_id))
    app = result.scalar_one_or_none()
    if not app:
        raise ValueError("Application not found")
    if app.status not in ("pending", "approved"):
        raise ValueError(f"Application is already {app.status}")

    self_serve = bool(app.username and app.password_hash)

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
        # Orphan invite (approved earlier, setup never finished): reuse the row
        # rather than colliding on the UNIQUE email. Any older pending_setup
        # application stays linked to the same member and simply becomes another
        # path to the same account.
        if self_serve:
            # Finish the orphan outright with the chosen credentials — the
            # placeholder username and temp password both go away.
            clash = (await db.execute(
                select(Member.id).filter(
                    Member.username == app.username, Member.id != existing.id
                )
            )).scalar_one_or_none()
            if clash is not None:
                raise UsernameTaken(app.username)
            existing.username = app.username
            existing.password_hash = app.password_hash
            existing.must_change_password = False
            existing.temp_password_plaintext = None
            existing.temp_password_expires_at = None
            app.status = "approved"
            app.member_id = existing.id
            await db.commit()
            await db.refresh(existing)
            await db.refresh(app)
            return app, existing, None

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

    if self_serve:
        # The username was free at submit, but anyone could have taken it in the
        # meantime — re-check here, because member.username is UNIQUE and losing
        # this race would otherwise surface as a 500 at the worst moment.
        if not await db_username_available(db, app.username, exclude_application_id=app.id):
            raise UsernameTaken(app.username)
        member = Member(
            id=member_id,
            username=app.username,
            email=app.email,
            firstname=app.firstname,
            lastname=app.lastname,
            city=app.city,
            state=app.state,
            password_hash=app.password_hash,
            must_change_password=False,
            signup_invite_id=app.signup_invite_id,
        )
        db.add(member)
        # Flush so the member INSERT lands before the application UPDATE's FK.
        await db.flush()
        app.status = "approved"
        app.member_id = member_id
        await db.commit()
        await db.refresh(member)
        await db.refresh(app)
        return app, member, None

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
