from pydantic import BaseModel, field_validator, field_serializer
from datetime import date as Date, datetime, time as TimeOfDay
from typing import List
import re
import uuid

from api.signed_urls import sign_path

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

    @field_serializer("profile_pic_path")
    def _sign_profile_pic(self, v):
        return sign_path(v)

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

class ForgotPasswordIn(BaseModel):
    # Either identifier works; username is what the app sends (every member
    # has one — email is optional in the schema).
    email: str | None = None
    username: str | None = None

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
    # Medium type chosen by the requester: "visual_2d" | "written_form" | "audio".
    type: str | None = None

class MediaRequestOut(BaseModel):
    id: uuid.UUID
    member_id: uuid.UUID
    username: str
    requested_name: str
    status: str
    requested_type: str | None = None
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
    # Requester identity — only populated for admin callers; None for members
    # so the board stays anonymous to everyone else.
    username: str | None = None
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

class GroupInviteIn(BaseModel):
    usernames: list[str]

class ParticipantOut(BaseModel):
    username: str
    firstname: str | None = None
    lastname: str | None = None
    role: str = "member"

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
    edited_at: datetime | None = None

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
    # Art subtype discriminator (visual_2d | written_form | audio) so mixed
    # result sets (any-medium prompt submissions) can render per-form.
    art_type: str | None = None

    @field_serializer("file_path")
    def _sign_file_path(self, v):
        return sign_path(v)

class ApplicationIn(BaseModel):
    firstname: str
    lastname: str
    email: str
    city: str | None = None
    state: str | None = None
    known_member: str | None = None
    reason: str | None = None

class PasswordResetOut(BaseModel):
    username: str
    email: str | None
    firstname: str | None
    lastname: str | None
    code: str
    expires_at: datetime | None

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
    series_id: uuid.UUID | None = None
    series_name: str | None = None
    order_index: int | None = None

    @field_serializer("file_path")
    def _sign_file_path(self, v):
        return sign_path(v)


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
    # Optional image used as the piece's card cover. None = text-snippet card.
    cover_image_path: str | None = None

    @field_serializer("file_path", "cover_image_path")
    def _sign_paths(self, v):
        return sign_path(v)


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
    # Album membership (an album is a series of audio pieces).
    series_id: uuid.UUID | None = None
    series_name: str | None = None
    order_index: int | None = None

    @field_serializer("file_path")
    def _sign_file_path(self, v):
        return sign_path(v)


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
    media_name: str | None = None  # null = medium-agnostic
    is_active: bool
    created_at: datetime


class PromptOut(BaseModel):
    id: uuid.UUID
    title: str
    short_summary: str | None = None
    # Null when the prompt is medium-agnostic (promoted from a suggestion with
    # no medium).
    media_id: uuid.UUID | None = None
    media_name: str | None = None
    is_active: bool
    submission_count: int = 0
    # When the prompt BECAME ACTIVE (naive UTC, like every other timestamp here)
    # — not when its row was created, which for a prompt queued up in advance is
    # whenever an admin drafted it. Drives the client's 7-day lifespan ring.
    # Optional: null for a never-activated prompt, and a construction site that
    # misses it degrades to "no age known" rather than 500-ing.
    activated_at: datetime | None = None


class PromptDetailOut(PromptOut):
    submissions: list[ArtResult] = []
    viewer_submission_id: uuid.UUID | None = None


class PromptCreate(BaseModel):
    title: str
    short_summary: str | None = None
    medium: str  # medium name; resolved to media_id server-side
    activate: bool = False


class PromptSuggestionIn(BaseModel):
    prompt_text: str
    # NULL/absent = "medium agnostic".
    media_id: uuid.UUID | None = None


class PromptSuggestionOut(BaseModel):
    id: uuid.UUID
    # Suggester — populated in the admin queue view.
    username: str | None = None
    media_id: uuid.UUID | None = None
    media_name: str | None = None  # None = medium agnostic
    prompt_text: str
    status: str
    order_index: int | None = None
    created_at: datetime


class AdminPromptQueueOut(BaseModel):
    proposed: list[PromptSuggestionOut] = []
    # Approved queue, in order_index order.
    up_next: list[PromptSuggestionOut] = []


class PromptSuggestionReview(BaseModel):
    status: str  # approved | rejected


class PromptSuggestionReorder(BaseModel):
    # The full approved queue in the desired order (mirrors SeriesOrderUpdate).
    suggestion_ids: list[uuid.UUID]


class AnnouncementIn(BaseModel):
    title: str
    body: str


class AnnouncementCommentIn(BaseModel):
    text: str


class AnnouncementCommentOut(BaseModel):
    id: uuid.UUID
    username: str
    firstname: str | None = None
    text: str
    created_at: datetime


class AnnouncementOut(BaseModel):
    id: uuid.UUID
    title: str
    body: str
    author_username: str | None = None
    author_firstname: str | None = None
    comment_count: int = 0
    created_at: datetime


class AnnouncementDetailOut(AnnouncementOut):
    comments: list[AnnouncementCommentOut] = []


# --- Docs (editable "about the app" sections) ---------------------------------

class DocIn(BaseModel):
    title: str
    body: str


class DocCreateIn(BaseModel):
    section: str  # 'ethos' | 'art' | 'aims'
    title: str
    body: str = ""


class DocOut(BaseModel):
    slug: str
    section: str | None = None
    title: str
    body: str
    order_index: int = 0
    updated_at: datetime | None = None


