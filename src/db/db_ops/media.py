
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func, desc, nulls_last

from db.models import Member, Media, Media_Members, Visual2D, WrittenForm, Keyword, KeywordArt, Art

async def db_list_media(db: AsyncSession):
    result = await db.execute(select(Media).order_by(Media.name))
    return result.scalars().all()


async def db_set_media_visibility(
    db: AsyncSession, member_id: str, medium: str, hidden: bool
) -> bool:
    medium_row = (
        await db.execute(select(Media).filter(Media.name == medium))
    ).scalar_one_or_none()
    if not medium_row:
        raise ValueError(f"Medium '{medium}' not found")
    link = (
        await db.execute(
            select(Media_Members).filter(
                Media_Members.member_id == member_id,
                Media_Members.media_id == medium_row.id,
            )
        )
    ).scalar_one_or_none()
    if not link:
        raise ValueError(f"You do not have medium '{medium}' on your profile")
    link.hidden = hidden
    await db.commit()
    return True


async def db_create_media(db: AsyncSession, name: str, type_: str | None = None) -> Media:
    existing = await db.execute(select(Media).filter(Media.name == name))
    row = existing.scalars().first()
    if row:
        # Stamp the type if not set yet; don't overwrite an existing type.
        if type_ is not None and row.type is None:
            row.type = type_
            await db.commit()
            await db.refresh(row)
        return row
    new_medium = Media(name=name, type=type_)
    db.add(new_medium)
    await db.commit()
    await db.refresh(new_medium)
    return new_medium


async def db_add_medium(db: AsyncSession, username: str, medium: str) -> bool:
    username = username.lower()
    # check for user existence
    query = select(Member.id).filter(Member.username==username)
    result = await db.execute(query)
    member_id = result.scalars().first()
    if not member_id:
        raise ValueError(f"Member '{username}' not found")

    # require medium to exist — creation is handled via POST /media
    query = select(Media).filter(Media.name==medium)
    result = await db.execute(query)
    medium_record = result.scalars().first()
    if not medium_record:
        raise ValueError(f"Medium '{medium}' does not exist")
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
    username = username.lower()
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
        art_id,
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
        comments_enabled: bool = False,
        aspect_ratio: float | None = None,
    ) -> str:
    username = username.lower()
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
        id=art_id,
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
        comments_enabled=comments_enabled,
        aspect_ratio=aspect_ratio,
    )
    db.add(new_art)
    await db.flush()

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
    return str(art_id)

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
    comments_enabled: bool = False,
    medium: str | None = None,
):
    result = await db.execute(select(Visual2D).filter(Visual2D.id == art_id))
    piece = result.scalar_one_or_none()

    if piece is None:
        raise ValueError("Art not found")
    if str(piece.creator_id) != str(current_member_id):
        raise PermissionError("Not your piece")

    # Optional media move: only between media that share an overarching type.
    if medium is not None:
        current_media = (
            await db.execute(select(Media).filter(Media.id == piece.media_id))
        ).scalar_one_or_none()
        current_type = current_media.type if current_media else None
        new_media = (
            await db.execute(select(Media).filter(Media.name == medium))
        ).scalar_one_or_none()
        if new_media is None:
            raise ValueError(f"Medium '{medium}' not found")
        if current_type is None or new_media.type is None or new_media.type != current_type:
            raise ValueError("Incompatible media type")
        if str(new_media.id) != str(piece.media_id):
            existing_link = (
                await db.execute(
                    select(Media_Members).filter(
                        Media_Members.media_id == new_media.id,
                        Media_Members.member_id == current_member_id,
                    )
                )
            ).scalar_one_or_none()
            if not existing_link:
                db.add(Media_Members(media_id=new_media.id, member_id=current_member_id))
            piece.media_id = new_media.id

    piece.title = title
    piece.date = date
    piece.location = location
    piece.song = song
    piece.song_artist = song_artist
    piece.width = width
    piece.height = height
    piece.comments_enabled = comments_enabled

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


async def db_remove_visual_2d(db: AsyncSession, art_id: str, current_member_id: str) -> str | None:
    result = await db.execute(select(Art.creator_id, Art.file_path).filter(Art.id == art_id))
    row = result.one_or_none()

    if row is None:
        raise ValueError("Art not found")

    creator_id, file_path = row
    if str(creator_id) != str(current_member_id):
        raise PermissionError("Not your piece")

    await db.execute(delete(KeywordArt).filter(KeywordArt.art_id == art_id))
    await db.execute(delete(Visual2D).filter(Visual2D.id == art_id))
    await db.execute(delete(Art).filter(Art.id == art_id))
    await db.commit()
    return file_path


