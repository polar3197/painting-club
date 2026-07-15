# src/db/models.py
from sqlalchemy import Column, String, Text, ForeignKey, Date, Time, Numeric, DateTime, Boolean, Float, Integer, UniqueConstraint, CheckConstraint
from datetime import datetime
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
import uuid

from db.database import Base

class Member(Base):
    __tablename__ = "member"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username = Column(String(50), unique=True, nullable=False)
    email = Column(String(255), unique=True)
    firstname = Column(String(255))
    lastname = Column(String(255))
    password_hash = Column(String(255), nullable=False)
    city = Column(String(255))
    state = Column(String(255))
    bio = Column(Text)
    role = Column(String(20), nullable=False, default="member")
    profile_pic_path = Column(String(300))
    must_change_password = Column(Boolean, nullable=False, default=False)
    temp_password_plaintext = Column(String(32))
    temp_password_expires_at = Column(DateTime)
    terms_accepted_at = Column(DateTime)
    # Timestamp of the last time the user opened their "comments on my art"
    # dialog. Comments with created_at > this value render as unseen.
    comments_last_viewed_at = Column(DateTime)
    # Profile page colors from the edit-profile color tab: component-key ->
    # color string ('#rrggbb'). NULL = never customized; clients fall back to
    # the app-default palette.
    profile_colors = Column(JSONB)

    # favorite piece you made
    # favorite medium
    # biggest art inspo atm
    # favorite quote
    # sun moon rising


class Media(Base):
    __tablename__ = "media"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(300), nullable=False)
    type = Column(String(50), nullable=True)


class Media_Members(Base):
    __tablename__ = "media_members"

    # Composite primary key - both columns together form the PK
    member_id = Column(UUID(as_uuid=True), ForeignKey('member.id'), primary_key=True)
    media_id = Column(UUID(as_uuid=True), ForeignKey('media.id'), primary_key=True)
    hidden = Column(Boolean, nullable=False, default=False)
    # User-chosen position of this medium's tab on their profile (hold-and-drag
    # reorder). NULL = never customized — sorts after positioned tabs,
    # alphabetically, so untouched profiles keep the historical order.
    position = Column(Integer)

class Series(Base):
    """Per-creator grouping of pieces under a shared name within one (creator, medium).
    Used by WrittenForm today. Renamed from the original "collection" so the bare name
    Collection can be reclaimed as the polymorphic base for app-wide groupings."""
    __tablename__ = "series"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    creator_id = Column(UUID(as_uuid=True), ForeignKey('member.id'), nullable=False)
    media_id = Column(UUID(as_uuid=True), ForeignKey('media.id'), nullable=False)
    name = Column(String(300), nullable=False)


class Collection(Base):
    """Polymorphic base for app-wide groupings of Art (weekly prompts now, more later)."""
    __tablename__ = "collection"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    type = Column(String(50), nullable=False)
    title = Column(String(300), nullable=False)
    short_summary = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    __mapper_args__ = {"polymorphic_on": type}


class WeeklyPrompt(Collection):
    __tablename__ = "weekly_prompt"

    id = Column(UUID(as_uuid=True), ForeignKey('collection.id', ondelete='CASCADE'), primary_key=True)
    media_id = Column(UUID(as_uuid=True), ForeignKey('media.id'), nullable=False)
    is_active = Column(Boolean, nullable=False, default=False)
    archived_at = Column(DateTime)

    __mapper_args__ = {"polymorphic_identity": "weekly_prompt"}


class WeeklyPromptSuggestion(Base):
    """Member-proposed weekly prompts. Admin reviews each: proposed → approved
    (joins the ordered "up next" queue) or rejected. media_id NULL means the
    suggestion is medium-agnostic. order_index mirrors the series/album ordering
    pattern — set on approval, rewritten by the admin's drag-reorder."""
    __tablename__ = "weekly_prompt_suggestion"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    member_id = Column(UUID(as_uuid=True), ForeignKey('member.id', ondelete='CASCADE'), nullable=False)
    media_id = Column(UUID(as_uuid=True), ForeignKey('media.id'), nullable=True)
    prompt_text = Column(Text, nullable=False)
    status = Column(String(20), nullable=False, default="proposed")  # proposed | approved | rejected
    # Position in the up-next queue; only meaningful while status='approved'.
    order_index = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)


