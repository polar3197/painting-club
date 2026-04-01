from pydantic import BaseModel
from datetime import date
from typing import List
import uuid

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
    username: str
    firstname: str | None
    lastname: str | None
    media: List[str] = []
    city: str | None
    state: str | None
    bio: str | None
    is_owner: bool = False

class ProfileUpdate(BaseModel):
    firstname: str | None
    lastname: str | None
    bio: str | None
    city: str | None
    state: str | None

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class MemberFilters(BaseModel):
    uname: str | None
    city: str | None

class AddMedia(BaseModel):
    username: str | None
    medium: str | None

class Visual2DOut(BaseModel):
  id: uuid.UUID
  title: str
  date: date | None
  location: str | None
  song: str | None
  height: float | None
  width: float | None
  file_path: str