async def db_get_written_form(db: AsyncSession, username: str, medium: str):
    username = username.lower()
    member_result = await db.execute(select(Member.id).filter(Member.username == username))
    member_id = member_result.scalars().first()
    if not member_id:
        return None

    media_result = await db.execute(select(Media.id).filter(Media.name == medium))
    media_id = media_result.scalars().first()
    if not media_id:
        return None

    result = await db.execute(
        select(WrittenForm)
        .filter(WrittenForm.creator_id == member_id, WrittenForm.media_id == media_id)
        .order_by(nulls_last(desc(WrittenForm.date)))
    )
    pieces = result.scalars().all()

    art_with_keywords = []
    for art in pieces:
        keywords = await db_get_art_keywords(db=db, art_id=art.id)
        art_with_keywords.append((art, keywords))

    return art_with_keywords


async def db_add_written_form(
        db: AsyncSession,
        art_id,
        username: str,
        medium: str,
        title: str,
        file_path: str,
        date=None,
        keywords: list[str] | None = None,
        comments_enabled: bool = False,
    ) -> str:
    username = username.lower()
    member_result = await db.execute(select(Member.id).filter(Member.username==username))
    member_id = member_result.scalars().first()
    if not member_id:
        raise ValueError(f"Member '{username}' not found")

    media_result = await db.execute(select(Media.id).filter(Media.name==medium))
    media_id = media_result.scalars().first()
    if not media_id:
        raise ValueError(f"Medium '{medium}' not found")

    new_art = WrittenForm(
        id=art_id,
        title=title,
        date=date,
        creator_id=member_id,
        media_id=media_id,
        file_path=file_path,
        comments_enabled=comments_enabled,
    )
    db.add(new_art)
    await db.flush()

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
    return str(art_id)


async def db_update_written_form(
    db: AsyncSession,
    art_id: str,
    current_member_id: str,
    title: str,
    date=None,
    keywords: list[str] | None = None,
    comments_enabled: bool = False,
    medium: str | None = None,
):
    result = await db.execute(select(WrittenForm).filter(WrittenForm.id == art_id))
    piece = result.scalar_one_or_none()

    if piece is None:
        raise ValueError("Art not found")
    if str(piece.creator_id) != str(current_member_id):
        raise PermissionError("Not your piece")

    # Optional media move, restricted to compatible-type media (written_form ↔ written_form).
    if medium is not None:
        current_media = (
            await db.execute(select(Media).filter(Media.id == piece.media_id))
        ).scalar_one_or_none()
        current_type = current_media.type if current_media else None
        new_media = (
            await db.execute(select(Media).filter(Media.name == medium))
        ).scalar_one_or_none()
        if new_media is None:
            raise ValueError(f"Medium '{medium}' not found")
        if current_type is None or new_media.type is None or new_media.type != current_type:
            raise ValueError("Incompatible media type")
        if str(new_media.id) != str(piece.media_id):
            existing_link = (
                await db.execute(
                    select(Media_Members).filter(
                        Media_Members.media_id == new_media.id,
                        Media_Members.member_id == current_member_id,
                    )
                )
            ).scalar_one_or_none()
            if not existing_link:
                db.add(Media_Members(media_id=new_media.id, member_id=current_member_id))
            piece.media_id = new_media.id

    piece.title = title
    piece.date = date
    piece.comments_enabled = comments_enabled

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


async def db_remove_written_form(db: AsyncSession, art_id: str, current_member_id: str) -> str | None:
    result = await db.execute(select(Art.creator_id, Art.file_path).filter(Art.id == art_id))
    row = result.one_or_none()

    if row is None:
        raise ValueError("Art not found")

    creator_id, file_path = row
    if str(creator_id) != str(current_member_id):
        raise PermissionError("Not your piece")

    await db.execute(delete(KeywordArt).filter(KeywordArt.art_id == art_id))
    await db.execute(delete(WrittenForm).filter(WrittenForm.id == art_id))
    await db.execute(delete(Art).filter(Art.id == art_id))
    await db.commit()
    return file_path