class Announcement(Base):
    """A contributor/admin-authored announcement. Every announcement carries an
    attached discussion (announcement_comment rows). Authoring is gated on the
    contributor role; any member can read and comment."""
    __tablename__ = "announcement"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    author_id = Column(UUID(as_uuid=True), ForeignKey('member.id', ondelete='SET NULL'), nullable=True)
    title = Column(String(300), nullable=False)
    body = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class AnnouncementComment(Base):
    """A comment in an announcement's discussion thread. Deletable by its author
    or any contributor (moderation)."""
    __tablename__ = "announcement_comment"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    announcement_id = Column(UUID(as_uuid=True), ForeignKey('announcement.id', ondelete='CASCADE'), nullable=False)
    member_id = Column(UUID(as_uuid=True), ForeignKey('member.id', ondelete='CASCADE'), nullable=False)
    text = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class Doc(Base):
    """An editable "about the app" document. Each About section (ethos/art/aims)
    holds MANY docs — `section` groups them, `slug` is the per-doc stable id.
    Backs the previously-static aboutContent: any member reads, contributors
    create/edit/delete. `body` is plain text (paragraphs separated by blank
    lines); `order_index` orders docs within a section."""
    __tablename__ = "doc"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slug = Column(String(80), unique=True, nullable=False)
    # Which About section this doc belongs to (ethos/art/aims). Backfilled from
    # slug for the original one-per-section rows.
    section = Column(String(50), index=True)
    title = Column(String(300), nullable=False)
    body = Column(Text, nullable=False, default="")
    order_index = Column(Integer, nullable=False, default=0)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Art(Base):
    __tablename__ = "art"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    creator_id = Column(UUID(as_uuid=True), ForeignKey('member.id'), nullable=False)
    media_id = Column(UUID(as_uuid=True), ForeignKey('media.id'), nullable=False)
    series_id = Column(UUID(as_uuid=True), ForeignKey('series.id'), nullable=True)
    # Position within the piece's series (album track order, painting sequence,
    # writing order). Lives on the base so every medium shares one ordering.
    # Supersedes written_form.order_index, which is kept in sync for old clients.
    series_order_index = Column(Integer)
    collection_id = Column(UUID(as_uuid=True), ForeignKey('collection.id', ondelete='SET NULL'), nullable=True)
    title = Column(String(300), default="Untitled")
    date = Column(Date)
    file_path = Column(String(300))
    comments_enabled = Column(Boolean, nullable=False, default=False)
    type = Column(String(50), nullable=False)  # discriminator column
    created_at = Column(DateTime, default=datetime.utcnow)

    __mapper_args__ = {"polymorphic_on": type}


class Visual2D(Art):
    __tablename__ = "visual_2d"

    id = Column(UUID(as_uuid=True), ForeignKey('art.id'), primary_key=True)
    width = Column(Numeric(6, 2))
    height = Column(Numeric(6, 2))
    song = Column(String(255))
    song_artist = Column(String(255))
    location = Column(String(255))
    aspect_ratio = Column(Float)

    __mapper_args__ = {"polymorphic_identity": "visual_2d"}

class WrittenForm(Art):
    __tablename__ = "written_form"

    id = Column(UUID(as_uuid=True), ForeignKey('art.id'), primary_key=True)
    # User-defined position within a series. NULL ⇒ unset (sorted to the bottom).
    order_index = Column(Integer)
    # Optional image shown as the piece's cover in art-element displays, so a
    # text piece can render a picture card. NULL = no cover (text-snippet card).
    cover_image_path = Column(String(500))

    __mapper_args__ = {"polymorphic_identity": "written_form"}


class Audio(Art):
    """Sound pieces: voice memos and uploaded music. Like Visual2D, these are a
    single file on disk (no series grouping for now). `title` (from Art) is the
    track/memo name; `artist` is only meaningful for uploaded music."""
    __tablename__ = "audio"

    id = Column(UUID(as_uuid=True), ForeignKey('art.id'), primary_key=True)
    # Length in seconds, captured client-side at record/upload time so the
    # profile tile can show a duration without loading the file.
    duration_seconds = Column(Float)
    # Optional performer/composer for uploaded music. NULL for voice memos.
    artist = Column(String(255))

    __mapper_args__ = {"polymorphic_identity": "audio"}



# class Group(Base):
#     __tablename__ = "group"

#     id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
#     name = Column(Text)
#     location = Column(String(255))
#     # 3NF roles, type


# =============================================
''' Messaging '''

class Conversation(Base):
    """Polymorphic base for message threads (mirrors the Collection pattern).
    DM-only and group-only attributes live on their subtype tables, so no
    base-row column is NULL-by-type (3NF)."""
    __tablename__ = "conversation"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    type = Column(String(20), nullable=False)  # discriminator: 'dm' | 'group'
    created_at = Column(DateTime, default=datetime.utcnow)

    __mapper_args__ = {"polymorphic_on": type}


