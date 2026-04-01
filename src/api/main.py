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
)

from db.db_ops.media import (
    db_add_medium,
    db_add_visual_2d,
    db_get_visual_2d,
)
    
from db.session import get_db
from db.db_manager import init_db, empty_db
from db.models import Member

from api.auth import create_token, decode_token


bearer = HTTPBearer()


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

@app.get("/members/search-options")
async def get_search_options(db: AsyncSession = Depends(get_db)):
    unique_usernames, unique_cities = await db_get_search_options(db)
    if not unique_usernames and not unique_cities:
      raise HTTPException(status_code=404)
    return unique_usernames, unique_cities

@app.get("/members/{username}/profile")
async def get_profile(username: str, db: AsyncSession = Depends(get_db), current_member: Member = Depends(get_current_member)) -> Profile:
    result = await db_get_profile(db, username)
    if not result:
        raise HTTPException(status_code=404)
    member_row, media = result

    is_owner = (member_row.username == current_member.username)

    return Profile(
        username=member_row.username,
        firstname=member_row.firstname,
        lastname=member_row.lastname,
        bio=member_row.bio or "",
        city=member_row.city,
        state=member_row.state,
        media=media,
        is_owner=is_owner,
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
        visual_2d_row = result
        visual_2d = Visual2DOut (
            id=visual_2d_row.id,
            title=visual_2d_row.title,
            date=visual_2d_row.date,
            location=visual_2d_row.location,
            song=visual_2d_row.song,
            height=visual_2d_row.height,
            width=visual_2d_row.width,
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
    current_member: Member = Depends(get_current_member)
) -> List[Profile]:

    results = await db_search_members(
        db=db,
        city=city if city else None,
        uname=uname if uname else None,
    )
    if not results:
        raise HTTPException(status_code=404)

    profiles = []
    for result in results:
        member_row = result
        is_owner = (member_row.username == current_member.username)
        profile = Profile(
            username=member_row.username,
            firstname=member_row.firstname,
            lastname=member_row.lastname,
            bio=member_row.bio or "",
            city=member_row.city,
            state=member_row.state,
            is_owner=is_owner,
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
    width: int | None = Form(None),
    height: int | None = Form(None),
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

    try:
        await db_add_visual_2d(db=db, username=username, medium=medium, title=title, date=date, location=location, song=song, width=width, height=height, file_path=file_path)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    return {"file_path": file_path}
