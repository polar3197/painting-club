
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func, desc, nulls_last

from db.models import Member, Media, Media_Members, Visual2D, Keyword, KeywordArt, Art

async def db_add_medium(db: AsyncSession, username: str, medium: str) -> bool:
    # check for user existence
    query = select(Member.id).filter(Member.username==username)
    result = await db.execute(query)
    member_id = result.scalars().first()
    if not member_id:
        raise ValueError(f"Member '{username}' not found")

    # check media exists
    query = select(Media).filter(Media.name==medium)
    result = await db.execute(query)
    medium_record = result.scalars().first()

    if not medium_record:
    # if medium doesn't exist, create a new entry 
        new_medium = Media(name=medium)
        db.add(new_medium)
        await db.commit()
        await db.refresh(new_medium)
        media_id = new_medium.id
    else:
        media_id = medium_record.id
    
    # check if medium is mapped to member
    query = select(Media_Members).filter(Media_Members.media_id==media_id, Media_Members.member_id==member_id)
    result = await db.execute(query)
    if not result.scalars().one_or_none():
        new_mapping = Media_Members(media_id=media_id, member_id=member_id)
        db.add(new_mapping)
        await db.commit()
        await db.refresh(new_mapping)

    return True

async def db_get_art_keywords(db: AsyncSession, art_id: str):
    result = await db.execute(
        select(Keyword.keyword)
        .join(KeywordArt).where(KeywordArt.art_id == art_id)
    )
    return result.scalars().all()


async def db_get_visual_2d(db: AsyncSession, username: str, medium: str):
    member_result = await db.execute(select(Member.id).filter(Member.username == username))
    member_id = member_result.scalars().first()
    if not member_id:
        return None

    media_result = await db.execute(select(Media.id).filter(Media.name == medium))
    media_id = media_result.scalars().first()
    if not media_id:
        return None

    result = await db.execute(
        select(Visual2D)
        .filter(Visual2D.creator_id == member_id, Visual2D.media_id == media_id)
        .order_by(nulls_last(desc(Visual2D.date)))
    )
    visual_2ds = result.scalars().all()

    art_with_keywords = []
    for art in visual_2ds:                                                                                                                  
        keywords = await db_get_art_keywords(db=db, art_id=art.id)
        art_with_keywords.append((art, keywords))
                                                                                                                                            
    return art_with_keywords

async def db_add_visual_2d(
        db: AsyncSession,
        username: str,
        medium: str,
        title: str,
        file_path: str,
        date=None,
        location: str | None = None,
        song: str | None = None,
        song_artist: str | None = None,
        width: int | None = None,
        height: int | None = None,
        keywords: list[str] | None = None,
    )-> bool:
    # find member_id, media_id
    member_result = await db.execute(select(Member.id).filter(Member.username==username))
    member_id = member_result.scalars().first()
    if not member_id:
        raise ValueError(f"Member '{username}' not found")

    media_result = await db.execute(select(Media.id).filter(Media.name==medium))
    media_id = media_result.scalars().first()
    if not media_id:
        raise ValueError(f"Medium '{medium}' not found")

    # use this to create the entry in Art
    new_art = Visual2D(
        title=title,
        date=date,
        creator_id=member_id,
        media_id=media_id,
        location=location,
        song=song,
        song_artist=song_artist,
        width=width,
        height=height,
        file_path=file_path,
    )
    db.add(new_art)
    await db.flush()  # gets the id without committing
    art_id = new_art.id

    # create mappings between keywords, members and media
    for k in (keywords or []):
        result = (await db.execute(select(Keyword).filter(Keyword.keyword == k))).scalar_one_or_none()
        if result:
            keyword_id = result.id
        else:
            new_keyword = Keyword(keyword=k)
            db.add(new_keyword)
            await db.flush()
            keyword_id = new_keyword.id

        db.add(KeywordArt(keyword_id=keyword_id, art_id=art_id))                                                                                    

    await db.commit()
    return True

async def db_update_visual_2d(
    db: AsyncSession,
    art_id: str,
    current_member_id: str,
    title: str,
    date=None,
    location: str | None = None,
    song: str | None = None,
    song_artist: str | None = None,
    width: int | None = None,
    height: int | None = None,
    keywords: list[str] | None = None,
):
    result = await db.execute(select(Visual2D).filter(Visual2D.id == art_id))
    piece = result.scalar_one_or_none()

    if piece is None:
        raise ValueError("Art not found")
    if str(piece.creator_id) != str(current_member_id):
        raise PermissionError("Not your piece")

    piece.title = title
    piece.date = date
    piece.location = location
    piece.song = song
    piece.song_artist = song_artist
    piece.width = width
    piece.height = height

    await db.execute(delete(KeywordArt).filter(KeywordArt.art_id == art_id))

    for k in (keywords or []):
        kw = (await db.execute(select(Keyword).filter(Keyword.keyword == k))).scalar_one_or_none()
        if kw:
            keyword_id = kw.id
        else:
            new_keyword = Keyword(keyword=k)
            db.add(new_keyword)
            await db.flush()
            keyword_id = new_keyword.id
        db.add(KeywordArt(keyword_id=keyword_id, art_id=art_id))

    await db.commit()


async def db_remove_visual_2d(db: AsyncSession, art_id: str, current_member_id: str):
    result = await db.execute(select(Art.creator_id).filter(Art.id == art_id))
    creator_id = result.scalar_one_or_none()
    
    if creator_id is None:
        raise ValueError("Art not found")
    
    if str(creator_id) != str(current_member_id):
        raise PermissionError("Not your piece")
    
    await db.execute(delete(KeywordArt).filter(KeywordArt.art_id == art_id))
    await db.execute(delete(Visual2D).filter(Visual2D.id == art_id))
    await db.execute(delete(Art).filter(Art.id == art_id))
    await db.commit()