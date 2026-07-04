from pydantic import BaseModel, field_validator
from datetime import date as Date, datetime
from typing import List
import re
import uuid

# Recolorable profile page components — mirrors PROFILE_COLOR_ELEMENTS in
# ios-v1/src/constants/profileColors.ts. Unknown keys are rejected so clients
# can't stuff arbitrary data into the JSONB column.
PROFILE_COLOR_KEYS = {
    "bg",
    "statementBox",
    "mediaTab",
    "mediaTabSelected",
    "picFrame",
    "artCardBg",
    "actionBtn",
}
# '#rgb', '#rrggbb', or 'rgb(r, g, b)' — the formats clients send today.
_COLOR_VALUE_RE = re.compile(
    r"^(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\))$"
)

class MemberIn(BaseModel):
    username: str
    password: str

class FullMemberIn(BaseModel):
    username: str
    password: str
    bio: str
    city: str
    state: str
    firstname: str
    lastname: str

class MemberOut(BaseModel):
    id: uuid.UUID
    username: str

class Profile(BaseModel):
    id: uuid.UUID
    username: str
    firstname: str | None
    lastname: str | None
    media: List[str] = []
    hidden_media: List[str] = []
    city: str | None
    state: str | None
    bio: str | None
    is_owner: bool = False
    role: str = "member"
    profile_pic_path: str | None = None
    terms_accepted_at: datetime | None = None
    viewer_blocked_by_owner: bool = False
    blocked_usernames: list[str] | None = None
    profile_colors: dict[str, str] | None = None

class ProfileUpdate(BaseModel):
    firstname: str | None
    lastname: str | None
    bio: str | None
    city: str | None
    state: str | None
    # Optional so pre-colors app builds (which never send it) stay valid;
    # db_update_profile uses exclude_unset so an absent field is left alone.
    profile_colors: dict[str, str] | None = None

    @field_validator("profile_colors")
    @classmethod
    def _validate_profile_colors(cls, v: dict[str, str] | None):
        if v is None:
            return v
        unknown = set(v) - PROFILE_COLOR_KEYS
        if unknown:
            raise ValueError(f"unknown profile color keys: {sorted(unknown)}")
        for key, value in v.items():
            if not isinstance(value, str) or not _COLOR_VALUE_RE.match(value):
                raise ValueError(f"invalid color value for '{key}'")
        return v

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    must_setup: bool = False


class SetupAccountIn(BaseModel):
    new_username: str
    new_password: str

class SetupCodeIn(BaseModel):
    code: str

class MemberFilters(BaseModel):
    uname: str | None
    city: str | None

class AddMedia(BaseModel):
    username: str | None
    medium: str | None

class MediaOut(BaseModel):
    id: uuid.UUID
    name: str
    type: str | None = None

class MediaIn(BaseModel):
    name: str

class MediaRequestIn(BaseModel):
    name: str

class MediaRequestOut(BaseModel):
    id: uuid.UUID
    member_id: uuid.UUID
    username: str
    requested_name: str
    status: str
    resolved_type: str | None = None
    created_at: datetime

class MediaRequestUpdate(BaseModel):
    status: str
    type: str | None = None
    name: str | None = None  # admin may rename before approving


class FeatureRequestIn(BaseModel):
    title: str

class FeatureRequestOut(BaseModel):
    id: uuid.UUID
    username: str
    title: str
    up: int = 0
    down: int = 0
    my_vote: int | None = None  # +1 | -1 | None
    is_owner: bool = False
    created_at: datetime

class FeatureRequestVoteIn(BaseModel):
    value: int  # +1 | -1

class FeatureRequestVoteOut(BaseModel):
    up: int
    down: int
    my_vote: int | None = None


class MemberDirectoryEntry(BaseModel):
    username: str
    firstname: str | None = None
    lastname: str | None = None

class DmOpenIn(BaseModel):
    username: str

class GroupCreateIn(BaseModel):
    title: str
    usernames: list[str]

class ConversationOut(BaseModel):
    id: uuid.UUID
    type: str  # 'dm' | 'group'
    title: str  # partner display name for dm, group title for group
    partner_username: str | None = None
    last_message: str | None = None
    last_message_at: datetime | None = None
    last_sender_username: str | None = None
    unread: int = 0

class MessageOut(BaseModel):
    id: uuid.UUID
    sender_username: str
    sender_firstname: str | None = None
    body: str
    created_at: datetime

class MessageIn(BaseModel):
    body: str

class MessagesPage(BaseModel):
    messages: List[MessageOut]  # newest first
    next_cursor: datetime | None
    # Read cursor BEFORE this fetch bumped it (first page only) — messages newer
    # than this were unseen. Mirrors CommentsReceivedPage.previous_view_at.
    previous_read_at: datetime | None


class MediaVisibilityUpdate(BaseModel):
    hidden: bool

class Visual2DIn(BaseModel):
    username: str
    medium: str
    title: str
    file_path: str
    date: Date | None = None
    location: str | None = None
    song: str | None = None
    song_artist: str | None = None
    width: int | None = None
    height: int | None = None
    keywords: list[str] | None

