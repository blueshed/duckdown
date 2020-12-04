""" test our site functions in procedures """
from .fixtures import sqlite_db
from liteblue.handlers import json_utils
from liteblue.connection import ConnectionMgr
from liteblue import context
from blue import procedures, tables
from blue.utils import User
from blue import broadcast


def test_prefs(sqlite_db):
    """ can we save and retrieve prefs """
    admin = User(id=1, email="admin", preferences={"foo": "bar"})
    with context._user_call_(admin):
        procedures.save_preferences(admin.preferences)
        assert len(broadcast.BROADCAST_ON_SUCCESS.get()) == 1

        assert procedures.profile() is admin

    assert len(broadcast.BROADCAST_ON_SUCCESS.get([])) == 0

    with ConnectionMgr.session() as session:
        row = session.execute(
            tables.user.select().where(tables.user.c.id == admin.id)
        ).fetchone()
        other = User(**{k: v for k, v in row.items() if k != "password"})
        assert other == admin

        rows = session.execute(tables.log.select().count()).scalar()
        assert rows == 1


def test_add_site(sqlite_db):
    """ add a site with the admin user """
    admin = User(id=1, email="admin", preferences={"foo": "bar"})
    site_name = "site"
    site_bucket = "bucket"
    other_email = "bert"
    with context._user_call_(admin):
        site = procedures.add_site(name=site_name, bucket=site_bucket)
        assert site["name"] == site_name
        assert site["bucket"] == site_bucket

        try:
            procedures.add_site(name=site_name, bucket=site_bucket)
            assert False, "unique site names"
        except procedures.UserException:
            pass

        for row in procedures.list_sites():
            print(json_utils.dumps(row))

        assert len(broadcast.BROADCAST_ON_SUCCESS.get()) == 1

    with ConnectionMgr.session() as session:
        rows = session.execute(tables.log.select().count()).scalar()
        assert rows == 2

    other = procedures.create_user(email=other_email)
    assert other.id == 2

    with context._user_call_(admin):
        procedures.grant_permission(site_name, other.email, "reader")
        assert len(broadcast.BROADCAST_ON_SUCCESS.get()) == 1

        procedures.grant_permission(site_name, other.email, "writer")
        assert len(broadcast.BROADCAST_ON_SUCCESS.get()) == 2

        try:
            procedures.grant_permission(site_name, other.email, "owner")
            assert False, "cannot pass ownership"
        except procedures.UserException:
            assert len(broadcast.BROADCAST_ON_SUCCESS.get()) == 2

        procedures.grant_permission(site_name, other.email)
        assert len(broadcast.BROADCAST_ON_SUCCESS.get()) == 3
        message, _ = broadcast.BROADCAST_ON_SUCCESS.get()[-1]
        assert message["action"] == "removed_permission"

    with ConnectionMgr.session() as session:
        rows = session.execute(tables.permission.select().count()).scalar()
        assert rows == 1

    with context._user_call_(admin):
        assert len(broadcast.BROADCAST_ON_SUCCESS.get()) == 0
        sites = procedures.list_sites()
        site_id = sites[-1]["id"]
        accl = procedures.get_site(site_id)
        assert len(broadcast.BROADCAST_ON_SUCCESS.get()) == 0

        assert len(accl) == 1
        assert accl[0]["email"] == admin.email
        assert accl[0]["permission"] == tables.PERMISSIONS_VALUES.owner
