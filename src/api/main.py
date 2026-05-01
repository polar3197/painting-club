from fastapi import Depends, FastAPI, HTTPException, status, UploadFile, File, Form, Response
from fastapi.responses import FileResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from datetime import date
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
    MediaVisibilityUpdate,
    Visual2DOut,
    Visual2DUpdate,
    SearchOptions,
    ArtResult,
    ApplicationIn,
    ApplicationOut,
    ApplicationStatusUpdate,
    ApplicationApproveOut,
    SetupAccountIn,
    CommentOut,
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
    db_get_members,
    db_complete_setup,
    db_export_member_data,
    db_delete_member,
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

from db.db_ops.applications import (
    db_submit_application,
    db_get_applications,
    db_update_application_status,
    db_approve_application,
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
)

from db.db_ops.comments import (
    db_get_comments,
    db_add_comment,
    db_delete_comment,
)
    
from db.session import get_db
from db.db_manager import init_db, empty_db, run_migrations
from db.models import Member, Media, Media_Members, Art, Comment

from api.auth import create_token, decode_token


bearer = HTTPBearer()
bearer_optional = HTTPBearer(auto_error=False)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await run_migrations()
    yield
    # await empty_db()

app = FastAPI(lifespan=lifespan, title="painting-club", root_path="/api")

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


@app.post("/members/setup-account", response_model=MemberOut)
async def setup_account_endpoint(
    payload: SetupAccountIn,
    db: AsyncSession = Depends(get_db),
    current_member: Member = Depends(get_current_member),
):
    if not current_member.must_change_password:
        raise HTTPException(status_code=400, detail="Account setup already complete")

    new_username = payload.new_username.strip().lower()
    if len(new_username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters")
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
        profile_pic_path=member_row.profile_pic_path,
        terms_accepted_at=member_row.terms_accepted_at if is_owner else None,
        viewer_blocked_by_owner=viewer_blocked_by_owner,
        blocked_usernames=blocked_usernames,
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
            profile_pic_path=member_row.profile_pic_path,
        )
        profiles.append(profile)
    print(profiles)
    return profiles
    

@app.get("/media", response_model=list[MediaOut])
async def list_media(db: AsyncSession = Depends(get_db)):
    rows = await db_list_media(db)
    return [MediaOut(id=r.id, name=r.name) for r in rows]


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
    return MediaOut(id=row.id, name=row.name)


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

STATIC_ROOT = Path("/app")
THUMB_SIZE = 512  # single-size thumbnail, used as low-fi placeholder before full-res loads

def abs_path(rel: str) -> Path:
    # rel is an absolute-looking web path like "/static/foo.jpg" — anchor it under STATIC_ROOT
    return STATIC_ROOT / rel.lstrip("/")

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

    # Generate a small placeholder thumb so clients can paint something immediately
    # while the full-res original downloads in the background.
    generate_profile_thumb(str(current_member.id), path)

    current_member.profile_pic_path = file_path
    await db.commit()
    return {"profile_pic_path": file_path}


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
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_member: Member = Depends(get_current_member),
):
    # verify ownership
    if current_member.username != username:
        raise HTTPException(status_code=403, detail="Cannot upload for another user")

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
    aspect_ratio: float | None = None
    if path.suffix.lower() != ".pdf":
        try:
            with Image.open(path) as img:
                w, h = img.size
                if w and h:
                    aspect_ratio = w / h
        except Exception as e:
            print(f"[aspect_ratio] failed for {art_id}: {type(e).__name__}: {e}")

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
    payload: Visual2DUpdate,
    current_user: Member = Depends(get_current_member),
    db: AsyncSession = Depends(get_db),
):
    try:
        await db_update_visual_2d(
            db=db,
            art_id=art_id,
            current_member_id=current_user.id,
            title=payload.title,
            date=payload.date,
            location=payload.location,
            song=payload.song,
            song_artist=payload.song_artist,
            width=payload.width,
            height=payload.height,
            keywords=payload.keywords,
            comments_enabled=payload.comments_enabled,
            medium=payload.medium,
        )
    except ValueError as e:
        msg = str(e)
        if "Incompatible" in msg:
            raise HTTPException(status_code=400, detail=msg)
        raise HTTPException(status_code=404, detail=msg)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    return {"ok": True}

@app.delete("/art/{art_id}")
async def remove_visual_2d(art_id: str, current_user: Member = Depends(get_current_member), db: AsyncSession = Depends(get_db)):
    file_path = await db_remove_visual_2d(art_id=art_id, current_member_id=current_user.id, db=db)
    if file_path:
        abs_path(file_path).unlink(missing_ok=True)
    thumb_file(art_id).unlink(missing_ok=True)
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

    cache_headers = {"Cache-Control": "public, max-age=31536000, immutable"}

    # PDFs have no thumb — serve the original
    if src_abs.suffix.lower() == ".pdf":
        return FileResponse(src_abs, headers=cache_headers)

    thumb_path = thumb_file(art_id)
    if not thumb_path.exists():
        if generate_thumbnail(art_id, src_abs) is None:
            return FileResponse(src_abs, headers=cache_headers)

    return FileResponse(thumb_path, headers=cache_headers, media_type="image/jpeg")


# ====================== COMMENTS =========================

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

@app.get("/admin/applications", response_model=list[ApplicationOut])
async def get_applications(db: AsyncSession = Depends(get_db), _: Member = Depends(get_admin_member)):
    apps = await db_get_applications(db)
    # surface temp creds for pending_setup applications so the admin UI can show them
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
