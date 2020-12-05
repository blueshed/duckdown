""" test our site functions in procedures """
from .fixtures import sqlite_db
from liteblue.connection import ConnectionMgr
from blue.auth import upsert_user, get_user
from blue import tables


def test_cognito(sqlite_db):
    """ can we save and retrieve user """

    user = upsert_user({"email": "admin"})
    assert user.email == "admin"
    assert user.cognito["email"] == "admin"

    with ConnectionMgr.session() as session:
        password, user = get_user(session, "admin")
        assert user.email == "admin"
        assert user.cognito["email"] == "admin"
        assert password is not None

    user = upsert_user({"email": "foo"})
    assert user.email == "foo"
    assert user.cognito["email"] == "foo"

    with ConnectionMgr.session() as session:
        password, user = get_user(session, "foo")
        assert user.email == "foo"
        assert user.cognito["email"] == "foo"
        assert password is None

        session.execute(
            tables.user.delete().where(tables.user.c.id == user.id)
        )
        session.commit()
