from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, status, UploadFile, File, Form, Response
from fastapi.responses import FileResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from datetime import date, datetime
from contextlib import asynccontextmanager
from typing import Optional, List
from pathlib import Path
import io
import uuid
import magic
from PIL import Image
import pillow_heif
pillow_heif.register_heif_opener()

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from sqlalchemy import select
from jose import JWTError, jwt
from typing import List

from api.models import (
    MemberIn,
    FullMemberIn,
    MemberOut,
    Profile,
    ProfileUpdate,
    Token,
    MemberFilters,
    AddMedia,
    MediaOut,
    MediaIn,
    MediaRequestIn,
    MediaRequestOut,
    MediaRequestUpdate,
    FeatureRequestIn,
    FeatureRequestOut,
    FeatureRequestVoteIn,
    FeatureRequestVoteOut,
    MemberDirectoryEntry,
    DmOpenIn,
    GroupCreateIn,
    GroupInviteIn,
    ParticipantOut,
    ConversationOut,
    MessageIn,
    MessageOut,
    MessagesPage,
    MediaVisibilityUpdate,
    Visual2DOut,
    WrittenFormOut,
    AudioOut,
    SeriesRename,
    SeriesOrderUpdate,
    PromptOut,
    PromptDetailOut,
    PromptCreate,
    PromptSummary,
    SearchOptions,
    ArtResult,
    ApplicationIn,
    ApplicationOut,
    ApplicationStatusUpdate,
    ApplicationApproveOut,
    SetupAccountIn,
    SetupCodeIn,
    ForgotPasswordIn,
    PasswordResetOut,
    CommentOut,
    CommentReceivedOut,
    CommentsReceivedPage,
    CommentIn,
    ReportIn,
    ReportOut,
    ReportStatusUpdate,
    BlockIn,
)

from db.db_ops.members import (
    db_create_member,
    db_create_full_member,
    db_login_user,
    db_redeem_setup_code,
    db_start_password_reset,
    db_list_password_resets,
    db_get_members,
    db_complete_setup,
    db_export_member_data,
    db_delete_member,
    db_get_member_directory,
)

from db.db_ops.profile import (
    db_get_profile,
    db_update_profile,
    db_get_blocked_usernames,
)

from db.db_ops.blocks import (
    db_block_member,
    db_unblock_member,
    db_list_blocks,
    db_is_blocked,
    db_resolve_username,
)

from db.db_ops.reports import (
    db_create_report,
    db_list_reports,
    db_resolve_report,
    VALID_TARGETS as REPORT_VALID_TARGETS,
)

from db.db_ops.search import (
    db_search_members,
    db_get_search_options,
    db_search_art,
)

from db.db_ops.media_requests import (
    db_create_media_request,
    db_list_media_requests,
    db_resolve_media_request,
)

from db.db_ops.feature_requests import (
    db_create_feature_request,
    db_list_feature_requests,
    db_vote_feature_request,
    db_delete_feature_request,
)

from db.db_ops.messages import (
    db_get_or_create_dm,
    db_create_group,
    db_get_participants,
    db_add_group_members,
    db_list_conversations,
    db_get_unread_count,
    db_get_messages,
    db_send_message,
    db_leave_group,
)

from db.db_ops.applications import (
    db_submit_application,
    db_get_applications,
    db_update_application_status,
    db_approve_application,
    db_delete_application,
)

from db.db_ops.media import (
    db_add_medium,
    db_list_media,
    db_create_media,
    db_set_media_visibility,
    db_add_visual_2d,
    db_get_visual_2d,
    db_update_visual_2d,
    db_remove_visual_2d,
    db_add_written_form,
    db_get_written_form,
    db_update_written_form,
    db_remove_written_form,
    db_add_audio,
    db_get_audio,
    db_update_audio,
    db_remove_audio,
)

from db.db_ops.series import (
    db_rename_series,
    db_set_series_order,
)

from db.db_ops.prompts import (
    db_get_active_prompt,
    db_get_prompt,
    db_list_prompts,
    db_list_prompt_submissions,
    db_get_user_submission,
    db_create_prompt,
    db_activate_prompt,
    db_archive_prompt,
    db_validate_submission_medium,
)

from db.db_ops.comments import (
    db_get_comments,
    db_add_comment,
    db_delete_comment,
    db_get_comments_received,
    db_touch_comments_viewed,
)
    
from db.session import get_db
from db.db_manager import init_db, empty_db, run_migrations, pre_init_migrations
from db.models import Member, Media, Media_Members, Art, Comment, Visual2D, WrittenForm, WeeklyPrompt

from api.auth import create_token, decode_token


bearer = HTTPBearer()
bearer_optional = HTTPBearer(auto_error=False)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await pre_init_migrations()
    await init_db()
    await run_migrations()
    yield
    # await empty_db()

app = FastAPI(
    lifespan=lifespan,
    title="painting-club",
    root_path="/api",
    openapi_url=None,
    docs_url=None,
    redoc_url=None,
)

@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}

# ====================== MEMBER DETAILS =========================

async def get_current_member(credentials: HTTPAuthorizationCredentials = Depends(bearer), db: AsyncSession = Depends(get_db)):
    member_id = decode_token(credentials.credentials)
    result = await db.execute(select(Member).filter(Member.id == member_id))
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=401)
    return member

async def get_optional_member(credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_optional), db: AsyncSession = Depends(get_db)) -> Optional[Member]:
    if not credentials:
        return None
    try:
        member_id = decode_token(credentials.credentials)
        result = await db.execute(select(Member).filter(Member.id == member_id))
        return result.scalar_one_or_none()
    except Exception:
        return None

async def get_admin_member(current_member: Member = Depends(get_current_member)):
    if current_member.role != "admin":
        raise HTTPException(status_code=403, detail="Admins only")
    return current_member

@app.post("/members/newfull", response_model=MemberOut, status_code=status.HTTP_201_CREATED)
async def create_member_endpoint(payload: FullMemberIn, db: AsyncSession = Depends(get_db), _: Member = Depends(get_admin_member)) -> MemberOut:
    try:
        member = await db_create_full_member(db, payload.username, payload.password, payload.bio, payload.city, payload.state, payload.firstname, payload.lastname)
        return MemberOut(id=member.id, username=member.username)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Username already exists")

@app.post("/members/new", response_model=MemberOut, status_code=status.HTTP_201_CREATED)
async def create_full_member_endpoint(payload: MemberIn, db: AsyncSession = Depends(get_db), _: Member = Depends(get_admin_member)) -> MemberOut:
    try:
        member = await db_create_member(db, payload.username, payload.password)
        return MemberOut(id=member.id, username=member.username)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Username already exists")

@app.post("/members/login", response_model=Token)
async def login_member_endpoint(payload: MemberIn, db: AsyncSession = Depends(get_db)) -> Token:
    member = await db_login_user(db, payload.username, payload.password)
    if not member:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if member.must_change_password:
        from datetime import datetime as _dt
        if member.temp_password_expires_at and member.temp_password_expires_at < _dt.utcnow():
            raise HTTPException(status_code=401, detail="Temporary password has expired — contact an admin")
    token = create_token(member)
    return Token(access_token=token, must_setup=bool(member.must_change_password))


@app.post("/members/redeem-setup-code", response_model=Token)
async def redeem_setup_code_endpoint(payload: SetupCodeIn, db: AsyncSession = Depends(get_db)) -> Token:
    member = await db_redeem_setup_code(db, payload.code)
    if not member:
        raise HTTPException(status_code=401, detail="Invalid or expired setup code")
    token = create_token(member)
    return Token(access_token=token, must_setup=True)


@app.post("/members/forgot-password")
async def forgot_password_endpoint(
    payload: ForgotPasswordIn,
    db: AsyncSession = Depends(get_db),
):
    """Self-serve password reset request. Always answers {ok: true} so the
    endpoint can't probe which emails have accounts. When the email matches a
    member, a fresh setup code is generated and lodged in the admin panel's
    "password resets" section for manual delivery; the user finishes through
    the existing 'secret code?' -> setup-account flow."""
    # Email delivery is intentionally OFF for now — the code lands in the
    # admin panel's "password resets" section and the admin sends it manually.
    # (Restore the background send_email task here once EMAIL_* is configured.)
    await db_start_password_reset(db, email=payload.email, username=payload.username)
    return {"ok": True}


@app.post("/members/refresh-token", response_model=Token)
async def refresh_token_endpoint(current_member: Member = Depends(get_current_member)):
    """Sliding session: exchange a still-valid token for a fresh 30-day one.
    The app calls this on every launch, so active members never hit the JWT
    expiry — only someone away for 30+ days has to log in again."""
    return Token(
        access_token=create_token(current_member),
        must_setup=bool(current_member.must_change_password),
    )