class DmConversation(Conversation):
    """One row per member pair. The (low, high) UUID ordering plus the unique
    constraint makes "one DM per pair" a database guarantee, not an app check."""
    __tablename__ = "dm_conversation"

    id = Column(UUID(as_uuid=True), ForeignKey('conversation.id', ondelete='CASCADE'), primary_key=True)
    member_low_id = Column(UUID(as_uuid=True), ForeignKey('member.id', ondelete='CASCADE'), nullable=False)
    member_high_id = Column(UUID(as_uuid=True), ForeignKey('member.id', ondelete='CASCADE'), nullable=False)

    __table_args__ = (
        UniqueConstraint('member_low_id', 'member_high_id', name='uq_dm_pair'),
        CheckConstraint('member_low_id < member_high_id', name='ck_dm_pair_ordered'),
    )
    __mapper_args__ = {"polymorphic_identity": "dm"}


class GroupConversation(Conversation):
    __tablename__ = "group_conversation"

    id = Column(UUID(as_uuid=True), ForeignKey('conversation.id', ondelete='CASCADE'), primary_key=True)
    title = Column(String(300), nullable=False)
    # SET NULL so the group survives its creator deleting their account.
    created_by = Column(UUID(as_uuid=True), ForeignKey('member.id', ondelete='SET NULL'), nullable=True)

    __mapper_args__ = {"polymorphic_identity": "group"}


class ConversationParticipant(Base):
    __tablename__ = "conversation_participant"

    conversation_id = Column(UUID(as_uuid=True), ForeignKey('conversation.id', ondelete='CASCADE'), primary_key=True)
    member_id = Column(UUID(as_uuid=True), ForeignKey('member.id', ondelete='CASCADE'), primary_key=True)
    role = Column(String(20), nullable=False, default="member")  # 'member' | 'admin' (group management)
    joined_at = Column(DateTime, default=datetime.utcnow)
    # Per-member read cursor: messages with created_at > this are unread
    # (mirrors member.comments_last_viewed_at).
    last_read_at = Column(DateTime)


class Message(Base):
    __tablename__ = "message"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id = Column(UUID(as_uuid=True), ForeignKey('conversation.id', ondelete='CASCADE'), nullable=False)
    sender_id = Column(UUID(as_uuid=True), ForeignKey('member.id', ondelete='CASCADE'), nullable=False)
    body = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    # Set to server time when the author edits the message; NULL = never edited.
    edited_at = Column(DateTime)
# =============================================


# =============================================
''' Keywords '''
class Keyword(Base):
    ''' stores keywords members create to tag their media '''
    __tablename__ = "keyword"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    keyword = Column(String(64))

class KeywordArt(Base):
    ''' join table to connect art pieces to their keywords '''
    __tablename__ = "keyword_art"

    keyword_id = Column(UUID(as_uuid=True), ForeignKey('keyword.id'), primary_key=True)
    art_id = Column(UUID(as_uuid=True), ForeignKey('art.id'), primary_key=True)
# =============================================

class Comment(Base):
    __tablename__ = "comment"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    art_id = Column(UUID(as_uuid=True), ForeignKey('art.id', ondelete='CASCADE'), nullable=False)
    member_id = Column(UUID(as_uuid=True), ForeignKey('member.id', ondelete='CASCADE'), nullable=False)
    text = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class Application(Base):
    __tablename__ = "application"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    firstname = Column(String(255), nullable=False)
    lastname = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False)
    city = Column(String(255))
    state = Column(String(255))
    known_member = Column(String(255))
    reason = Column(Text)
    status = Column(String(20), nullable=False, default="pending")
    created_at = Column(DateTime, default=datetime.utcnow)
    member_id = Column(UUID(as_uuid=True), ForeignKey('member.id'))


