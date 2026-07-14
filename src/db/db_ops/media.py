
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func, desc, nulls_last, asc

from db.models import Member, Media, Media_Members, Visual2D, WrittenForm, Audio, Keyword, KeywordArt, Art, Series
from db.db_ops.series import db_get_or_create_series

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


async def db_reorder_member_media(
    db: AsyncSession, member_id, ordered_names: list[str]
) -> None:
    """Persist the member's tab order: position = index in ordered_names.
    Names the member doesn't have are ignored (tolerates races with a
    just-removed medium); the member's media absent from the list keep their
    old position untouched. Empty list = no-op."""
    if not ordered_names:
        return
    rows = (
        await db.execute(
            select(Media_Members, Media.name)
            .join(Media, Media.id == Media_Members.media_id)
            .filter(Media_Members.member_id == member_id)
        )
    ).all()
    by_name = {name: link for link, name in rows}
    for index, name in enumerate(ordered_names):
        link = by_name.get(name)
        if link is not None:
            link.position = index
    await db.commit()


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
        select(Visual2D, Series.name)
        .outerjoin(Series, Series.id == Visual2D.series_id)
        .filter(Visual2D.creator_id == member_id, Visual2D.media_id == media_id)
        .order_by(nulls_last(desc(Visual2D.date)))
    )
    rows = result.all()

    art_with_keywords = []
    for art, series_name in rows:
        keywords = await db_get_art_keywords(db=db, art_id=art.id)
        art_with_keywords.append((art, keywords, series_name))

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
        collection_id=None,
        series_name: str | None = None,
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

    # Ensure the member has this medium on their profile. Creating the link with
    # default hidden=false; if the row already exists (visible OR hidden), we
    # leave it untouched so a previously-hidden medium stays hidden.
    existing_link = (
        await db.execute(
            select(Media_Members).filter(
                Media_Members.media_id == media_id,
                Media_Members.member_id == member_id,
            )
        )
    ).scalar_one_or_none()
    if not existing_link:
        db.add(Media_Members(media_id=media_id, member_id=member_id))

    # Optional series ("series" for paintings — same table as writing
    # collections and audio albums), get-or-created by name.
    series_id = None
    if series_name and series_name.strip():
        series = await db_get_or_create_series(db, member_id, media_id, series_name)
        series_id = series.id

    # use this to create the entry in Art
    new_art = Visual2D(
        id=art_id,
        title=title,
        date=date,
        creator_id=member_id,
        media_id=media_id,
        collection_id=collection_id,
        series_id=series_id,
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
    file_path: str | None = None,
    aspect_ratio: float | None = None,
    update_file: bool = False,
    series_name: str | None = None,
    clear_series: bool = False,
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
    if update_file and file_path is not None:
        piece.file_path = file_path
        piece.aspect_ratio = aspect_ratio

    # Series membership (mirrors written form): explicit clear wins; a new
    # series name moves the piece and resets its position in the new series.
    if clear_series:
        piece.series_id = None
        piece.series_order_index = None
    elif series_name is not None and series_name.strip():
        series = await db_get_or_create_series(db, piece.creator_id, piece.media_id, series_name)
        if piece.series_id != series.id:
            piece.series_order_index = None
        piece.series_id = series.id

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
        select(WrittenForm, Series.name)
        .outerjoin(Series, Series.id == WrittenForm.series_id)
        .filter(WrittenForm.creator_id == member_id, WrittenForm.media_id == media_id)
        # Top-level ordering stays date-desc so each series's position in the
        # gallery is set by its most recent piece. Intra-series ordering by
        # order_index is applied client-side once the rows are grouped.
        .order_by(nulls_last(desc(WrittenForm.date)))
    )
    rows = result.all()

    art_with_keywords = []
    for art, series_name in rows:
        keywords = await db_get_art_keywords(db=db, art_id=art.id)
        art_with_keywords.append((art, keywords, series_name))

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
        series_name: str | None = None,
        cover_image_path: str | None = None,
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

    series_id = None
    if series_name and series_name.strip():
        series = await db_get_or_create_series(db, member_id, media_id, series_name)
        series_id = series.id

    new_art = WrittenForm(
        id=art_id,
        title=title,
        date=date,
        creator_id=member_id,
        media_id=media_id,
        series_id=series_id,
        file_path=file_path,
        comments_enabled=comments_enabled,
        cover_image_path=cover_image_path,
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
    series_name: str | None = None,
    clear_series: bool = False,
    file_path: str | None = None,
    cover_image_path: str | None = None,
    clear_cover: bool = False,
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
    if file_path is not None:
        piece.file_path = file_path
    if clear_cover:
        piece.cover_image_path = None
    elif cover_image_path is not None:
        piece.cover_image_path = cover_image_path

    if clear_series:
        piece.series_id = None
    elif series_name is not None and series_name.strip():
        series = await db_get_or_create_series(db, piece.creator_id, piece.media_id, series_name)
        piece.series_id = series.id

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


async def db_remove_written_form(
    db: AsyncSession, art_id: str, current_member_id: str
) -> tuple[str | None, str | None]:
    """Delete a written piece. Returns (file_path, cover_image_path) so the
    caller can unlink both files from disk after the commit."""
    # Select off the subclass: it carries the base columns via joined
    # inheritance. (Selecting from Art AND joining WrittenForm would put `art`
    # in the FROM twice and return duplicate rows.)
    result = await db.execute(
        select(WrittenForm.creator_id, WrittenForm.file_path, WrittenForm.cover_image_path)
        .filter(WrittenForm.id == art_id)
    )
    row = result.one_or_none()

    if row is None:
        raise ValueError("Art not found")

    creator_id, file_path, cover_image_path = row
    if str(creator_id) != str(current_member_id):
        raise PermissionError("Not your piece")

    await db.execute(delete(KeywordArt).filter(KeywordArt.art_id == art_id))
    await db.execute(delete(WrittenForm).filter(WrittenForm.id == art_id))
    await db.execute(delete(Art).filter(Art.id == art_id))
    await db.commit()
    return file_path, cover_image_path


# ============================================================
# Audio (voice memos + uploaded music). Modeled on visual_2d:
# a single file on disk, keyword-tagged, no series grouping.
# ============================================================
async def db_get_audio(db: AsyncSession, username: str, medium: str):
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
        select(Audio, Series.name)
        .outerjoin(Series, Series.id == Audio.series_id)
        .filter(Audio.creator_id == member_id, Audio.media_id == media_id)
        .order_by(nulls_last(desc(Audio.date)))
    )
    rows = result.all()

    art_with_keywords = []
    for art, series_name in rows:
        keywords = await db_get_art_keywords(db=db, art_id=art.id)
        art_with_keywords.append((art, keywords, series_name))

    return art_with_keywords


