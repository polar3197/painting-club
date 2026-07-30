import pytest
from db.db_ops.portfolios import validate_slug


def test_valid_slugs():
    assert validate_slug("charlie") == "charlie"
    assert validate_slug("Jane-Doe") == "jane-doe"  # lowercased


@pytest.mark.parametrize("bad", ["", "a", "-lead", "trail-", "has space", "dots.here", "sl/ash", "x" * 61, "ünïcode"])
def test_invalid_slugs(bad):
    with pytest.raises(ValueError):
        validate_slug(bad)
