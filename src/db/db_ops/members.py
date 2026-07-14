
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, and_, or_
import bcrypt

from db.models import (
    Member, Application, Art, Visual2D, WrittenForm, Audio, Comment,
    Media, Media_Members, MediaRequest, Report, BlockedMember,
    KeywordArt,
)

async def db_get_members(db: AsyncSession):
    result = await db.execute(select(Member))
    return result.scalars().all()


async def db_get_member_directory(db: AsyncSession, viewer_id):
    """All other members, for the messaging compose picker. Excludes the viewer
    and anyone in a block relationship with them (either direction)."""
    blocked_pair = (
        select(BlockedMember.blocker_id)
        .where(
            or_(
                and_(BlockedMember.blocker_id == Member.id, BlockedMember.blockee_id == viewer_id),
                and_(BlockedMember.blocker_id == viewer_id, BlockedMember.blockee_id == Member.id),
            )
        )
        .exists()
    )
    result = await db.execute(
        select(Member.username, Member.firstname, Member.lastname)
        .filter(Member.id != viewer_id)
        .filter(~blocked_pair)
        .order_by(Member.username)
    )
    return result.all()

async def db_login_user(db: AsyncSession, username: str, password: str):
    username = username.lower()
    result = await db.execute(select(Member).filter(Member.username == username))
    member = result.scalar_one_or_none()
    if member and bcrypt.checkpw(password.encode(), member.password_hash.encode()):
        return member
    return None

async def db_redeem_setup_code(db: AsyncSession, code: str) -> Member | None:
    """Look up the unique pending-setup member whose temp_password_plaintext matches `code`.
    Returns None if not found, expired, or not in setup state."""
    from datetime import datetime as _dt
    code = code.strip()
    if not code:
        return None
    result = await db.execute(
        select(Member).filter(
            Member.temp_password_plaintext == code,
            Member.must_change_password == True,
        )
    )
    member = result.scalar_one_or_none()
    if member is None:
        return None
    if member.temp_password_expires_at and member.temp_password_expires_at < _dt.utcnow():
        return None
    return member


async def db_start_password_reset(
    db: AsyncSession,
    email: str | None = None,
    username: str | None = None,
) -> tuple[Member, str] | None:
    """Forgot-password: mint a fresh setup code for the member with this email.

    Reuses the invite machinery (temp_password_plaintext + must_change_password),
    so the user finishes through the existing 'secret code?' → setup-account flow.
    Deliberately does NOT touch password_hash — the current password keeps
    working until the code is redeemed, so a malicious reset request can't lock
    the real owner out. Returns (member, plaintext_code), or None when no
    member has that email (callers should respond identically either way)."""
    from datetime import datetime, timedelta
    from sqlalchemy import func
    from db.db_ops.applications import _gen_temp_password

    member = None
    uname = (username or "").strip().lower()
    if uname:
        member = (await db.execute(
            select(Member).filter(Member.username == uname)
        )).scalar_one_or_none()
    if member is None:
        normalized = (email or "").strip().lower()
        if normalized:
            member = (await db.execute(
                select(Member).filter(func.lower(Member.email) == normalized)
            )).scalar_one_or_none()
    if member is None:
        return None

    # Unique among active plaintext codes — redeem looks members up by this value.
    for _ in range(5):
        code = _gen_temp_password()
        clash = (await db.execute(
            select(Member.id).filter(Member.temp_password_plaintext == code)
        )).scalar_one_or_none()
        if clash is None:
            break
    else:
        raise RuntimeError("Could not generate a unique reset code after 5 attempts")

    member.temp_password_plaintext = code
    # Reset codes are shorter-lived than invite codes (1 day vs 7).
    member.temp_password_expires_at = datetime.utcnow() + timedelta(days=1)
    member.must_change_password = True
    await db.commit()
    await db.refresh(member)
    return member, code


async def db_list_password_resets(db: AsyncSession):
    """Members with a live self-requested reset code (forgot-password flow),
    for the admin panel — the admin reads the code and sends it manually.
    Invite-flow members are excluded: their pending state belongs to an
    application row in 'pending_setup', which the applications list already
    shows (with its own code)."""
    from datetime import datetime as _dt
    invite_pending = (
        select(Application.id)
        .where(Application.member_id == Member.id, Application.status == "pending_setup")
        .exists()
    )
    result = await db.execute(
        select(Member)
        .filter(
            Member.must_change_password == True,
            Member.temp_password_plaintext.isnot(None),
            ~invite_pending,
        )
    )
    members = result.scalars().all()
    now = _dt.utcnow()
    # Only live codes — expired ones aren't actionable.
    return [m for m in members if not (m.temp_password_expires_at and m.temp_password_expires_at < now)]