# --- Bookmarks ----------------------------------------------------------------

class BookmarkedArtOut(BaseModel):
    """A bookmarked piece, shaped like a gallery card: enough to render the
    art element (any medium) plus who made it and when it was saved."""
    art_id: uuid.UUID
    title: str
    # Art.type discriminator: "visual_2d" | "written_form" | "audio".
    art_type: str
    medium: str
    file_path: str | None = None
    date: Date | None = None
    creator_username: str
    # Populated for visual pieces (NULL for written/audio — clients already
    # handle a missing ratio by measuring).
    aspect_ratio: float | None = None
    # Cover image for written pieces — the saved card renders it instead of the
    # text snippet. NULL for other mediums / cover-less pieces.
    cover_image_path: str | None = None
    # Set when the piece belongs to a collection/album/series, so the client can
    # regroup saved pieces into one tile. NULL for standalone pieces.
    series_id: uuid.UUID | None = None
    series_name: str | None = None
    bookmarked_at: datetime

    @field_serializer("file_path", "cover_image_path")
    def _sign_paths(self, v):
        return sign_path(v)


# --- Events --------------------------------------------------------------------

class EventIn(BaseModel):
    title: str
    description: str | None = None
    event_date: Date
    event_time: TimeOfDay | None = None
    is_public: bool = False
    # Optional host-configurable accent color (e.g. "#rrggbb").
    color: str | None = None
    # Additional host usernames — the creator is always added as a host.
    hosts: list[str] = []

class EventUpdate(BaseModel):
    # All optional: only fields the client sends are applied (exclude_unset).
    title: str | None = None
    description: str | None = None
    event_date: Date | None = None
    event_time: TimeOfDay | None = None
    is_public: bool | None = None
    color: str | None = None

class EventMembersIn(BaseModel):
    usernames: list[str]

class EventOut(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None = None
    event_date: Date
    event_time: TimeOfDay | None = None
    image_path: str | None = None
    color: str | None = None
    is_public: bool
    creator_username: str
    hosts: list[str] = []
    # Only present when the viewer is a host/creator — invitees aren't shown
    # the rest of the guest list.
    invited: list[str] | None = None
    # Convenience for clients: can the viewer edit/host-manage this event?
    can_edit: bool = False
    created_at: datetime

class MediaOrderIn(BaseModel):
    # The member's media names in the desired tab order (front to back).
    mediums: list[str]


class AdminMemberOut(BaseModel):
    username: str
    firstname: str | None = None
    lastname: str | None = None
    role: str

class MemberRoleUpdate(BaseModel):
    role: str  # 'member' | 'contributor' | 'admin'

class MemberRoleOut(BaseModel):
    username: str
    role: str


# --- Infra health (Raspberry Pi host metrics; contributor "infra stats") -------

class CpuHealth(BaseModel):
    percent: float | None = None
    cores: int | None = None
    load_1: float | None = None
    load_5: float | None = None
    load_15: float | None = None

class MemoryHealth(BaseModel):
    total: int | None = None       # bytes
    used: int | None = None
    available: int | None = None
    percent: float | None = None

class DiskHealth(BaseModel):
    path: str | None = None
    total: int | None = None       # bytes
    used: int | None = None
    free: int | None = None
    percent: float | None = None

class ContentHealth(BaseModel):
    # Size of the Docker static-files volume (uploaded art / profile images) —
    # the main driver of disk growth on the Pi.
    path: str | None = None
    bytes: int | None = None
    files: int | None = None
    truncated: bool = False

class InfraHealthOut(BaseModel):
    ok: bool = True
    # False when host /proc was unreadable (e.g. running off-Linux in dev), so
    # the client shows "unavailable" rather than misleading zeros.
    host_metrics_available: bool = True
    kernel: str | None = None
    uptime_seconds: int | None = None
    temperature_c: float | None = None
    cpu: CpuHealth = CpuHealth()
    memory: MemoryHealth = MemoryHealth()
    # `disk` = the system/SD-card filesystem (code + OS). `content_disk` = the
    # drive that actually holds uploads (a USB SSD bind-mounted at the static
    # volume) — the one that fills up as people post art.
    disk: DiskHealth = DiskHealth()
    content_disk: DiskHealth = DiskHealth()
    content: ContentHealth = ContentHealth()


# --- Observability -------------------------------------------------------------

class UsageEventIn(BaseModel):
    # 'login' | 'screen' (unknown kinds dropped server-side)
    kind: str
    # Route name for screen events; ignored for logins.
    screen: str | None = None
    # Client-reported occurrence time; server falls back to receive time.
    at: datetime | None = None

class UsageBatchIn(BaseModel):
    events: List[UsageEventIn]

class DeviceEventIn(BaseModel):
    # 'crash' | 'memory_warning' | 'perf'
    kind: str
    platform: str | None = None
    app_version: str | None = None
    os_version: str | None = None
    device_model: str | None = None
    detail: str | None = None
    at: datetime | None = None

class DeviceBatchIn(BaseModel):
    events: List[DeviceEventIn]


class InspirationIn(BaseModel):
    """One edge for the inspiration web: from = the caller's own piece,
    to = exactly one of a club piece / an external-catalog piece.
    to_node_id is the untyped alternative — the server resolves which table
    it lives in (the client's frozen addInspiration(from, to) signature
    doesn't carry the node kind)."""
    from_art_id: str
    to_art_id: str | None = None
    to_external_id: str | None = None
    to_node_id: str | None = None
