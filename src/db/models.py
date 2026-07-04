# src/db/models.py
from sqlalchemy import Column, String, Text, ForeignKey, Date, Numeric, DateTime, Boolean, Float, Integer
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


class Art(Base):
    __tablename__ = "art"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    creator_id = Column(UUID(as_uuid=True), ForeignKey('member.id'), nullable=False)
    media_id = Column(UUID(as_uuid=True), ForeignKey('media.id'), nullable=False)
    series_id = Column(UUID(as_uuid=True), ForeignKey('series.id'), nullable=True)
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