# pylint: disable=C0103
""" Simple remote functions """
import sys
from sqlalchemy import sql
from liteblue.describe import describe, describe_sql
from liteblue.connection import ConnectionMgr
from liteblue import context
from . import tables


__all__ = ["add", "create_user", "list_users", "reflect", "profile"]


def add(a: int, b: int) -> int:
    """ returns the sum of a and b """
    return a + b


def create_user(email: str) -> dict:
    """ create a db user """
    with ConnectionMgr.session() as session:
        row = session.execute(
            sql.insert(tables.user, {"email": email})
        ).inserted_primary_key
        session.commit()
        return {"email": email, "id": row[0]}


def list_users() -> list:
    """ returns a list of users """
    with ConnectionMgr.session() as session:
        rows = session.execute(sql.select([tables.user.c.email, tables.user.c.id]))
        return [dict(row) for row in rows]


async def reflect() -> dict:
    """ describes available procedures """
    return {
        "procedures": describe(sys.modules[__name__], __all__),
        "tables": describe_sql(tables.metadata),
    }


def profile():
    """ returns the current user """
    return context.current_user()