class SearchOptions(BaseModel):
    usernames: list[str] = []
    fullnames: list[str] = []
    cities: list[str] = []
    keywords: list[str] = []
    titles: list[str] = []
    songs: list[str] = []
    mediums: list[str] = []

class ArtResult(BaseModel):
    id: str
    title: str
    medium: str
    keywords: list[str] = []
    song: str | None
    file_path: str
    date: str | None = None
    location: str | None = None
    creator_username: str
    creator_city: str | None
    aspect_ratio: float | None = None

class ApplicationIn(BaseModel):
    firstname: str
    lastname: str
    email: str
    city: str | None = None
    state: str | None = None
    known_member: str | None = None
    reason: str | None = None

class ApplicationOut(BaseModel):
    id: uuid.UUID
    firstname: str
    lastname: str
    email: str
    city: str | None
    state: str | None
    known_member: str | None
    reason: str | None
    status: str
    created_at: datetime
    temp_username: str | None = None
    temp_password: str | None = None

class ApplicationStatusUpdate(BaseModel):
    status: str  # "approved" or "rejected"

class ApplicationApproveOut(BaseModel):
    application_id: uuid.UUID
    status: str
    temp_username: str
    temp_password: str
    temp_password_expires_at: datetime

class CommentIn(BaseModel):
    text: str


class ReportIn(BaseModel):
    target_type: str  # 'art' | 'comment'
    target_id: uuid.UUID
    reason: str | None = None


class ReportOut(BaseModel):
    id: uuid.UUID
    reporter_username: str
    target_type: str
    target_id: uuid.UUID
    target_preview: str | None = None
    reason: str | None = None
    status: str
    created_at: datetime


class ReportStatusUpdate(BaseModel):
    status: str  # 'resolved' | 'dismissed'


class BlockIn(BaseModel):
    username: str


class BlockOut(BaseModel):
    username: str
    created_at: datetime

class CommentOut(BaseModel):
    id: uuid.UUID
    username: str
    firstname: str | None
    text: str
    created_at: datetime


class CommentReceivedOut(BaseModel):
    id: uuid.UUID
    text: str
    created_at: datetime
    art_id: uuid.UUID
    art_title: str | None
    art_medium: str
    commenter_username: str
    commenter_firstname: str | None


class CommentsReceivedPage(BaseModel):
    comments: List[CommentReceivedOut]
    next_cursor: datetime | None
    # The PREVIOUS value of comments_last_viewed_at — clients compare each
    # comment.created_at against this to decide seen vs unseen colouring.
    # Only meaningful on the first page (cursor=null); subsequent pages echo it.
    previous_view_at: datetime | None


class Visual2DOut(BaseModel):
    id: uuid.UUID
    title: str
    date: Date | None
    location: str | None
    song: str | None
    song_artist: str | None
    height: float | None
    width: float | None
    keywords: list[str] | None
    file_path: str
    comments_enabled: bool = False
    aspect_ratio: float | None = None


class WrittenFormOut(BaseModel):
    id: uuid.UUID
    title: str
    date: Date | None
    keywords: list[str] | None
    file_path: str
    comments_enabled: bool = False
    series_id: uuid.UUID | None = None
    series_name: str | None = None
    order_index: int | None = None


class WrittenFormUpdate(BaseModel):
    title: str
    date: Date | None = None
    keywords: list[str] | None = None
    comments_enabled: bool = False
    medium: str | None = None
    series_name: str | None = None
    # Explicit signal to detach from any series. Sending series_name=""
    # is treated as "no change"; this flag is the unambiguous removal.
    clear_series: bool = False


class AudioOut(BaseModel):
    id: uuid.UUID
    title: str
    date: Date | None
    keywords: list[str] | None
    file_path: str
    comments_enabled: bool = False
    artist: str | None = None
    duration_seconds: float | None = None


class AudioUpdate(BaseModel):
    # Kept for parity/documentation; the PATCH route reads multipart Form fields
    # (so the audio file can be swapped), matching the written-form update flow.
    title: str
    date: Date | None = None
    keywords: list[str] | None = None
    comments_enabled: bool = False
    medium: str | None = None
    artist: str | None = None
    duration_seconds: float | None = None


class SeriesRename(BaseModel):
    name: str


class SeriesOrderUpdate(BaseModel):
    art_ids: list[uuid.UUID]


class PromptSummary(BaseModel):
    id: uuid.UUID
    title: str
    media_name: str
    is_active: bool
    created_at: datetime


class PromptOut(BaseModel):
    id: uuid.UUID
    title: str
    short_summary: str | None = None
    media_id: uuid.UUID
    media_name: str
    is_active: bool
    submission_count: int = 0


class PromptDetailOut(PromptOut):
    submissions: list[ArtResult] = []
    viewer_submission_id: uuid.UUID | None = None


class PromptCreate(BaseModel):
    title: str
    short_summary: str | None = None
    medium: str  # medium name; resolved to media_id server-side
    activate: bool = False