async def db_create_member(db: AsyncSession, username: str, password: str) -> Member:
    username = username.lower()
    password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()
    member = Member(username=username, password_hash=password_hash)
    db.add(member)
    await db.commit()
    await db.refresh(member)
    print(f"Successfully created new user: {username}")
    return member

async def db_complete_setup(
        db: AsyncSession,
        member: Member,
        new_username: str,
        new_password: str,
) -> Member:
    """Finalize a pending-setup member: update username + password, clear temp state,
    resolve the linked application. Raises ValueError if the username is already taken."""
    taken = (await db.execute(
        select(Member).filter(Member.username == new_username, Member.id != member.id)
    )).scalar_one_or_none()
    if taken is not None:
        raise ValueError("Username is taken")

    member.username = new_username
    member.password_hash = bcrypt.hashpw(new_password.encode(), bcrypt.gensalt(rounds=12)).decode()
    member.must_change_password = False
    member.temp_password_plaintext = None
    member.temp_password_expires_at = None

    # Resolve every application linked to this member — orphan-reuse on
    # duplicate-email approvals can legitimately link more than one (the
    # original + the re-application), and all of them are now satisfied.
    app_rows = (await db.execute(
        select(Application).filter(Application.member_id == member.id)
    )).scalars().all()
    for app_row in app_rows:
        app_row.status = "resolved"

    await db.commit()
    await db.refresh(member)
    return member


async def db_create_full_member(
        db: AsyncSession, 
        username: str, 
        password: str,
        bio: str,
        city: str,
        state: str,
        firstname: str,
        lastname: str,
) -> Member:
    username = username.lower()
    password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()
    member = Member(
        username=username,
        password_hash=password_hash, 
        bio=bio, 
        city=city,
        state=state,
        firstname=firstname,
        lastname=lastname,
    )
    db.add(member)
    await db.commit()
    await db.refresh(member)
    print(f"Successfully created new user: {username}")
    return member

