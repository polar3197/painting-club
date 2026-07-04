from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func, and_, or_

from db.models import (
    Member,
    Conversation,
    DmConversation,
    GroupConversation,
    ConversationParticipant,
    Message,
    BlockedMember,
)


async def _db_get_participant(db: AsyncSession, conversation_id, member_id):
    return (
        await db.execute(
            select(ConversationParticipant).filter(
                ConversationParticipant.conversation_id == conversation_id,
                ConversationParticipant.member_id == member_id,
            )
        )
    ).scalar_one_or_none()


async def _db_pair_blocked(db: AsyncSession, a_id, b_id) -> bool:
    """True if either member has blocked the other — kills DMs both ways."""
    row = (
        await db.execute(
            select(BlockedMember.blocker_id).filter(
                or_(
                    and_(BlockedMember.blocker_id == a_id, BlockedMember.blockee_id == b_id),
                    and_(BlockedMember.blocker_id == b_id, BlockedMember.blockee_id == a_id),
                )
            )
        )
    ).first()
    return row is not None


async def db_get_or_create_dm(db: AsyncSession, me_id, other_id):
    """Return (conversation_id, created). One DM per pair is guaranteed by the
    uq_dm_pair constraint; the (low, high) sort here matches Postgres UUID
    ordering (Python UUIDs compare by the same big-endian byte value)."""
    if str(me_id) == str(other_id):
        raise ValueError("Cannot message yourself")
    if await _db_pair_blocked(db, me_id, other_id):
        raise PermissionError("Messaging unavailable with this member")

    low, high = sorted([me_id, other_id])
    existing = (
        await db.execute(
            select(DmConversation).filter(
                DmConversation.member_low_id == low,
                DmConversation.member_high_id == high,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        return existing.id, False

    convo = DmConversation(member_low_id=low, member_high_id=high)
    db.add(convo)
    await db.flush()
    db.add(ConversationParticipant(conversation_id=convo.id, member_id=me_id))
    db.add(ConversationParticipant(conversation_id=convo.id, member_id=other_id))
    await db.commit()
    return convo.id, True


async def db_create_group(db: AsyncSession, creator_id, title: str, member_ids):
    """Create a group conversation; the creator joins as its admin."""
    title = (title or "").strip()
    if not title:
        raise ValueError("title required")
    others = {mid for mid in member_ids if mid != creator_id}
    if not others:
        raise ValueError("a group needs at least one other member")

    convo = GroupConversation(title=title, created_by=creator_id)
    db.add(convo)
    await db.flush()
    db.add(ConversationParticipant(conversation_id=convo.id, member_id=creator_id, role="admin"))
    for mid in others:
        db.add(ConversationParticipant(conversation_id=convo.id, member_id=mid))
    await db.commit()
    return convo.id


async def db_list_conversations(db: AsyncSession, me_id):
    """All conversations the member participates in, newest activity first.
    Returns dicts with display title, last-message preview and unread count."""
    rows = (
        await db.execute(
            select(Conversation)
            .join(ConversationParticipant, ConversationParticipant.conversation_id == Conversation.id)
            .filter(ConversationParticipant.member_id == me_id)
        )
    ).scalars().all()
    if not rows:
        return []
    convo_ids = [c.id for c in rows]

    # Latest message per conversation (DISTINCT ON keeps only the newest row).
    last_rows = (
        await db.execute(
            select(Message, Member.username)
            .join(Member, Member.id == Message.sender_id)
            .filter(Message.conversation_id.in_(convo_ids))
            .distinct(Message.conversation_id)
            .order_by(Message.conversation_id, desc(Message.created_at))
        )
    ).all()
    last_by_convo = {msg.conversation_id: (msg, uname) for msg, uname in last_rows}

    # Unread = messages from others newer than my read cursor.
    unread_rows = (
        await db.execute(
            select(Message.conversation_id, func.count())
            .join(
                ConversationParticipant,
                and_(
                    ConversationParticipant.conversation_id == Message.conversation_id,
                    ConversationParticipant.member_id == me_id,
                ),
            )
            .filter(Message.conversation_id.in_(convo_ids))
            .filter(Message.sender_id != me_id)
            .filter(
                or_(
                    ConversationParticipant.last_read_at.is_(None),
                    Message.created_at > ConversationParticipant.last_read_at,
                )
            )
            .group_by(Message.conversation_id)
        )
    ).all()
    unread = dict(unread_rows)

    # DM partners: the other member of each pair, for display naming.
    dm_rows = (
        await db.execute(select(DmConversation).filter(DmConversation.id.in_(convo_ids)))
    ).scalars().all()
    partner_ids = {
        d.id: (d.member_high_id if d.member_low_id == me_id else d.member_low_id)
        for d in dm_rows
    }
    partners = {}
    if partner_ids:
        member_rows = (
            await db.execute(select(Member).filter(Member.id.in_(set(partner_ids.values()))))
        ).scalars().all()
        partners = {m.id: m for m in member_rows}

    # Group titles fetched explicitly: reading .title off the polymorphic base
    # instances would trigger a lazy subtype load, which async sessions forbid.
    group_titles = dict(
        (
            await db.execute(
                select(GroupConversation.id, GroupConversation.title).filter(
                    GroupConversation.id.in_(convo_ids)
                )
            )
        ).all()
    )

    out = []
    for convo in rows:
        last = last_by_convo.get(convo.id)
        if convo.type == "dm":
            partner = partners.get(partner_ids.get(convo.id))
            title = (partner.firstname or partner.username) if partner else "(deleted member)"
            partner_username = partner.username if partner else None
        else:
            title = group_titles.get(convo.id, "")
            partner_username = None
        out.append(
            {
                "id": convo.id,
                "type": convo.type,
                "title": title,
                "partner_username": partner_username,
                "last_message": last[0].body if last else None,
                "last_message_at": last[0].created_at if last else None,
                "last_sender_username": last[1] if last else None,
                "unread": unread.get(convo.id, 0),
                "created_at": convo.created_at,
            }
        )
    out.sort(key=lambda r: r["last_message_at"] or r["created_at"], reverse=True)
    return out


async def db_get_messages(db: AsyncSession, conversation_id, me_id, cursor, limit: int):
    """Newest-first keyset page of a thread. The first page (cursor=None) bumps
    the caller's read cursor and returns its previous value as the unseen
    threshold (mirrors db_touch_comments_viewed)."""
    part = await _db_get_participant(db, conversation_id, me_id)
    if part is None:
        raise PermissionError("Not a participant in this conversation")

    q = (
        select(Message, Member.username, Member.firstname)
        .join(Member, Member.id == Message.sender_id)
        .filter(Message.conversation_id == conversation_id)
        .order_by(desc(Message.created_at))
        .limit(limit)
    )
    if cursor is not None:
        q = q.filter(Message.created_at < cursor)
    rows = (await db.execute(q)).all()

    prev_read = part.last_read_at
    if cursor is None:
        part.last_read_at = datetime.utcnow()
        await db.commit()
    return rows, prev_read


async def db_send_message(db: AsyncSession, conversation_id, me_id, body: str) -> Message:
    body = (body or "").strip()
    if not body:
        raise ValueError("message cannot be empty")
    part = await _db_get_participant(db, conversation_id, me_id)
    if part is None:
        raise PermissionError("Not a participant in this conversation")

    # A block in either direction freezes an existing DM thread.
    dm = (
        await db.execute(select(DmConversation).filter(DmConversation.id == conversation_id))
    ).scalar_one_or_none()
    if dm is not None:
        other = dm.member_high_id if dm.member_low_id == me_id else dm.member_low_id
        if await _db_pair_blocked(db, me_id, other):
            raise PermissionError("Messaging unavailable with this member")

    msg = Message(conversation_id=conversation_id, sender_id=me_id, body=body)
    db.add(msg)
    part.last_read_at = datetime.utcnow()  # sending implies the thread was seen
    await db.commit()
    await db.refresh(msg)
    return msg


async def db_leave_group(db: AsyncSession, conversation_id, me_id):
    convo = (
        await db.execute(select(Conversation).filter(Conversation.id == conversation_id))
    ).scalar_one_or_none()
    if convo is None:
        raise ValueError("Conversation not found")
    if convo.type != "group":
        raise ValueError("Only group conversations can be left")
    part = await _db_get_participant(db, conversation_id, me_id)
    if part is None:
        raise PermissionError("Not a participant in this conversation")

    await db.delete(part)
    await db.flush()
    remaining = (
        await db.execute(
            select(func.count())
            .select_from(ConversationParticipant)
            .filter(ConversationParticipant.conversation_id == conversation_id)
        )
    ).scalar_one()
    if remaining == 0:
        # Last one out deletes the whole thread (messages cascade).
        await db.delete(convo)
    await db.commit()
