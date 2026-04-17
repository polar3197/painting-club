from fastapi import Depends, FastAPI, HTTPException, status, UploadFile, File, Form
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
)

from db.db_ops.members import (
    db_create_member,
    db_create_full_member,
    db_login_user,
    db_get_members,
    db_complete_setup,
)

from db.db_ops.profile import (
    db_get_profile,
    db_update_profile,
)

from db.db_ops.search import (
    db_search_members,
    db_get_search_options,
    db_search_art,
)

from db.db_ops.applications import (
    db_submit_application,
    db_get_applications,
    db_update_application_status,
    db_approve_application,
)

from db.db_ops.media import (
    db_add_medium,
    db_add_visual_2d,
    db_get_visual_2d,
    db_update_visual_2d,
    db_remove_visual_2d,
)

from db.db_ops.comments import (
    db_get_comments,
    db_add_comment,
)
    
from db.session import get_db
from db.db_manager import init_db, empty_db
from db.models import Member, Media, Media_Members, Art

from api.auth import create_token, decode_token


bearer = HTTPBearer()
bearer_optional = HTTPBearer(auto_error=False)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
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
    member_row, media = result

    is_owner = current_member is not None and (member_row.username == current_member.username)

    return Profile(
        id=member_row.id,
        username=member_row.username,
        firstname=member_row.firstname,
        lastname=member_row.lastname,
        bio=member_row.bio or "",
        city=member_row.city,
        state=member_row.state,
        media=media,
        is_owner=is_owner,
        role=member_row.role or "member",
        profile_pic_path=member_row.profile_pic_path,
    )

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
            .filter(Media_Members.member_id == member_row.id)
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
        )
        profiles.append(profile)
    print(profiles)
    return profiles
    

@app.post("/members/addmedia")
async def login_member_endpoint(payload: AddMedia, db: AsyncSession = Depends(get_db)):
    success = await db_add_medium(db, payload.username, payload.medium)
    return success

ALLOWED_MIME_TYPES = {"image/png", "image/jpeg", "image/jpg", "application/pdf", "image/heic", "image/heif"}
MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 MB
HEIC_MIMES = {"image/heic", "image/heif"}

STATIC_ROOT = Path("/app")

def abs_path(rel: str) -> Path:
    # rel is an absolute-looking web path like "/static/foo.jpg" — anchor it under STATIC_ROOT
    return STATIC_ROOT / rel.lstrip("/")

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
        )
    except ValueError as e:
        path.unlink(missing_ok=True)
        raise HTTPException(status_code=404, detail=str(e))

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
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    return {"ok": True}

@app.delete("/art/{art_id}")
async def remove_visual_2d(art_id: str, current_user: Member = Depends(get_current_member), db: AsyncSession = Depends(get_db)):
    file_path = await db_remove_visual_2d(art_id=art_id, current_member_id=current_user.id, db=db)
    if file_path:
        abs_path(file_path).unlink(missing_ok=True)
    return


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
    return await db_add_comment(db, art_id, current_member.id, payload.text)

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