class MediaRequest(Base):
    __tablename__ = "media_request"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    member_id = Column(UUID(as_uuid=True), ForeignKey('member.id'), nullable=False)
    requested_name = Column(String(300), nullable=False)
    status = Column(String(20), nullable=False, default="pending")
    # The medium type the requester picked at submission ("visual_2d" |
    # "written_form" | "audio"). Nullable for rows predating this field; the
    # admin can still override it at approval time.
    requested_type = Column(String(50), nullable=True)
    resolved_type = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class FeatureRequest(Base):
    __tablename__ = "feature_request"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    member_id = Column(UUID(as_uuid=True), ForeignKey('member.id', ondelete='CASCADE'), nullable=False)
    title = Column(String(300), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class FeatureRequestVote(Base):
    __tablename__ = "feature_request_vote"

    # Composite PK = one vote per member per request. Re-voting the same
    # direction retracts; the opposite direction switches (handled in db_ops).
    request_id = Column(UUID(as_uuid=True), ForeignKey('feature_request.id', ondelete='CASCADE'), primary_key=True)
    member_id = Column(UUID(as_uuid=True), ForeignKey('member.id', ondelete='CASCADE'), primary_key=True)
    value = Column(Integer, nullable=False)  # +1 up, -1 down
    created_at = Column(DateTime, default=datetime.utcnow)


class Report(Base):
    __tablename__ = "report"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    reporter_id = Column(UUID(as_uuid=True), ForeignKey('member.id'), nullable=False)
    # 'art' | 'comment'. target_id intentionally not a FK so the admin row survives
    # if the underlying art/comment is deleted before triage.
    target_type = Column(String(20), nullable=False)
    target_id = Column(UUID(as_uuid=True), nullable=False)
    reason = Column(Text)
    status = Column(String(20), nullable=False, default="pending")  # pending|resolved|dismissed
    created_at = Column(DateTime, default=datetime.utcnow)


class BlockedMember(Base):
    __tablename__ = "blocked_member"

    blocker_id = Column(UUID(as_uuid=True), ForeignKey('member.id', ondelete='CASCADE'), primary_key=True)
    blockee_id = Column(UUID(as_uuid=True), ForeignKey('member.id', ondelete='CASCADE'), primary_key=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Bookmark(Base):
    __tablename__ = "bookmark"

    # Composite PK = one bookmark per member per piece. Pure M:N between member
    # and the polymorphic art base, so any medium (visual/written/audio) can be
    # bookmarked uniformly. DB-level CASCADE keeps rows honest when a piece or
    # account is deleted outside the ORM.
    member_id = Column(UUID(as_uuid=True), ForeignKey('member.id', ondelete='CASCADE'), primary_key=True)
    art_id = Column(UUID(as_uuid=True), ForeignKey('art.id', ondelete='CASCADE'), primary_key=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Event(Base):
    __tablename__ = "event"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    creator_id = Column(UUID(as_uuid=True), ForeignKey('member.id'), nullable=False)
    title = Column(String(300), nullable=False)
    description = Column(Text)
    # Separate date + time (time optional) rather than one timestamp — an event
    # can have a day without a set hour.
    event_date = Column(Date, nullable=False)
    event_time = Column(Time)
    image_path = Column(String(500))
    # Host-configurable accent color for the event's card/detail (e.g. '#rrggbb').
    # NULL = client uses its default palette.
    color = Column(String(20))
    # Public events are visible to every member; private ones only to the
    # creator, hosts, and invitees (see db_ops/events.py visibility rule).
    is_public = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class EventHost(Base):
    __tablename__ = "event_host"

    event_id = Column(UUID(as_uuid=True), ForeignKey('event.id', ondelete='CASCADE'), primary_key=True)
    member_id = Column(UUID(as_uuid=True), ForeignKey('member.id', ondelete='CASCADE'), primary_key=True)


class EventInvite(Base):
    __tablename__ = "event_invite"

    event_id = Column(UUID(as_uuid=True), ForeignKey('event.id', ondelete='CASCADE'), primary_key=True)
    member_id = Column(UUID(as_uuid=True), ForeignKey('member.id', ondelete='CASCADE'), primary_key=True)


# --- Observability -------------------------------------------------------------

class UsageEvent(Base):
    """Behavioral trail: logins + in-app navigation (screen focus). Every
    logged-in client emits these; contributors read the rollups (#7).

    Brand-new table — create_all builds it; no migration needed (paper trail
    lives in migrations/022_usage_events.sql)."""
    __tablename__ = "usage_event"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    member_id = Column(UUID(as_uuid=True), ForeignKey('member.id', ondelete='CASCADE'), nullable=False, index=True)
    # 'login' | 'screen'
    kind = Column(String(20), nullable=False)
    # Route name for screen-focus events; NULL for logins.
    screen = Column(String(120))
    # Client-reported occurrence time (falls back to server time on ingest).
    occurred_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    # Server receive time — authoritative for skew-proof rollups.
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class DeviceEvent(Base):
    """Device/perf telemetry: crashes, memory-pressure warnings, perf samples
    (#6). Separate table from UsageEvent — different shape, different reader.

    Brand-new table — create_all builds it (paper trail:
    migrations/023_device_events.sql)."""
    __tablename__ = "device_event"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    member_id = Column(UUID(as_uuid=True), ForeignKey('member.id', ondelete='CASCADE'), nullable=False, index=True)
    # 'crash' | 'memory_warning' | 'perf'
    kind = Column(String(30), nullable=False, index=True)
    platform = Column(String(20))        # 'ios' | 'android'
    app_version = Column(String(40))     # e.g. '1.0.4'
    os_version = Column(String(40))      # e.g. '18.2'
    device_model = Column(String(80))    # e.g. 'iPhone15,2'
    # Free-form context: crash message, memory MB, perf metric, etc.
    detail = Column(Text)
    occurred_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)