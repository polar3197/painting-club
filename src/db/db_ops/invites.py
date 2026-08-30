"""QR signup invites: mint/list/revoke (admin) and the public redeem that
stands in for the secret-code step. Redeem mirrors db_approve_application's
member creation — placeholder username, must_change_password — minus the
temp password, since the caller gets a setup token directly."""
import secrets
import uuid
from datetime import datetime, timedelta

import bcrypt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import Member, SignupInvite


def _gen_invite_token() -> str:
    # URL-safe, short enough to type by hand if it ever comes to that.
    return secrets.token_urlsafe(9)  # 12 chars


async def db_create_invite(db: AsyncSession, label: str | None, expires_in_days: int | None, max_uses: int | None) -> SignupInvite:
    for _ in range(5):
        token = _gen_invite_token()
        clash = (await db.execute(select(SignupInvite.id).filter(SignupInvite.token == token))).scalar_one_or_none()
        if clash is None:
            break
    else:
        raise RuntimeError("Could not generate a unique invite token after 5 attempts")
    invite = SignupInvite(
        token=token,
        label=(label or "").strip() or None,
        max_uses=max_uses,
        expires_at=datetime.utcnow() + timedelta(days=expires_in_days) if expires_in_days else None,
    )
    db.add(invite)
    await db.commit()
    await db.refresh(invite)
    return invite


async def db_list_invites(db: AsyncSession) -> list[tuple[SignupInvite, list[str]]]:
    """Every invite, newest first, with the usernames that joined through it."""
    invites = (await db.execute(select(SignupInvite).order_by(SignupInvite.created_at.desc()))).scalars().all()
    out = []
    for inv in invites:
        members = (await db.execute(
            select(Member.username).filter(Member.signup_invite_id == inv.id)
        )).scalars().all()
        out.append((inv, list(members)))
    return out


async def db_revoke_invite(db: AsyncSession, invite_id: str) -> None:
    inv = (await db.execute(select(SignupInvite).filter(SignupInvite.id == invite_id))).scalar_one_or_none()
    if inv is None:
        raise ValueError("Invite not found")
    inv.revoked = True
    await db.commit()


class InviteDead(Exception):
    """Expired / revoked / used up — the route answers 410."""


async def db_redeem_invite(
    db: AsyncSession,
    token: str,
    firstname: str,
    lastname: str,
    email: str | None,
) -> Member:
    inv = (await db.execute(select(SignupInvite).filter(SignupInvite.token == token.strip()))).scalar_one_or_none()
    if inv is None or inv.revoked:
        raise InviteDead()
    if inv.expires_at and inv.expires_at < datetime.utcnow():
        raise InviteDead()
    if inv.max_uses is not None and inv.uses >= inv.max_uses:
        raise InviteDead()

    normalized_email = (email or "").strip().lower() or None
    if normalized_email:
        existing = (await db.execute(select(Member).filter(Member.email == normalized_email))).scalar_one_or_none()
        if existing is not None:
            if not existing.must_change_password:
                # A completed account owns this email.
                raise ValueError("a member with this email already exists — log in instead, or reset your password")
            # Orphan (approved/redeemed earlier, setup never finished): hand the
            # setup token to the same row instead of colliding on the UNIQUE email.
            inv.uses += 1
            await db.commit()
            await db.refresh(existing)
            return existing

    member_id = uuid.uuid4()
    # No usable password until setup completes; the hash is a random throwaway.
    throwaway = bcrypt.hashpw(secrets.token_urlsafe(16).encode(), bcrypt.gensalt(rounds=12)).decode()
    member = Member(
        id=member_id,
        username=f"user_{str(member_id)[:8]}",
        email=normalized_email,
        firstname=firstname.strip(),
        lastname=lastname.strip(),
        password_hash=throwaway,
        must_change_password=True,
        signup_invite_id=inv.id,
    )
    db.add(member)
    inv.uses += 1
    await db.commit()
    await db.refresh(member)
    return member
