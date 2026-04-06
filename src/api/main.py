from fastapi import Depends, FastAPI, HTTPException, status, UploadFile, File, Form
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from datetime import date
from contextlib import asynccontextmanager
from typing import Optional, List
from pathlib import Path
import magic

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
)

from db.db_ops.members import (
    db_create_member, 
    db_create_full_member,
    db_login_user, 
    db_get_members, 
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
)

from db.db_ops.media import (
    db_add_medium,
    db_add_visual_2d,
    db_get_visual_2d,
    db_update_visual_2d,
    db_remove_visual_2d,
)
    
from db.session import get_db
from db.db_manager import init_db, empty_db
from db.models import Member, Media, Media_Members

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

@app.post("/members/newfull", response_model=MemberOut, status_code=status.HTTP_201_CREATED)
async def create_member_endpoint(payload: FullMemberIn, db: AsyncSession = Depends(get_db)) -> MemberOut:
    try:
        member = await db_create_full_member(db, payload.username, payload.password, payload.bio, payload.city, payload.state, payload.firstname, payload.lastname)
        return MemberOut(id=member.id, username=member.username)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Username already exists")
    
@app.post("/members/new", response_model=MemberOut, status_code=status.HTTP_201_CREATED)
async def create_full_member_endpoint(payload: MemberIn, db: AsyncSession = Depends(get_db)) -> MemberOut:
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
    token = create_token(member)
    return Token(access_token=token)

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
        username=member_row.username,
        firstname=member_row.firstname,
        lastname=member_row.lastname,
        bio=member_row.bio or "",
        city=member_row.city,
        state=member_row.state,
        media=media,
        is_owner=is_owner,
        role=member_row.role or "member",
    )

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
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    # verify file type
    contents = await file.read()
    mime = magic.from_buffer(contents, mime=True)
    if mime != file.content_type:
        raise HTTPException(status_code=400, detail=f"File type mismatch: stated {file.content_type}, actual {mime}")

    file_ext = file.filename.split('.')[-1]
    safe_title = title.replace(" ", "_")                                                                                                        
    file_path = f"/static/art/{username}/{medium}/{safe_title}.{file_ext}"

    # save the file to the filepath
    path = Path(f"/app{file_path}")
    path.parent.mkdir(parents=True, exist_ok=True)                                                                                      
    path.write_bytes(contents) 

    # parse keywords
    keywords_list = [k.strip() for k in keywords.split(',')] if keywords else None
    print(keywords_list)

    try:
        await db_add_visual_2d(
            db=db, 
            username=username, 
            medium=medium, 
            title=title, 
            date=date, 
            location=location, 
            song=song, song_artist=song_artist, width=width,
            height=height,
            keywords=keywords_list,
            file_path=file_path,
        )
    except ValueError as e:
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
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    return {"ok": True}

@app.delete("/art/{art_id}")
async def remove_visual_2d(art_id: str, current_user: Member = Depends(get_current_member), db: AsyncSession = Depends(get_db)):
    await db_remove_visual_2d(art_id=art_id, current_member_id=current_user.id, db=db)
    return


# ====================== APPLICATIONS =========================

async def get_admin_member(current_member: Member = Depends(get_current_member)):
    if current_member.role != "admin":
        raise HTTPException(status_code=403, detail="Admins only")
    return current_member

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
    return await db_get_applications(db)

@app.patch("/admin/applications/{application_id}")
async def update_application_status(
    application_id: str,
    payload: ApplicationStatusUpdate,
    db: AsyncSession = Depends(get_db),
    _: Member = Depends(get_admin_member),
):
    try:
        await db_update_application_status(db, application_id, payload.status)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"ok": True}