async def db_export_member_data(db: AsyncSession, member_id) -> dict:
    """Build a JSON-serializable dict of everything we have on this member.
    Used for the in-app 'download my data' option before account deletion."""

    member_row = (await db.execute(
        select(Member).filter(Member.id == member_id)
    )).scalar_one_or_none()
    if member_row is None:
        return {}

    def _iso(dt):
        return dt.isoformat() if dt is not None else None

    profile = {
        "id": str(member_row.id),
        "username": member_row.username,
        "email": member_row.email,
        "firstname": member_row.firstname,
        "lastname": member_row.lastname,
        "city": member_row.city,
        "state": member_row.state,
        "bio": member_row.bio,
        "role": member_row.role,
        "profile_pic_path": member_row.profile_pic_path,
        "terms_accepted_at": _iso(member_row.terms_accepted_at),
    }

    media_rows = (await db.execute(
        select(Media.name, Media_Members.hidden)
        .join(Media_Members, Media.id == Media_Members.media_id)
        .filter(Media_Members.member_id == member_id)
    )).all()
    mediums = [{"name": name, "hidden": bool(hidden)} for name, hidden in media_rows]

    art_rows = (await db.execute(
        select(Art).filter(Art.creator_id == member_id)
    )).scalars().all()
    art_ids = [a.id for a in art_rows]
    art = []
    for a in art_rows:
        entry = {
            "id": str(a.id),
            "title": a.title,
            "date": a.date.isoformat() if a.date else None,
            "file_path": a.file_path,
            "comments_enabled": a.comments_enabled,
            "type": a.type,
        }
        if a.type == "visual_2d":
            v = (await db.execute(
                select(Visual2D).filter(Visual2D.id == a.id)
            )).scalar_one_or_none()
            if v is not None:
                entry.update({
                    "width": float(v.width) if v.width is not None else None,
                    "height": float(v.height) if v.height is not None else None,
                    "song": v.song,
                    "song_artist": v.song_artist,
                    "location": v.location,
                    "aspect_ratio": v.aspect_ratio,
                })
        art.append(entry)

    comments_authored = (await db.execute(
        select(Comment).filter(Comment.member_id == member_id)
    )).scalars().all()
    authored = [
        {"id": str(c.id), "art_id": str(c.art_id), "text": c.text, "created_at": _iso(c.created_at)}
        for c in comments_authored
    ]

    received = []
    if art_ids:
        comments_received = (await db.execute(
            select(Comment, Member.username)
            .join(Member, Member.id == Comment.member_id)
            .filter(Comment.art_id.in_(art_ids))
        )).all()
        for c, author in comments_received:
            received.append({
                "id": str(c.id),
                "art_id": str(c.art_id),
                "author_username": author,
                "text": c.text,
                "created_at": _iso(c.created_at),
            })

    apps = (await db.execute(
        select(Application).filter(Application.member_id == member_id)
    )).scalars().all()
    applications = [
        {
            "id": str(a.id),
            "firstname": a.firstname,
            "lastname": a.lastname,
            "email": a.email,
            "city": a.city,
            "state": a.state,
            "known_member": a.known_member,
            "reason": a.reason,
            "status": a.status,
            "created_at": _iso(a.created_at),
        }
        for a in apps
    ]

    mreqs = (await db.execute(
        select(MediaRequest).filter(MediaRequest.member_id == member_id)
    )).scalars().all()
    media_requests = [
        {
            "id": str(m.id),
            "requested_name": m.requested_name,
            "status": m.status,
            "resolved_type": m.resolved_type,
            "created_at": _iso(m.created_at),
        }
        for m in mreqs
    ]

    rep_rows = (await db.execute(
        select(Report).filter(Report.reporter_id == member_id)
    )).scalars().all()
    reports = [
        {
            "id": str(r.id),
            "target_type": r.target_type,
            "target_id": str(r.target_id),
            "reason": r.reason,
            "status": r.status,
            "created_at": _iso(r.created_at),
        }
        for r in rep_rows
    ]

    blocked_rows = (await db.execute(
        select(Member.username)
        .join(BlockedMember, BlockedMember.blockee_id == Member.id)
        .filter(BlockedMember.blocker_id == member_id)
    )).scalars().all()

    return {
        "profile": profile,
        "mediums": mediums,
        "art": art,
        "comments_authored": authored,
        "comments_received": received,
        "applications": applications,
        "media_requests": media_requests,
        "reports_filed": reports,
        "blocked_usernames": list(blocked_rows),
    }


async def db_delete_member(db: AsyncSession, member_id) -> tuple[list[str], list[str]]:
    """Hard-delete the member and all owned data, in one transaction.

    Returns (file_paths, art_ids): file_paths are profile pic + art file paths the
    caller should unlink; art_ids let the caller remove derived thumbnails. Tables
    with cascading FKs (Comment, BlockedMember) are handled by Postgres."""

    member_row = (await db.execute(
        select(Member).filter(Member.id == member_id)
    )).scalar_one_or_none()
    if member_row is None:
        raise ValueError("Member not found")

    paths_to_remove: list[str] = []
    if member_row.profile_pic_path:
        paths_to_remove.append(member_row.profile_pic_path)

    art_rows = (await db.execute(
        select(Art.id, Art.file_path).filter(Art.creator_id == member_id)
    )).all()
    art_ids = [aid for aid, _ in art_rows]
    for _, fp in art_rows:
        if fp:
            paths_to_remove.append(fp)

    await db.execute(delete(Report).filter(Report.reporter_id == member_id))
    await db.execute(delete(MediaRequest).filter(MediaRequest.member_id == member_id))
    await db.execute(delete(Application).filter(Application.member_id == member_id))
    await db.execute(delete(Media_Members).filter(Media_Members.member_id == member_id))

    if art_ids:
        await db.execute(delete(KeywordArt).filter(KeywordArt.art_id.in_(art_ids)))
        await db.execute(delete(Visual2D).filter(Visual2D.id.in_(art_ids)))
        await db.execute(delete(WrittenForm).filter(WrittenForm.id.in_(art_ids)))
        await db.execute(delete(Audio).filter(Audio.id.in_(art_ids)))
        await db.execute(delete(Art).filter(Art.id.in_(art_ids)))

    await db.execute(delete(Member).filter(Member.id == member_id))
    await db.commit()

    return paths_to_remove, [str(aid) for aid in art_ids]
