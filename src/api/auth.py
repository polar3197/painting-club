from fastapi import HTTPException
import os
from jose import ExpiredSignatureError, JWTError, jwt
from datetime import datetime, timedelta, timezone
from pydantic import BaseModel

from db.models import Member

JWT_SECRET = os.getenv("JWT_SECRET")
HASH_ALGORITHM = "HS256"
TOKEN_LIFETIME_DAYS = 365

def create_token(member: Member):

    # Long-lived on purpose: both clients call /members/refresh-token on
    # load, so an active member's session slides forever and only someone
    # away for a full year has to log in again ("never logs you out").
    payload = {
        "sub": str(member.id),
        "exp": datetime.now(timezone.utc) + timedelta(days=TOKEN_LIFETIME_DAYS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=HASH_ALGORITHM)

def decode_token(token: str) -> str:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[HASH_ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        return user_id
    except ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    

