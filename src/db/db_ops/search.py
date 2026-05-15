
import asyncio

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, nulls_last

from db.models import Member, Media, Media_Members, Visual2D, Keyword, KeywordArt, Art

async def db_search_members(db: AsyncSession, city: str | None, uname: str | None):
    query = select(Member)
    if uname:
        query = query.filter(Member.username == uname.lower())
    if city:
        query = query.where(Member.city == city)
    result = await db.execute(query)
    return result.scalars().all()

async def db_get_search_options(db: AsyncSession, medium: str | None = None, username: str | None = None):
    queries = [
        db.execute(select(Member.username).distinct()),
        db.execute(select(Member.firstname, Member.lastname).where(Member.firstname.isnot(None))),
        db.execute(select(Member.city).distinct()),
        db.execute(select(Art.title).distinct()),
        db.execute(select(Visual2D.song).distinct().where(Visual2D.song.isnot(None))),
        db.execute(select(Media.name).distinct()),
    ]
    if medium:
        kw_query = (
            select(Keyword.keyword).distinct()
            .join(KeywordArt, Keyword.id == KeywordArt.keyword_id)
            .join(Art, KeywordArt.art_id == Art.id)
            .join(Media, Art.media_id == Media.id)
            .filter(Media.name == medium)
        )
        if username:
            kw_query = kw_query.join(Member, Art.creator_id == Member.id).filter(Member.username == username.lower())
        queries.append(db.execute(kw_query))
    else:
        queries.append(db.execute(select(Keyword.keyword).distinct()))

    results = await asyncio.gather(*queries)
    unique_usernames = results[0].scalars().all()
    name_rows = results[1].all()
    unique_fullnames = list({f"{r.firstname} {r.lastname}".strip() for r in name_rows if r.firstname or r.lastname})
    unique_cities = results[2].scalars().all()
    unique_titles = results[3].scalars().all()
    unique_songs = results[4].scalars().all()
    unique_mediums = results[5].scalars().all()
    unique_keywords = results[6].scalars().all()
    return unique_usernames, unique_fullnames, unique_cities, unique_keywords, unique_titles, unique_songs, unique_mediums


async def db_search_art(db: AsyncSession, q: str):
    # Visual2D already joins art via inheritance — do not join Art explicitly.
    # The Media_Members join + hidden=False filter excludes art whose creator has
    # marked that medium as hidden on their profile.
    base_query = (
        select(Visual2D, Media.name, Member.username, Member.city)
        .join(Media, Art.media_id == Media.id)
        .join(Member, Art.creator_id == Member.id)
        .join(
            Media_Members,
            (Media_Members.member_id == Member.id) & (Media_Members.media_id == Media.id),
        )
        .where(Media_Members.hidden == False)
        .order_by(nulls_last(desc(Art.created_at)))
    )

    if q:
        field_results = await db.execute(
            base_query.where(
                Art.title.ilike(f"%{q}%") |
                Visual2D.song.ilike(f"%{q}%") |
                Member.city.ilike(f"%{q}%") |
                Media.name.ilike(f"%{q}%")
            )
        )
        keyword_results = await db.execute(
            base_query
            .join(KeywordArt, KeywordArt.art_id == Art.id)
            .join(Keyword, Keyword.id == KeywordArt.keyword_id)
            .where(Keyword.keyword.ilike(f"%{q}%"))
        )
        rows = {str(r[0].id): r for r in field_results.all()}
        for r in keyword_results.all():
            rows.setdefault(str(r[0].id), r)
        rows = list(rows.values())
    else:
        result = await db.execute(base_query)
        rows = result.all()

    art_list = []
    for visual2d, medium_name, username, city in rows:
        keywords_result = await db.execute(
            select(Keyword.keyword)
            .join(KeywordArt, Keyword.id == KeywordArt.keyword_id)
            .where(KeywordArt.art_id == visual2d.id)
        )
        art_list.append({
            "id": str(visual2d.id),
            "title": visual2d.title,
            "medium": medium_name,
            "keywords": list(keywords_result.scalars().all()),
            "song": visual2d.song,
            "file_path": visual2d.file_path,
            "date": str(visual2d.date) if visual2d.date else None,
            "location": visual2d.location,
            "creator_username": username,
            "creator_city": city,
            "aspect_ratio": visual2d.aspect_ratio,
        })

    return art_list