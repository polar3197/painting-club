# src/db/models.py
from sqlalchemy import Column, String, Text, ForeignKey, Date, Numeric, DateTime, Boolean, Float
from datetime import datetime
from sqlalchemy.dialects.postgresql import UUID
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

class Collection(Base):
    """Groups pieces under a shared name within one (creator, medium). Only the
    WrittenForm UI uses this today, but the column lives on Art so any subtype
    can adopt it later."""
    __tablename__ = "collection"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    creator_id = Column(UUID(as_uuid=True), ForeignKey('member.id'), nullable=False)
    media_id = Column(UUID(as_uuid=True), ForeignKey('media.id'), nullable=False)
    name = Column(String(300), nullable=False)


class Art(Base):
    __tablename__ = "art"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    creator_id = Column(UUID(as_uuid=True), ForeignKey('member.id'), nullable=False)
    media_id = Column(UUID(as_uuid=True), ForeignKey('media.id'), nullable=False)
    collection_id = Column(UUID(as_uuid=True), ForeignKey('collection.id'), nullable=True)
    title = Column(String(300), default="Untitled")
    date = Column(Date)
    file_path = Column(String(300))
    comments_enabled = Column(Boolean, nullable=False, default=False)
    type = Column(String(50), nullable=False)  # discriminator column

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

    __mapper_args__ = {"polymorphic_identity": "written_form"}



class Prompt(Base):
    # list of questions for members to choose from on their page
    __tablename__ = "prompt"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    question = Column(String(255))

class PromptRecords(Base):
    # a join table to connect users to the prompt they chose and their answer
    __tablename__ = "prompt_records"

    member_id = Column(UUID(as_uuid=True), ForeignKey('member.id'), primary_key=True)
    prompt_id = Column(UUID(as_uuid=True), ForeignKey('prompt.id'), primary_key=True)
    response = Column(String(300))

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