@app.post("/members/setup-account", response_model=MemberOut)
async def setup_account_endpoint(
    payload: SetupAccountIn,
    db: AsyncSession = Depends(get_db),
    current_member: Member = Depends(get_current_member),
):
    if not current_member.must_change_password:
        raise HTTPException(status_code=400, detail="Account setup already complete")

    new_username = payload.new_username.strip().lower()
    if len(new_username) < 1:
        raise HTTPException(status_code=400, detail="Username cannot be empty")
    if len(payload.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    try:
        member = await db_complete_setup(db, current_member, new_username, payload.new_password)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return MemberOut(id=member.id, username=member.username)

# @app.get("/members", response_model=list[MemberOut])
# async def list_members(db: AsyncSession = Depends(get_db)) -> list[MemberOut]:
#     members = await get_members(db)
#     return [MemberOut(id=m.id, username=m.username) for m in members]

@app.get("/members/search-options", response_model=SearchOptions)
async def get_search_options(medium: str | None = None, username: str | None = None, db: AsyncSession = Depends(get_db)):
    usernames, fullnames, cities, keywords, titles, songs, mediums = await db_get_search_options(db, medium=medium, username=username)
    if not usernames and not cities:
        raise HTTPException(status_code=404)
    return SearchOptions(usernames=usernames, fullnames=fullnames, cities=cities, keywords=keywords, titles=titles, songs=songs, mediums=mediums)

@app.get("/art/search", response_model=list[ArtResult])
async def search_art(q: str = "", db: AsyncSession = Depends(get_db)):
    results = await db_search_art(db, q)
    return results

@app.get("/members/{username}/profile")
async def get_profile(username: str, db: AsyncSession = Depends(get_db), current_member: Optional[Member] = Depends(get_optional_member)) -> Profile:
    result = await db_get_profile(db, username)
    if not result:
        raise HTTPException(status_code=404)
    member_row, media, hidden_media = result

    is_owner = current_member is not None and (member_row.username == current_member.username)

    viewer_blocked_by_owner = False
    if current_member is not None and not is_owner:
        viewer_blocked_by_owner = await db_is_blocked(
            db, blocker_id=member_row.id, blockee_id=current_member.id
        )

    blocked_usernames = await db_get_blocked_usernames(db, member_row.id) if is_owner else None

    return Profile(
        id=member_row.id,
        username=member_row.username,
        firstname=member_row.firstname,
        lastname=member_row.lastname,
        bio=member_row.bio or "",
        city=member_row.city,
        state=member_row.state,
        media=media,
        hidden_media=hidden_media if is_owner else [],
        is_owner=is_owner,
        role=member_row.role or "member",
        profile_pic_path=versioned_pic_path(member_row.profile_pic_path),
        terms_accepted_at=member_row.terms_accepted_at if is_owner else None,
        viewer_blocked_by_owner=viewer_blocked_by_owner,
        blocked_usernames=blocked_usernames,
        profile_colors=member_row.profile_colors,
    )

@app.post("/members/accept-terms")
async def accept_terms(
    db: AsyncSession = Depends(get_db),
    current_member: Member = Depends(get_current_member),
):
    from datetime import datetime as _dt
    if current_member.terms_accepted_at is None:
        current_member.terms_accepted_at = _dt.utcnow()
        await db.commit()
    return {"terms_accepted_at": current_member.terms_accepted_at}


@app.get("/members/me/export")
async def export_my_data(
    db: AsyncSession = Depends(get_db),
    current_member: Member = Depends(get_current_member),
):
    return await db_export_member_data(db, current_member.id)


@app.delete("/members/me")
async def delete_my_account(
    db: AsyncSession = Depends(get_db),
    current_member: Member = Depends(get_current_member),
):
    if current_member.role == "admin":
        raise HTTPException(status_code=403, detail="admin accounts cannot self-delete")
    member_id = current_member.id
    paths, art_ids = await db_delete_member(db, member_id)
    for p in paths:
        try:
            abs_path(p).unlink(missing_ok=True)
        except Exception as e:
            print(f"[delete_my_account] failed to remove {p}: {type(e).__name__}: {e}")
    for aid in art_ids:
        try:
            thumb_file(aid).unlink(missing_ok=True)
        except Exception:
            pass
    try:
        profile_thumb_file(str(member_id)).unlink(missing_ok=True)
    except Exception:
        pass
    return {"ok": True}


@app.patch("/members/update-username")
async def update_username(
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_member: Member = Depends(get_current_member),
):
    new_username = (payload.get("username") or "").strip().lower()
    if not new_username or len(new_username) > 50:
        raise HTTPException(status_code=400, detail="Invalid username")
    existing = await db.execute(select(Member).filter(Member.username == new_username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Username taken")
    current_member.username = new_username
    await db.commit()
    return {"username": new_username}


@app.patch("/members/{username}/update-profile")
async def update_profile(
    username: str, 
    updated_profile: ProfileUpdate,
    db: AsyncSession = Depends(get_db),
    current_member: Member = Depends(get_current_member),
):
    if current_member.username != username:
        raise HTTPException(status_code=403)
    member = await db_update_profile(db, username=username, payload=updated_profile)
    if not member:
        raise HTTPException(status_code=404)
    return {"ok": True}


@app.get("/members/{username}/art/{medium}", response_model=list[Visual2DOut])
async def get_visual_2d(
    username: str, 
    medium: str, 
    db: AsyncSession = Depends(get_db), 
) -> list[Visual2DOut]:
    results = await db_get_visual_2d(db, username, medium)
    if results is None:
        raise HTTPException(status_code=404)
    
    visual_2ds = []
    for result in results:
        visual_2d_row = result[0]
        keywords = result[1]
        visual_2d = Visual2DOut (
            id=visual_2d_row.id,
            title=visual_2d_row.title,
            date=visual_2d_row.date,
            location=visual_2d_row.location,
            song=visual_2d_row.song,
            song_artist=visual_2d_row.song_artist,
            height=visual_2d_row.height,
            width=visual_2d_row.width,
            keywords=keywords,
            file_path=visual_2d_row.file_path,
            comments_enabled=visual_2d_row.comments_enabled,
            aspect_ratio=visual_2d_row.aspect_ratio,
        )
        visual_2ds.append(visual_2d)
    print(visual_2ds)
    return visual_2ds

@app.get("/members")
async def search_members(
    city: str = None,
    uname: str = None,
    db: AsyncSession = Depends(get_db),
    current_member: Optional[Member] = Depends(get_optional_member)
) -> List[Profile]:

    results = await db_search_members(
        db=db,
        city=city if city else None,
        uname=uname if uname else None,
    )
    if not results:
        raise HTTPException(status_code=404)

    profiles = []
    for member_row in results:
        is_owner = current_member is not None and (member_row.username == current_member.username)
        media_result = await db.execute(
            select(Media.name)
            .join(Media_Members, Media.id == Media_Members.media_id)
            .filter(Media_Members.member_id == member_row.id, Media_Members.hidden == False)
        )
        media = media_result.scalars().all()
        profile = Profile(
            id=member_row.id,
            username=member_row.username,
            firstname=member_row.firstname,
            lastname=member_row.lastname,
            bio=member_row.bio or "",
            city=member_row.city,
            state=member_row.state,
            media=list(media),
            is_owner=is_owner,
            role=member_row.role or "member",
            profile_pic_path=versioned_pic_path(member_row.profile_pic_path),
        )
        profiles.append(profile)
    print(profiles)
    return profiles
    

@app.get("/media", response_model=list[MediaOut])
async def list_media(db: AsyncSession = Depends(get_db)):
    rows = await db_list_media(db)
    return [MediaOut(id=r.id, name=r.name, type=r.type) for r in rows]


@app.post("/media", response_model=MediaOut)
async def create_media(
    payload: MediaIn,
    db: AsyncSession = Depends(get_db),
    current_member: Member = Depends(get_current_member),
):
    if (current_member.role or "member") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name required")
    row = await db_create_media(db, name)
    return MediaOut(id=row.id, name=row.name, type=row.type)


@app.post("/members/addmedia")
async def add_member_media_endpoint(
    payload: AddMedia,
    db: AsyncSession = Depends(get_db),
    current_member: Member = Depends(get_current_member),
):
    if not payload.username or not payload.medium:
        raise HTTPException(status_code=400, detail="username and medium required")
    if current_member.username != payload.username:
        raise HTTPException(status_code=403, detail="Not your profile")
    try:
        success = await db_add_medium(db, payload.username, payload.medium)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return success


@app.patch("/members/media/{medium}")
async def set_member_media_visibility(
    medium: str,
    payload: MediaVisibilityUpdate,
    db: AsyncSession = Depends(get_db),
    current_member: Member = Depends(get_current_member),
):
    try:
        await db_set_media_visibility(db, current_member.id, medium, payload.hidden)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"ok": True, "medium": medium, "hidden": payload.hidden}

ALLOWED_MIME_TYPES = {"image/png", "image/jpeg", "image/jpg", "application/pdf", "image/heic", "image/heif"}
MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 MB
HEIC_MIMES = {"image/heic", "image/heif"}

# Written-form uploads. libmagic returns 'text/plain' for .md files, so we
# allowlist by extension too and map ext -> stored ext when the MIME is ambiguous.
WRITTEN_FORM_MIME_TO_EXT = {
    "application/pdf": "pdf",
    "text/plain": "txt",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    # docx is sometimes detected as zip by libmagic; the extension check below handles it
    "application/zip": "docx",
}
WRITTEN_FORM_EXTS = {"pdf", "txt", "md", "docx"}

# Audio uploads (voice memos + music). libmagic's audio detection is messy:
# .m4a/.aac containers are MP4 boxes often reported as 'audio/mp4', 'video/mp4',
# or 'audio/x-m4a'; .wav as 'audio/x-wav' or 'audio/wav'. So, like written-form,
# we resolve the extension from the filename first and only fall back to MIME.
AUDIO_MIME_TO_EXT = {
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/aac": "aac",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/wave": "wav",
    # iOS records .m4a; libmagic sometimes tags the MP4 container as video/*.
    "video/mp4": "m4a",
}
AUDIO_EXTS = {"m4a", "mp3", "wav", "aac"}

STATIC_ROOT = Path("/app")
THUMB_SIZE = 512  # single-size thumbnail, used as low-fi placeholder before full-res loads

def abs_path(rel: str) -> Path:
    # rel is an absolute-looking web path like "/static/foo.jpg" — anchor it under STATIC_ROOT
    return STATIC_ROOT / rel.lstrip("/")


def versioned_pic_path(rel: str | None) -> str | None:
    """Append `?v=<file-mtime>` to a profile-pic path. This makes the URL change
    whenever the bytes on disk change, so every client (web, iOS, others) refetches
    after any user re-uploads — even if they did it on a different device.
    Falls back to the raw path if the file doesn't exist yet."""
    if not rel:
        return rel
    try:
        mtime = int(abs_path(rel).stat().st_mtime)
    except (FileNotFoundError, OSError):
        return rel
    return f"{rel}?v={mtime}"

def thumb_file(art_id: str) -> Path:
    return STATIC_ROOT / "static" / "thumbs" / f"{art_id}.jpg"

def generate_thumbnail(art_id: str, src_abs: Path) -> Path | None:
    """Render a JPEG thumbnail at THUMB_SIZE for art_id. Returns the path, or None on failure."""
    thumb_path = thumb_file(art_id)
    try:
        thumb_path.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(src_abs) as img:
            img.draft("RGB", (THUMB_SIZE * 2, THUMB_SIZE * 2))
            if img.mode != "RGB":
                img = img.convert("RGB")
            img.thumbnail((THUMB_SIZE, THUMB_SIZE * 4), Image.LANCZOS)
            img.save(thumb_path, format="JPEG", quality=85, optimize=True)
        return thumb_path
    except Exception as e:
        print(f"[thumb] generation failed for {art_id}: {type(e).__name__}: {e}")
        if thumb_path.exists():
            thumb_path.unlink(missing_ok=True)
        return None

def sanitize_path_segment(value: str) -> str:
    import re
    return re.sub(r"[^\w\-]", "_", value)

def _compute_aspect_ratio(path: Path) -> float | None:
    """Read image at path and return w/h. None for PDFs or on read failure."""
    if path.suffix.lower() == ".pdf":
        return None
    try:
        with Image.open(path) as img:
            w, h = img.size
            if w and h:
                return w / h
    except Exception as e:
        print(f"[aspect_ratio] failed for {path}: {type(e).__name__}: {e}")
    return None


def heic_to_jpeg_bytes(contents: bytes) -> bytes:
    img = Image.open(io.BytesIO(contents))
    if img.mode != "RGB":
        img = img.convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return buf.getvalue()


PROFILE_THUMB_DIM = 256  # tiny placeholder for instant first paint; original stays full-res


def profile_thumb_file(member_id: str) -> Path:
    return STATIC_ROOT / "static" / "profile-thumbs" / f"{member_id}.jpg"


def generate_profile_thumb(member_id: str, src_abs: Path) -> Path | None:
    """Render a small JPEG placeholder for a profile pic. Returns the path, or None on failure."""
    thumb_path = profile_thumb_file(member_id)
    try:
        thumb_path.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(src_abs) as img:
            if img.mode != "RGB":
                img = img.convert("RGB")
            img.thumbnail((PROFILE_THUMB_DIM, PROFILE_THUMB_DIM), Image.LANCZOS)
            img.save(thumb_path, format="JPEG", quality=82, optimize=True)
        return thumb_path
    except Exception as e:
        print(f"[profile-thumb] failed for {member_id}: {type(e).__name__}: {e}")
        if thumb_path.exists():
            thumb_path.unlink(missing_ok=True)
        return None

@app.post("/members/profile-picture")
async def upload_profile_picture(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_member: Member = Depends(get_current_member),
):
    contents = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 20 MB limit")
    mime = magic.from_buffer(contents, mime=True)
    if mime not in {"image/png", "image/jpeg", "image/jpg", "image/heic", "image/heif"}:
        raise HTTPException(status_code=400, detail=f"File type not allowed: {mime}")

    if mime in HEIC_MIMES:
        contents = heic_to_jpeg_bytes(contents)
        mime = "image/jpeg"

    ext = "png" if mime == "image/png" else "jpg"
    file_path = f"/static/profile/{current_member.id}.{ext}"
    path = abs_path(file_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(contents)

    # Remove the other-extension sibling so re-uploads that change format don't
    # leave orphaned bytes on disk (e.g. earlier .png after switching to .jpg).
    other_ext = "jpg" if ext == "png" else "png"
    abs_path(f"/static/profile/{current_member.id}.{other_ext}").unlink(missing_ok=True)

    # Thumb generation is slow on the Pi; run it after the response returns so
    # clients see a snappy success and the thumb appears on next refresh.
    background_tasks.add_task(generate_profile_thumb, str(current_member.id), path)

    current_member.profile_pic_path = file_path
    await db.commit()
    return {"profile_pic_path": versioned_pic_path(file_path)}


@app.post("/art/upload/visual-2d")
async def upload_visual_2d(
    username: str = Form(...),
    medium: str = Form(...),
    title: str = Form(...),
    date: date | None = Form(None),
    location: str | None = Form(None),
    song: str | None = Form(None),
    song_artist: str | None = Form(None),
    width: int | None = Form(None),
    height: int | None = Form(None),
    keywords: str | None = Form(None),
    comments_enabled: bool = Form(False),
    collection_id: str | None = Form(None),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_member: Member = Depends(get_current_member),
):
    # verify ownership
    if current_member.username != username:
        raise HTTPException(status_code=403, detail="Cannot upload for another user")

    # When submitting to a prompt: enforce medium match + one-per-user.
    if collection_id:
        if not await db_validate_submission_medium(db, collection_id, medium):
            raise HTTPException(status_code=400, detail="Medium does not match the prompt's required medium")
        existing = await db_get_user_submission(db, collection_id, current_member.id)
        if existing is not None:
            raise HTTPException(status_code=409, detail="You already submitted to this prompt; edit your existing piece")

    # enforce file size limit
    contents = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 20 MB limit")

    # verify file type against allowlist
    mime = magic.from_buffer(contents, mime=True)
    if mime not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=400, detail=f"File type not allowed: {mime}")

    if mime in HEIC_MIMES:
        contents = heic_to_jpeg_bytes(contents)
        mime = "image/jpeg"

    # id-keyed path: generate before write so filename can never collide
    art_id = uuid.uuid4()
    safe_medium = sanitize_path_segment(medium)
    ext_by_mime = {"image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "application/pdf": "pdf"}
    file_ext = ext_by_mime[mime]
    file_path = f"/static/art/{current_member.id}/{safe_medium}/{art_id}.{file_ext}"

    # save the file to the filepath
    path = abs_path(file_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(contents)
    if not path.exists() or path.stat().st_size == 0:
        raise HTTPException(status_code=500, detail="Upload write failed")

    # parse keywords
    keywords_list = [k.strip() for k in keywords.split(',')] if keywords else None
    print(keywords_list)

    # Capture canonical source aspect ratio so clients never need to measure images for layout.
    aspect_ratio = _compute_aspect_ratio(path)

    try:
        await db_add_visual_2d(
            db=db,
            art_id=art_id,
            username=username,
            medium=medium,
            title=title,
            date=date,
            location=location,
            song=song, song_artist=song_artist, width=width,
            height=height,
            keywords=keywords_list,
            file_path=file_path,
            comments_enabled=comments_enabled,
            aspect_ratio=aspect_ratio,
            collection_id=collection_id,
        )
    except ValueError as e:
        path.unlink(missing_ok=True)
        raise HTTPException(status_code=404, detail=str(e))

    # eager thumbnail generation for images (PDFs skip — no preview thumb)
    if path.suffix.lower() != ".pdf":
        generate_thumbnail(str(art_id), path)

    return {"file_path": file_path}

@app.patch("/art/{art_id}")
async def update_visual_2d(
    art_id: str,
    title: str = Form(...),
    date: date | None = Form(None),
    location: str | None = Form(None),
    song: str | None = Form(None),
    song_artist: str | None = Form(None),
    width: int | None = Form(None),
    height: int | None = Form(None),
    keywords: str | None = Form(None),
    comments_enabled: bool = Form(False),
    medium: str | None = Form(None),
    file: UploadFile | None = File(None),
    current_user: Member = Depends(get_current_member),
    db: AsyncSession = Depends(get_db),
):
    # parse keywords (CSV) into list — None means leave keywords untouched isn't supported here,
    # we always replace, matching the old JSON behavior (empty/missing CSV clears keywords).
    keywords_list = [k.strip() for k in keywords.split(',')] if keywords else None

    new_file_path: str | None = None
    new_aspect_ratio: float | None = None
    written_path: Path | None = None  # for rollback on db failure
    old_abs_to_delete: Path | None = None  # deleted after the DB commit succeeds

    if file is not None:
        # Need the existing piece to (a) verify ownership, (b) know the old file to delete,
        # (c) reuse the medium directory if no move is requested.
        existing = (
            await db.execute(select(Visual2D).filter(Visual2D.id == art_id))
        ).scalar_one_or_none()
        if existing is None:
            raise HTTPException(status_code=404, detail="Art not found")
        if str(existing.creator_id) != str(current_user.id):
            raise HTTPException(status_code=403, detail="Not your piece")

        contents = await file.read(MAX_UPLOAD_BYTES + 1)
        if len(contents) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="File exceeds 20 MB limit")
        mime = magic.from_buffer(contents, mime=True)
        if mime not in ALLOWED_MIME_TYPES:
            raise HTTPException(status_code=400, detail=f"File type not allowed: {mime}")
        if mime in HEIC_MIMES:
            contents = heic_to_jpeg_bytes(contents)
            mime = "image/jpeg"

        ext_by_mime = {"image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "application/pdf": "pdf"}
        file_ext = ext_by_mime[mime]

        # Resolve target medium directory. If the caller is moving the piece, write into the
        # new medium dir; else keep the existing one.
        if medium:
            new_media = (
                await db.execute(select(Media).filter(Media.name == medium))
            ).scalar_one_or_none()
            if new_media is None:
                raise HTTPException(status_code=404, detail=f"Medium '{medium}' not found")
            safe_medium = sanitize_path_segment(medium)
        else:
            # derive from existing file_path: /static/art/{member}/{medium}/{art_id}.{ext}
            try:
                safe_medium = Path(existing.file_path).parent.name
            except Exception:
                safe_medium = "unknown"

        # Versioned filename so the URL changes on each replacement — browsers / RN image
        # caches keyed on URL will refetch without us having to touch Cache-Control.
        rev = uuid.uuid4().hex[:8]
        new_file_path = f"/static/art/{current_user.id}/{safe_medium}/{art_id}-{rev}.{file_ext}"
        path = abs_path(new_file_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(contents)
        if not path.exists() or path.stat().st_size == 0:
            raise HTTPException(status_code=500, detail="Upload write failed")
        written_path = path

        new_aspect_ratio = _compute_aspect_ratio(path)

        # Record the prior on-disk file for cleanup after the DB commit lands. If the
        # commit fails we want the old bytes to still be there, since the DB still points
        # at them.
        old_abs = abs_path(existing.file_path)
        if old_abs != path:
            old_abs_to_delete = old_abs

    try:
        await db_update_visual_2d(
            db=db,
            art_id=art_id,
            current_member_id=current_user.id,
            title=title,
            date=date,
            location=location,
            song=song,
            song_artist=song_artist,
            width=width,
            height=height,
            keywords=keywords_list,
            comments_enabled=comments_enabled,
            medium=medium,
            file_path=new_file_path,
            aspect_ratio=new_aspect_ratio if file is not None else None,
            update_file=file is not None,
        )
    except ValueError as e:
        # Roll back any file we just wrote so the DB and disk don't diverge.
        if written_path is not None:
            written_path.unlink(missing_ok=True)
        msg = str(e)
        if "Incompatible" in msg:
            raise HTTPException(status_code=400, detail=msg)
        raise HTTPException(status_code=404, detail=msg)
    except PermissionError as e:
        if written_path is not None:
            written_path.unlink(missing_ok=True)
        raise HTTPException(status_code=403, detail=str(e))

    if file is not None and written_path is not None:
        # Commit succeeded — safe to drop the old file now.
        if old_abs_to_delete is not None:
            old_abs_to_delete.unlink(missing_ok=True)
        # Regenerate the thumb at the same art-id path so collections / grids refresh.
        # PDFs have no cached thumb file; drop the stale one if it exists.
        thumb_file(art_id).unlink(missing_ok=True)
        if written_path.suffix.lower() != ".pdf":
            generate_thumbnail(str(art_id), written_path)

    return {"ok": True, "file_path": new_file_path}

@app.delete("/art/{art_id}")
async def remove_visual_2d(art_id: str, current_user: Member = Depends(get_current_member), db: AsyncSession = Depends(get_db)):
    file_path = await db_remove_visual_2d(art_id=art_id, current_member_id=current_user.id, db=db)
    if file_path:
        abs_path(file_path).unlink(missing_ok=True)
    thumb_file(art_id).unlink(missing_ok=True)
    return


@app.post("/art/upload/written-form")
async def upload_written_form(
    username: str = Form(...),
    medium: str = Form(...),
    title: str = Form(...),
    date: date | None = Form(None),
    keywords: str | None = Form(None),
    comments_enabled: bool = Form(False),
    series_name: str | None = Form(None),
    file: UploadFile | None = File(None),
    # Plaintext alternative to uploading a file. When set, the server writes
    # the contents as a .txt under the user's written-form medium. Lets users
    # bring text in from Notes / Google Docs / anywhere via copy-paste — no
    # share-extension or file-provider round-trip required.
    text: str | None = Form(None),
    db: AsyncSession = Depends(get_db),
    current_member: Member = Depends(get_current_member),
):
    if current_member.username != username:
        raise HTTPException(status_code=403, detail="Cannot upload for another user")

    if file is None and not text:
        raise HTTPException(status_code=400, detail="Provide either a file or pasted text")
    if file is not None and text:
        raise HTTPException(status_code=400, detail="Send a file OR pasted text, not both")

    if text is not None:
        contents = text.encode("utf-8")
        if len(contents) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="Text exceeds 20 MB limit")
        file_ext = "txt"
    else:
        contents = await file.read(MAX_UPLOAD_BYTES + 1)
        if len(contents) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="File exceeds 20 MB limit")

        # Resolve extension from filename first; libmagic can't distinguish .md from .txt
        # (both 'text/plain') and sometimes reports .docx as 'application/zip'.
        filename_ext = (file.filename or "").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else ""
        mime = magic.from_buffer(contents, mime=True)

        if filename_ext in WRITTEN_FORM_EXTS:
            file_ext = filename_ext
            # Cross-check that the body bytes are plausible for the claimed extension.
            if mime not in WRITTEN_FORM_MIME_TO_EXT and not (file_ext in {"txt", "md"} and mime == "text/plain"):
                raise HTTPException(status_code=400, detail=f"File contents do not match extension .{file_ext} (detected {mime})")
        elif mime in WRITTEN_FORM_MIME_TO_EXT:
            file_ext = WRITTEN_FORM_MIME_TO_EXT[mime]
        else:
            raise HTTPException(status_code=400, detail=f"File type not allowed: {mime}")

    art_id = uuid.uuid4()
    safe_medium = sanitize_path_segment(medium)
    file_path = f"/static/written-form/{current_member.id}/{safe_medium}/{art_id}.{file_ext}"

    path = abs_path(file_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(contents)
    if not path.exists() or path.stat().st_size == 0:
        raise HTTPException(status_code=500, detail="Upload write failed")

    keywords_list = [k.strip() for k in keywords.split(',')] if keywords else None

    try:
        await db_add_written_form(
            db=db,
            art_id=art_id,
            username=username,
            medium=medium,
            title=title,
            date=date,
            keywords=keywords_list,
            file_path=file_path,
            comments_enabled=comments_enabled,
            series_name=series_name,
        )
    except ValueError as e:
        path.unlink(missing_ok=True)
        raise HTTPException(status_code=404, detail=str(e))

    return {"file_path": file_path}


@app.get("/members/{username}/art/written-form/{medium}", response_model=list[WrittenFormOut])
async def get_written_form(
    username: str,
    medium: str,
    db: AsyncSession = Depends(get_db),
) -> list[WrittenFormOut]:
    results = await db_get_written_form(db, username, medium)
    if results is None:
        raise HTTPException(status_code=404)

    pieces = []
    for result in results:
        row, kws, series_name = result
        pieces.append(WrittenFormOut(
            id=row.id,
            title=row.title,
            date=row.date,
            keywords=kws,
            file_path=row.file_path,
            comments_enabled=row.comments_enabled,
            series_id=row.series_id,
            series_name=series_name,
            order_index=row.order_index,
        ))
    return pieces


@app.patch("/art/written-form/{art_id}")
async def update_written_form(
    art_id: str,
    title: str = Form(...),
    date: date | None = Form(None),
    keywords: str | None = Form(None),
    comments_enabled: bool = Form(False),
    medium: str | None = Form(None),
    series_name: str | None = Form(None),
    clear_series: bool = Form(False),
    file: UploadFile | None = File(None),
    text: str | None = Form(None),
    current_user: Member = Depends(get_current_member),
    db: AsyncSession = Depends(get_db),
):
    if file is not None and text:
        raise HTTPException(status_code=400, detail="Send a file OR pasted text, not both")

    keywords_list = [k.strip() for k in keywords.split(',')] if keywords else None

    # File/text replacement path. Mirrors the Visual2D update flow: load existing,
    # write the new bytes to a fresh path, swap file_path in the DB, then delete
    # the old file on disk only after the commit succeeds.
    new_file_path: str | None = None
    written_path: Path | None = None
    old_abs_to_delete: Path | None = None

    if file is not None or text:
        existing = (
            await db.execute(select(WrittenForm).filter(WrittenForm.id == art_id))
        ).scalar_one_or_none()
        if existing is None:
            raise HTTPException(status_code=404, detail="Art not found")
        if str(existing.creator_id) != str(current_user.id):
            raise HTTPException(status_code=403, detail="Not your piece")

        if text is not None:
            contents = text.encode("utf-8")
            if len(contents) > MAX_UPLOAD_BYTES:
                raise HTTPException(status_code=413, detail="Text exceeds 20 MB limit")
            file_ext = "txt"
        else:
            contents = await file.read(MAX_UPLOAD_BYTES + 1)
            if len(contents) > MAX_UPLOAD_BYTES:
                raise HTTPException(status_code=413, detail="File exceeds 20 MB limit")
            filename_ext = (file.filename or "").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else ""
            mime = magic.from_buffer(contents, mime=True)
            if filename_ext in WRITTEN_FORM_EXTS:
                file_ext = filename_ext
                if mime not in WRITTEN_FORM_MIME_TO_EXT and not (file_ext in {"txt", "md"} and mime == "text/plain"):
                    raise HTTPException(status_code=400, detail=f"File contents do not match extension .{file_ext} (detected {mime})")
            elif mime in WRITTEN_FORM_MIME_TO_EXT:
                file_ext = WRITTEN_FORM_MIME_TO_EXT[mime]
            else:
                raise HTTPException(status_code=400, detail=f"File type not allowed: {mime}")

        if existing.file_path:
            old_abs_to_delete = abs_path(existing.file_path)

        # Path uses the current medium's name (move-to is a DB column update only;
        # we re-key the file on the existing medium's folder to keep things simple).
        current_media = (
            await db.execute(select(Media).filter(Media.id == existing.media_id))
        ).scalar_one_or_none()
        safe_medium = sanitize_path_segment(current_media.name if current_media else "written")
        new_file_path = f"/static/written-form/{current_user.id}/{safe_medium}/{art_id}.{file_ext}"
        written_path = abs_path(new_file_path)
        written_path.parent.mkdir(parents=True, exist_ok=True)
        written_path.write_bytes(contents)
        if not written_path.exists() or written_path.stat().st_size == 0:
            raise HTTPException(status_code=500, detail="Upload write failed")

    try:
        await db_update_written_form(
            db=db,
            art_id=art_id,
            current_member_id=current_user.id,
            title=title,
            date=date,
            keywords=keywords_list,
            comments_enabled=comments_enabled,
            medium=medium,
            series_name=series_name,
            clear_series=clear_series,
            file_path=new_file_path,
        )
    except ValueError as e:
        if written_path is not None:
            written_path.unlink(missing_ok=True)
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        if written_path is not None:
            written_path.unlink(missing_ok=True)
        raise HTTPException(status_code=403, detail=str(e))

    if new_file_path is not None and old_abs_to_delete is not None and old_abs_to_delete != written_path:
        old_abs_to_delete.unlink(missing_ok=True)
    return {"ok": True}


@app.get("/prompts", response_model=list[PromptSummary])
async def list_prompts(
    db: AsyncSession = Depends(get_db),
    _: Member = Depends(get_current_member),
) -> list[PromptSummary]:
    rows = await db_list_prompts(db)
    return [
        PromptSummary(
            id=prompt.id,
            title=prompt.title,
            media_name=media_name,
            is_active=prompt.is_active,
            created_at=prompt.created_at,
        )
        for prompt, media_name in rows
    ]


@app.get("/prompts/active", response_model=PromptOut | None)
async def get_active_prompt(
    db: AsyncSession = Depends(get_db),
    _: Member = Depends(get_current_member),
) -> PromptOut | None:
    row = await db_get_active_prompt(db)
    if row is None:
        return None
    prompt, media_name, count = row
    return PromptOut(
        id=prompt.id,
        title=prompt.title,
        short_summary=prompt.short_summary,
        media_id=prompt.media_id,
        media_name=media_name,
        is_active=prompt.is_active,
        submission_count=count,
    )


@app.get("/prompts/{prompt_id}", response_model=PromptDetailOut)
async def get_prompt(
    prompt_id: str,
    db: AsyncSession = Depends(get_db),
    current_member: Member = Depends(get_current_member),
) -> PromptDetailOut:
    row = await db_get_prompt(db, prompt_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Prompt not found")
    prompt, media_name = row
    submissions = await db_list_prompt_submissions(db, prompt.id)
    viewer_submission_id = await db_get_user_submission(db, prompt.id, current_member.id)
    return PromptDetailOut(
        id=prompt.id,
        title=prompt.title,
        short_summary=prompt.short_summary,
        media_id=prompt.media_id,
        media_name=media_name,
        is_active=prompt.is_active,
        submission_count=len(submissions),
        submissions=submissions,
        viewer_submission_id=viewer_submission_id,
    )


@app.post("/admin/prompts", response_model=PromptOut, status_code=status.HTTP_201_CREATED)
async def admin_create_prompt(
    payload: PromptCreate,
    db: AsyncSession = Depends(get_db),
    _: Member = Depends(get_admin_member),
) -> PromptOut:
    media_id = (
        await db.execute(select(Media.id, Media.name).filter(Media.name == payload.medium))
    ).one_or_none()
    if media_id is None:
        raise HTTPException(status_code=404, detail=f"Medium '{payload.medium}' not found")
    resolved_id, media_name = media_id
    prompt = await db_create_prompt(
        db,
        title=payload.title,
        short_summary=payload.short_summary,
        media_id=resolved_id,
        activate=payload.activate,
    )
    return PromptOut(
        id=prompt.id,
        title=prompt.title,
        short_summary=prompt.short_summary,
        media_id=prompt.media_id,
        media_name=media_name,
        is_active=prompt.is_active,
        submission_count=0,
    )


@app.post("/admin/prompts/{prompt_id}/activate", response_model=PromptOut)
async def admin_activate_prompt(
    prompt_id: str,
    db: AsyncSession = Depends(get_db),
    _: Member = Depends(get_admin_member),
) -> PromptOut:
    try:
        prompt = await db_activate_prompt(db, prompt_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    media_name = (
        await db.execute(select(Media.name).filter(Media.id == prompt.media_id))
    ).scalar_one()
    return PromptOut(
        id=prompt.id,
        title=prompt.title,
        short_summary=prompt.short_summary,
        media_id=prompt.media_id,
        media_name=media_name,
        is_active=prompt.is_active,
        submission_count=0,
    )


@app.post("/admin/prompts/{prompt_id}/archive", response_model=PromptOut)
async def admin_archive_prompt(
    prompt_id: str,
    db: AsyncSession = Depends(get_db),
    _: Member = Depends(get_admin_member),
) -> PromptOut:
    try:
        prompt = await db_archive_prompt(db, prompt_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    media_name = (
        await db.execute(select(Media.name).filter(Media.id == prompt.media_id))
    ).scalar_one()
    return PromptOut(
        id=prompt.id,
        title=prompt.title,
        short_summary=prompt.short_summary,
        media_id=prompt.media_id,
        media_name=media_name,
        is_active=prompt.is_active,
        submission_count=0,
    )


@app.patch("/series/{series_id}/order")
async def set_series_order(
    series_id: str,
    payload: SeriesOrderUpdate,
    current_user: Member = Depends(get_current_member),
    db: AsyncSession = Depends(get_db),
):
    try:
        await db_set_series_order(db, series_id, current_user.id, [str(a) for a in payload.art_ids])
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    return {"ok": True}


@app.patch("/series/{series_id}")
async def rename_series(
    series_id: str,
    payload: SeriesRename,
    current_user: Member = Depends(get_current_member),
    db: AsyncSession = Depends(get_db),
):
    try:
        row = await db_rename_series(db, series_id, current_user.id, payload.name)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    return {"id": str(row.id), "name": row.name}


@app.delete("/art/written-form/{art_id}")
async def remove_written_form(art_id: str, current_user: Member = Depends(get_current_member), db: AsyncSession = Depends(get_db)):
    try:
        file_path = await db_remove_written_form(art_id=art_id, current_member_id=current_user.id, db=db)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    if file_path:
        abs_path(file_path).unlink(missing_ok=True)
    return


# ============================================================
# Audio routes (voice memos + uploaded music). Mirror the
# written-form file flow; no text mode, no series. Extra form
# fields: artist (music only) and duration_seconds (client-measured).
# ============================================================
def _resolve_audio_ext(filename: str | None, contents: bytes) -> str:
    """Resolve the stored extension for an audio upload. Extension-first because
    libmagic's audio detection is unreliable for MP4-container formats (.m4a/.aac).
    Falls back to the detected MIME, and raises 400 if neither yields an allowed type."""
    filename_ext = (filename or "").rsplit(".", 1)[-1].lower() if "." in (filename or "") else ""
    mime = magic.from_buffer(contents, mime=True)
    if filename_ext in AUDIO_EXTS:
        # Trust the extension as long as the bytes look like *some* audio/MP4
        # container — guards against a .mp3 that's actually a PDF, while staying
        # permissive about the exact audio MIME variant.
        if mime in AUDIO_MIME_TO_EXT or mime.startswith("audio/"):
            return filename_ext
        raise HTTPException(status_code=400, detail=f"File contents do not match extension .{filename_ext} (detected {mime})")
    if mime in AUDIO_MIME_TO_EXT:
        return AUDIO_MIME_TO_EXT[mime]
    raise HTTPException(status_code=400, detail=f"Audio file type not allowed: {mime}")


@app.post("/art/upload/audio")
async def upload_audio(
    username: str = Form(...),
    medium: str = Form(...),
    title: str = Form(...),
    date: date | None = Form(None),
    keywords: str | None = Form(None),
    comments_enabled: bool = Form(False),
    artist: str | None = Form(None),
    duration_seconds: float | None = Form(None),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_member: Member = Depends(get_current_member),
):
    if current_member.username != username:
        raise HTTPException(status_code=403, detail="Cannot upload for another user")

    contents = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 20 MB limit")
    file_ext = _resolve_audio_ext(file.filename, contents)

    art_id = uuid.uuid4()
    safe_medium = sanitize_path_segment(medium)
    file_path = f"/static/audio/{current_member.id}/{safe_medium}/{art_id}.{file_ext}"

    path = abs_path(file_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(contents)
    if not path.exists() or path.stat().st_size == 0:
        raise HTTPException(status_code=500, detail="Upload write failed")

    keywords_list = [k.strip() for k in keywords.split(',')] if keywords else None

    try:
        await db_add_audio(
            db=db,
            art_id=art_id,
            username=username,
            medium=medium,
            title=title,
            date=date,
            artist=artist,
            duration_seconds=duration_seconds,
            keywords=keywords_list,
            file_path=file_path,
            comments_enabled=comments_enabled,
        )
    except ValueError as e:
        path.unlink(missing_ok=True)
        raise HTTPException(status_code=404, detail=str(e))

    return {"file_path": file_path}


@app.get("/members/{username}/art/audio/{medium}", response_model=list[AudioOut])
async def get_audio(
    username: str,
    medium: str,
    db: AsyncSession = Depends(get_db),
) -> list[AudioOut]:
    results = await db_get_audio(db, username, medium)
    if results is None:
        raise HTTPException(status_code=404)

    pieces = []
    for row, kws in results:
        pieces.append(AudioOut(
            id=row.id,
            title=row.title,
            date=row.date,
            keywords=kws,
            file_path=row.file_path,
            comments_enabled=row.comments_enabled,
            artist=row.artist,
            duration_seconds=row.duration_seconds,
        ))
    return pieces


@app.patch("/art/audio/{art_id}")
async def update_audio(
    art_id: str,
    title: str = Form(...),
    date: date | None = Form(None),
    keywords: str | None = Form(None),
    comments_enabled: bool = Form(False),
    medium: str | None = Form(None),
    artist: str | None = Form(None),
    duration_seconds: float | None = Form(None),
    file: UploadFile | None = File(None),
    current_user: Member = Depends(get_current_member),
    db: AsyncSession = Depends(get_db),
):
    keywords_list = [k.strip() for k in keywords.split(',')] if keywords else None

    # File replacement path: load existing, write new bytes to a fresh path,
    # swap file_path in the DB, then delete the old file only after commit.
    new_file_path: str | None = None
    written_path: Path | None = None
    old_abs_to_delete: Path | None = None

    if file is not None:
        existing = (
            await db.execute(select(Audio).filter(Audio.id == art_id))
        ).scalar_one_or_none()
        if existing is None:
            raise HTTPException(status_code=404, detail="Art not found")
        if str(existing.creator_id) != str(current_user.id):
            raise HTTPException(status_code=403, detail="Not your piece")

        contents = await file.read(MAX_UPLOAD_BYTES + 1)
        if len(contents) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="File exceeds 20 MB limit")
        file_ext = _resolve_audio_ext(file.filename, contents)

        if existing.file_path:
            old_abs_to_delete = abs_path(existing.file_path)

        current_media = (
            await db.execute(select(Media).filter(Media.id == existing.media_id))
        ).scalar_one_or_none()
        safe_medium = sanitize_path_segment(current_media.name if current_media else "audio")
        new_file_path = f"/static/audio/{current_user.id}/{safe_medium}/{art_id}.{file_ext}"
        written_path = abs_path(new_file_path)
        written_path.parent.mkdir(parents=True, exist_ok=True)
        written_path.write_bytes(contents)
        if not written_path.exists() or written_path.stat().st_size == 0:
            raise HTTPException(status_code=500, detail="Upload write failed")

    try:
        await db_update_audio(
            db=db,
            art_id=art_id,
            current_member_id=current_user.id,
            title=title,
            date=date,
            artist=artist,
            duration_seconds=duration_seconds,
            keywords=keywords_list,
            comments_enabled=comments_enabled,
            medium=medium,
            file_path=new_file_path,
        )
    except ValueError as e:
        if written_path is not None:
            written_path.unlink(missing_ok=True)
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        if written_path is not None:
            written_path.unlink(missing_ok=True)
        raise HTTPException(status_code=403, detail=str(e))

    if new_file_path is not None and old_abs_to_delete is not None and old_abs_to_delete != written_path:
        old_abs_to_delete.unlink(missing_ok=True)
    return {"ok": True}


@app.delete("/art/audio/{art_id}")
async def remove_audio(art_id: str, current_user: Member = Depends(get_current_member), db: AsyncSession = Depends(get_db)):
    try:
        file_path = await db_remove_audio(art_id=art_id, current_member_id=current_user.id, db=db)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    if file_path:
        abs_path(file_path).unlink(missing_ok=True)
    return


@app.get("/art/{art_id}/thumb")
async def get_art_thumb(art_id: str, db: AsyncSession = Depends(get_db)):
    """512px JPEG thumbnail used as a low-fi placeholder. Lazy-generates on first request
    for art uploaded before eager-gen was in place; future requests hit the cached file."""
    result = await db.execute(select(Art.file_path).filter(Art.id == art_id))
    file_path = result.scalar_one_or_none()
    if not file_path:
        raise HTTPException(status_code=404, detail="Art not found")

    src_abs = abs_path(file_path)
    if not src_abs.exists():
        raise HTTPException(status_code=404, detail="Source file missing")

    # Short max-age (not immutable) so PATCH /art/{id} file replacements show up
    # within ~a minute without us having to version the thumb URL per piece.
    cache_headers = {"Cache-Control": "public, max-age=60, must-revalidate"}

    # PDFs have no thumb — serve the original
    if src_abs.suffix.lower() == ".pdf":
        return FileResponse(src_abs, headers=cache_headers)

    thumb_path = thumb_file(art_id)
    if not thumb_path.exists():
        if generate_thumbnail(art_id, src_abs) is None:
            return FileResponse(src_abs, headers=cache_headers)

    return FileResponse(thumb_path, headers=cache_headers, media_type="image/jpeg")


# ====================== COMMENTS =========================

@app.get("/members/me/comments-received", response_model=CommentsReceivedPage)
async def get_comments_received(
    cursor: datetime | None = None,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    current_member: Member = Depends(get_current_member),
):
    """Paged list of comments left by OTHER members on the caller's art.
    First page (cursor=None) snapshots and bumps `comments_last_viewed_at` so the
    client can colour pre-existing rows as 'seen' and brand-new rows as 'unseen'.
    """
    # Cap limit to keep payloads predictable.
    limit = max(1, min(limit, 50))
    is_first_page = cursor is None
    prev = (
        await db_touch_comments_viewed(db, current_member)
        if is_first_page
        else current_member.comments_last_viewed_at
    )

    rows = await db_get_comments_received(db, current_member.id, cursor, limit)
    comments = [
        CommentReceivedOut(
            id=c.id,
            text=c.text,
            created_at=c.created_at,
            art_id=c.art_id,
            art_title=art_title,
            art_medium=art_medium,
            commenter_username=username,
            commenter_firstname=firstname,
        )
        for c, username, firstname, art_title, art_medium in rows
    ]
    next_cursor = comments[-1].created_at if len(comments) == limit else None
    return CommentsReceivedPage(
        comments=comments,
        next_cursor=next_cursor,
        previous_view_at=prev,
    )


@app.get("/art/{art_id}/comments", response_model=list[CommentOut])
async def get_comments(
    art_id: str,
    db: AsyncSession = Depends(get_db),
    _: Member = Depends(get_current_member),
):
    rows = await db_get_comments(db, art_id)
    return [
        CommentOut(id=c.id, username=username, firstname=firstname, text=c.text, created_at=c.created_at)
        for c, username, firstname in rows
    ]

@app.post("/art/{art_id}/comments", response_model=CommentOut, status_code=status.HTTP_201_CREATED)
async def add_comment(
    art_id: str,
    payload: CommentIn,
    db: AsyncSession = Depends(get_db),
    current_member: Member = Depends(get_current_member),
):
    try:
        comment = await db_add_comment(db, art_id, current_member.id, payload.text)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return CommentOut(
        id=comment.id,
        username=current_member.username,
        firstname=current_member.firstname,
        text=comment.text,
        created_at=comment.created_at,
    )

@app.delete("/art/{art_id}/comments/{comment_id}")
async def delete_comment(
    art_id: str,
    comment_id: str,
    db: AsyncSession = Depends(get_db),
    current_member: Member = Depends(get_current_member),
):
    outcome = await db_delete_comment(db, comment_id, current_member.id)
    if outcome == 'not_found':
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
    if outcome == 'forbidden':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your comment")
    return Response(status_code=status.HTTP_204_NO_CONTENT)

# ====================== APPLICATIONS =========================

@app.post("/apply", status_code=status.HTTP_201_CREATED)
async def submit_application(payload: ApplicationIn, db: AsyncSession = Depends(get_db)):
    await db_submit_application(
        db=db,
        firstname=payload.firstname,
        lastname=payload.lastname,
        email=payload.email,
        city=payload.city,
        state=payload.state,
        known_member=payload.known_member,
        reason=payload.reason,
    )
    return {"ok": True}

@app.get("/admin/password-resets", response_model=list[PasswordResetOut])
async def list_password_resets_endpoint(
    db: AsyncSession = Depends(get_db),
    _: Member = Depends(get_admin_member),
):
    """Live forgot-password codes, for manual delivery by the admin ("for now"
    flow while SMTP is unconfigured; harmless alongside email delivery too)."""
    members = await db_list_password_resets(db)
    return [
        PasswordResetOut(
            username=m.username,
            email=m.email,
            firstname=m.firstname,
            lastname=m.lastname,
            code=m.temp_password_plaintext,
            expires_at=m.temp_password_expires_at,
        )
        for m in members
    ]


@app.get("/admin/applications", response_model=list[ApplicationOut])
async def get_applications(db: AsyncSession = Depends(get_db), _: Member = Depends(get_admin_member)):
    apps = await db_get_applications(db)
    out: list[ApplicationOut] = []
    for app in apps:
        temp_username = None
        temp_password = None
        if app.status == "pending_setup" and app.member_id:
            m = (await db.execute(select(Member).filter(Member.id == app.member_id))).scalar_one_or_none()
            if m:
                temp_username = m.username
                temp_password = m.temp_password_plaintext
        out.append(ApplicationOut(
            id=app.id,
            firstname=app.firstname,
            lastname=app.lastname,
            email=app.email,
            city=app.city,
            state=app.state,
            known_member=app.known_member,
            reason=app.reason,
            status=app.status,
            created_at=app.created_at,
            temp_username=temp_username,
            temp_password=temp_password,
        ))
    return out

@app.patch("/admin/applications/{application_id}")
async def update_application_status(
    application_id: str,
    payload: ApplicationStatusUpdate,
    db: AsyncSession = Depends(get_db),
    _: Member = Depends(get_admin_member),
):
    if payload.status == "approved":
        try:
            app, member, temp_password = await db_approve_application(db, application_id)
        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))
        return ApplicationApproveOut(
            application_id=app.id,
            status=app.status,
            temp_username=member.username,
            temp_password=temp_password,
            temp_password_expires_at=member.temp_password_expires_at,
        )
    try:
        await db_update_application_status(db, application_id, payload.status)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"ok": True}


@app.delete("/admin/applications/{application_id}")
async def delete_application_endpoint(
    application_id: str,
    db: AsyncSession = Depends(get_db),
    _: Member = Depends(get_admin_member),
):
    try:
        await db_delete_application(db, application_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"ok": True}


@app.post("/media-requests", response_model=MediaRequestOut, status_code=201)
async def submit_media_request(
    payload: MediaRequestIn,
    db: AsyncSession = Depends(get_db),
    current_member: Member = Depends(get_current_member),
):
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name required")
    row = await db_create_media_request(db, current_member.id, name)
    return MediaRequestOut(
        id=row.id,
        member_id=row.member_id,
        username=current_member.username,
        requested_name=row.requested_name,
        status=row.status,
        resolved_type=row.resolved_type,
        created_at=row.created_at,
    )


@app.get("/admin/media-requests", response_model=list[MediaRequestOut])
async def get_media_requests(
    db: AsyncSession = Depends(get_db),
    _: Member = Depends(get_admin_member),
):
    rows = await db_list_media_requests(db)
    return [
        MediaRequestOut(
            id=req.id,
            member_id=req.member_id,
            username=username,
            requested_name=req.requested_name,
            status=req.status,
            resolved_type=req.resolved_type,
            created_at=req.created_at,
        )
        for req, username in rows
    ]


@app.patch("/admin/media-requests/{request_id}", response_model=MediaRequestOut)
async def resolve_media_request(
    request_id: str,
    payload: MediaRequestUpdate,
    db: AsyncSession = Depends(get_db),
    _: Member = Depends(get_admin_member),
):
    if payload.status == "approved" and not payload.type:
        raise HTTPException(status_code=400, detail="type required for approval")
    try:
        row = await db_resolve_media_request(
            db, request_id, payload.status, payload.type, name_override=payload.name,
        )
    except ValueError as e:
        msg = str(e)
        if "already exists" in msg:
            status = 409
        elif "not found" in msg:
            status = 404
        else:
            status = 400
        raise HTTPException(status_code=status, detail=msg)
    # fetch username for response
    member = (
        await db.execute(select(Member).filter(Member.id == row.member_id))
    ).scalar_one_or_none()
    return MediaRequestOut(
        id=row.id,
        member_id=row.member_id,
        username=member.username if member else "",
        requested_name=row.requested_name,
        status=row.status,
        resolved_type=row.resolved_type,
        created_at=row.created_at,
    )


# ====================== FEATURE REQUESTS =========================

@app.get("/feature-requests", response_model=list[FeatureRequestOut])
async def list_feature_requests_endpoint(
    db: AsyncSession = Depends(get_db),
    current_member: Member = Depends(get_current_member),
):
    rows = await db_list_feature_requests(db, current_member.id)
    is_admin = current_member.role == "admin"
    return [
        FeatureRequestOut(
            id=req.id,
            # Board is anonymous to members; only admins see who asked.
            username=username if is_admin else None,
            title=req.title,
            up=up,
            down=down,
            my_vote=my_vote,
            is_owner=req.member_id == current_member.id,
            created_at=req.created_at,
        )
        for req, username, up, down, my_vote in rows
    ]


@app.post("/feature-requests", response_model=FeatureRequestOut, status_code=201)
async def submit_feature_request(
    payload: FeatureRequestIn,
    db: AsyncSession = Depends(get_db),
    current_member: Member = Depends(get_current_member),
):
    title = (payload.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="title required")
    row = await db_create_feature_request(db, current_member.id, title)
    return FeatureRequestOut(
        id=row.id,
        username=current_member.username if current_member.role == "admin" else None,
        title=row.title,
        is_owner=True,
        created_at=row.created_at,
    )


@app.put("/feature-requests/{request_id}/vote", response_model=FeatureRequestVoteOut)
async def vote_feature_request_endpoint(
    request_id: str,
    payload: FeatureRequestVoteIn,
    db: AsyncSession = Depends(get_db),
    current_member: Member = Depends(get_current_member),
):
    try:
        up, down, my_vote = await db_vote_feature_request(
            db, request_id, current_member.id, payload.value
        )
    except ValueError as e:
        msg = str(e)
        raise HTTPException(status_code=404 if "not found" in msg else 400, detail=msg)
    return FeatureRequestVoteOut(up=up, down=down, my_vote=my_vote)


@app.delete("/feature-requests/{request_id}")
async def delete_feature_request_endpoint(
    request_id: str,
    db: AsyncSession = Depends(get_db),
    current_member: Member = Depends(get_current_member),
):
    try:
        await db_delete_feature_request(
            db, request_id, current_member.id, is_admin=current_member.role == "admin"
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    return {"ok": True}


# ====================== MESSAGING =========================

def _conversation_out(row: dict) -> ConversationOut:
    return ConversationOut(
        id=row["id"],
        type=row["type"],
        title=row["title"],
        partner_username=row["partner_username"],
        last_message=row["last_message"],
        last_message_at=row["last_message_at"],
        last_sender_username=row["last_sender_username"],
        unread=row["unread"],
    )


@app.get("/members/directory", response_model=list[MemberDirectoryEntry])
async def member_directory_endpoint(
    db: AsyncSession = Depends(get_db),
    current_member: Member = Depends(get_current_member),
):
    rows = await db_get_member_directory(db, current_member.id)
    return [
        MemberDirectoryEntry(username=u, firstname=f, lastname=l)
        for u, f, l in rows
    ]


@app.get("/conversations", response_model=list[ConversationOut])
async def list_conversations_endpoint(
    db: AsyncSession = Depends(get_db),
    current_member: Member = Depends(get_current_member),
):
    rows = await db_list_conversations(db, current_member.id)
    return [_conversation_out(r) for r in rows]


@app.get("/conversations/unread-count")
async def unread_count_endpoint(
    db: AsyncSession = Depends(get_db),
    current_member: Member = Depends(get_current_member),
) -> dict[str, int]:
    return {"unread": await db_get_unread_count(db, current_member.id)}


@app.post("/conversations/dm", response_model=ConversationOut)
async def open_dm_endpoint(
    payload: DmOpenIn,
    db: AsyncSession = Depends(get_db),
    current_member: Member = Depends(get_current_member),
):
    target = await db_resolve_username(db, payload.username)
    if target is None:
        raise HTTPException(status_code=404, detail="Member not found")
    try:
        conversation_id, _created = await db_get_or_create_dm(db, current_member.id, target.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    return ConversationOut(
        id=conversation_id,
        type="dm",
        title=target.firstname or target.username,
        partner_username=target.username,
    )


@app.post("/conversations/group", response_model=ConversationOut, status_code=201)
async def create_group_endpoint(
    payload: GroupCreateIn,
    db: AsyncSession = Depends(get_db),
    current_member: Member = Depends(get_current_member),
):
    member_ids = []
    for username in payload.usernames:
        target = await db_resolve_username(db, username)
        if target is None:
            raise HTTPException(status_code=404, detail=f"Member not found: {username}")
        member_ids.append(target.id)
    try:
        conversation_id = await db_create_group(db, current_member.id, payload.title, member_ids)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return ConversationOut(
        id=conversation_id,
        type="group",
        title=payload.title.strip(),
    )


@app.get("/conversations/{conversation_id}/participants", response_model=list[ParticipantOut])
async def list_participants_endpoint(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    current_member: Member = Depends(get_current_member),
):
    try:
        rows = await db_get_participants(db, conversation_id, current_member.id)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    return [
        ParticipantOut(username=u, firstname=f, lastname=l, role=role)
        for u, f, l, role in rows
    ]


@app.post("/conversations/{conversation_id}/participants")
async def add_participants_endpoint(
    conversation_id: str,
    payload: GroupInviteIn,
    db: AsyncSession = Depends(get_db),
    current_member: Member = Depends(get_current_member),
):
    member_ids = []
    for username in payload.usernames:
        target = await db_resolve_username(db, username)
        if target is None:
            raise HTTPException(status_code=404, detail=f"Member not found: {username}")
        member_ids.append(target.id)
    try:
        added = await db_add_group_members(db, conversation_id, current_member.id, member_ids)
    except ValueError as e:
        msg = str(e)
        raise HTTPException(status_code=404 if "not found" in msg else 400, detail=msg)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    return {"ok": True, "added": added}


@app.get("/conversations/{conversation_id}/messages", response_model=MessagesPage)
async def get_messages_endpoint(
    conversation_id: str,
    cursor: datetime | None = None,
    limit: int = 30,
    db: AsyncSession = Depends(get_db),
    current_member: Member = Depends(get_current_member),
):
    limit = max(1, min(limit, 100))
    try:
        rows, prev_read = await db_get_messages(db, conversation_id, current_member.id, cursor, limit)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    messages = [
        MessageOut(
            id=msg.id,
            sender_username=username,
            sender_firstname=firstname,
            body=msg.body,
            created_at=msg.created_at,
        )
        for msg, username, firstname in rows
    ]
    return MessagesPage(
        messages=messages,
        next_cursor=messages[-1].created_at if len(messages) == limit else None,
        previous_read_at=prev_read,
    )


@app.post("/conversations/{conversation_id}/messages", response_model=MessageOut, status_code=201)
async def send_message_endpoint(
    conversation_id: str,
    payload: MessageIn,
    db: AsyncSession = Depends(get_db),
    current_member: Member = Depends(get_current_member),
):
    try:
        msg = await db_send_message(db, conversation_id, current_member.id, payload.body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    return MessageOut(
        id=msg.id,
        sender_username=current_member.username,
        sender_firstname=current_member.firstname,
        body=msg.body,
        created_at=msg.created_at,
    )


@app.post("/conversations/{conversation_id}/leave")
async def leave_group_endpoint(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    current_member: Member = Depends(get_current_member),
):
    try:
        await db_leave_group(db, conversation_id, current_member.id)
    except ValueError as e:
        msg = str(e)
        raise HTTPException(status_code=404 if "not found" in msg else 400, detail=msg)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    return {"ok": True}


# ====================== REPORTS + BLOCKS =========================

@app.post("/reports", response_model=ReportOut, status_code=status.HTTP_201_CREATED)
async def submit_report(
    payload: ReportIn,
    db: AsyncSession = Depends(get_db),
    current_member: Member = Depends(get_current_member),
):
    if payload.target_type not in REPORT_VALID_TARGETS:
        raise HTTPException(status_code=400, detail=f"target_type must be one of {sorted(REPORT_VALID_TARGETS)}")
    # confirm the target exists so the admin queue isn't polluted with phantom rows
    if payload.target_type == "art":
        exists = (await db.execute(select(Art.id).filter(Art.id == payload.target_id))).scalar_one_or_none()
    else:
        exists = (await db.execute(select(Comment.id).filter(Comment.id == payload.target_id))).scalar_one_or_none()
    if exists is None:
        raise HTTPException(status_code=404, detail=f"{payload.target_type} not found")

    try:
        row = await db_create_report(db, current_member.id, payload.target_type, payload.target_id, payload.reason)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return ReportOut(
        id=row.id,
        reporter_username=current_member.username,
        target_type=row.target_type,
        target_id=row.target_id,
        target_preview=None,
        reason=row.reason,
        status=row.status,
        created_at=row.created_at,
    )


@app.post("/members/block")
async def block_member_endpoint(
    payload: BlockIn,
    db: AsyncSession = Depends(get_db),
    current_member: Member = Depends(get_current_member),
):
    target = await db_resolve_username(db, payload.username)
    if target is None:
        raise HTTPException(status_code=404, detail="Member not found")
    try:
        await db_block_member(db, blocker_id=current_member.id, blockee_id=target.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True, "username": target.username}


@app.delete("/members/block/{username}")
async def unblock_member_endpoint(
    username: str,
    db: AsyncSession = Depends(get_db),
    current_member: Member = Depends(get_current_member),
):
    target = await db_resolve_username(db, username)
    if target is None:
        raise HTTPException(status_code=404, detail="Member not found")
    await db_unblock_member(db, blocker_id=current_member.id, blockee_id=target.id)
    return {"ok": True, "username": target.username}


@app.get("/members/blocks")
async def list_blocks_endpoint(
    db: AsyncSession = Depends(get_db),
    current_member: Member = Depends(get_current_member),
) -> list[str]:
    return await db_list_blocks(db, current_member.id)


@app.get("/admin/reports", response_model=list[ReportOut])
async def list_reports_endpoint(
    db: AsyncSession = Depends(get_db),
    _: Member = Depends(get_admin_member),
):
    rows = await db_list_reports(db)
    return [
        ReportOut(
            id=report.id,
            reporter_username=reporter_username,
            target_type=report.target_type,
            target_id=report.target_id,
            target_preview=preview,
            reason=report.reason,
            status=report.status,
            created_at=report.created_at,
        )
        for report, reporter_username, preview in rows
    ]


@app.patch("/admin/reports/{report_id}", response_model=ReportOut)
async def resolve_report_endpoint(
    report_id: str,
    payload: ReportStatusUpdate,
    db: AsyncSession = Depends(get_db),
    _: Member = Depends(get_admin_member),
):
    try:
        row = await db_resolve_report(db, report_id, payload.status)
    except ValueError as e:
        msg = str(e)
        code = 404 if "not found" in msg else 400
        raise HTTPException(status_code=code, detail=msg)
    reporter = (
        await db.execute(select(Member.username).filter(Member.id == row.reporter_id))
    ).scalar_one_or_none() or ""
    return ReportOut(
        id=row.id,
        reporter_username=reporter,
        target_type=row.target_type,
        target_id=row.target_id,
        target_preview=None,
        reason=row.reason,
        status=row.status,
        created_at=row.created_at,
    )
