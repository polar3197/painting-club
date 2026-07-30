from db.models import Art, Base


def test_art_visibility_column():
    assert "visibility" in Art.__table__.c
    assert Art.__table__.c.visibility.default.arg == "club"


def test_portfolio_tables_registered():
    for t in ("portfolio", "portfolio_block", "portfolio_block_piece"):
        assert t in Base.metadata.tables
    p = Base.metadata.tables["portfolio"]
    assert p.c.slug.unique
    assert p.c.member_id.unique