async def db_add_audio(
        db: AsyncSession,
        art_id,
        username: str,
        medium: str,
        title: str,
        file_path: str,
        date=None,
        artist: str | None = None,
        duration_seconds: float | None = None,
        keywords: list[str] | None = None,
        comments_enabled: bool = False,
        series_name: str | None = None,
    ) -> str:
    username = username.lower()
    member_result = await db.execute(select(Member.id).filter(Member.username == username))
    member_id = member_result.scalars().first()
    if not member_id:
        raise ValueError(f"Member '{username}' not found")

    media_result = await db.execute(select(Media.id).filter(Media.name == medium))
    media_id = media_result.scalars().first()
    if not media_id:
        raise ValueError(f"Medium '{medium}' not found")

    # Ensure the member has this medium on their profile (mirrors visual_2d):
    # create the link if absent, leave a pre-existing (possibly hidden) one alone.
    existing_link = (
        await db.execute(
            select(Media_Members).filter(
                Media_Members.media_id == media_id,
                Media_Members.member_id == member_id,
            )
        )
    ).scalar_one_or_none()
    if not existing_link:
        db.add(Media_Members(media_id=media_id, member_id=member_id))

    # Optional album membership (an "album" is a series of audio pieces).
    series_id = None
    if series_name and series_name.strip():
        series = await db_get_or_create_series(db, member_id, media_id, series_name)
        series_id = series.id

    new_art = Audio(
        id=art_id,
        title=title,
        date=date,
        creator_id=member_id,
        media_id=media_id,
        series_id=series_id,
        file_path=file_path,
        comments_enabled=comments_enabled,
        artist=artist,
        duration_seconds=duration_seconds,
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


async def db_update_audio(
    db: AsyncSession,
    art_id: str,
    current_member_id: str,
    title: str,
    date=None,
    artist: str | None = None,
    duration_seconds: float | None = None,
    keywords: list[str] | None = None,
    comments_enabled: bool = False,
    medium: str | None = None,
    file_path: str | None = None,
    series_name: str | None = None,
    clear_series: bool = False,
):
    result = await db.execute(select(Audio).filter(Audio.id == art_id))
    piece = result.scalar_one_or_none()

    if piece is None:
        raise ValueError("Art not found")
    if str(piece.creator_id) != str(current_member_id):
        raise PermissionError("Not your piece")

    # Optional media move, restricted to compatible-type media (audio ↔ audio).
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
    piece.artist = artist
    # Only overwrite duration when a fresh value is supplied (e.g. file swap);
    # a None on a metadata-only edit must not wipe the stored duration.
    if duration_seconds is not None:
        piece.duration_seconds = duration_seconds
    if file_path is not None:
        piece.file_path = file_path

    # Album membership (mirrors written form / visual_2d series handling).
    if clear_series:
        piece.series_id = None
        piece.series_order_index = None
    elif series_name is not None and series_name.strip():
        series = await db_get_or_create_series(db, piece.creator_id, piece.media_id, series_name)
        if piece.series_id != series.id:
            piece.series_order_index = None
        piece.series_id = series.id

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


async def db_remove_audio(db: AsyncSession, art_id: str, current_member_id: str) -> str | None:
    result = await db.execute(select(Art.creator_id, Art.file_path).filter(Art.id == art_id))
    row = result.one_or_none()

    if row is None:
        raise ValueError("Art not found")

    creator_id, file_path = row
    if str(creator_id) != str(current_member_id):
        raise PermissionError("Not your piece")

    await db.execute(delete(KeywordArt).filter(KeywordArt.art_id == art_id))
    await db.execute(delete(Audio).filter(Audio.id == art_id))
    await db.execute(delete(Art).filter(Art.id == art_id))
    await db.commit()
    return file_path