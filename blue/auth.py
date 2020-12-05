""" two options: local or cognito """
import logging
from sqlalchemy import sql
from liteblue.connection import ConnectionMgr
from .cognito_auth import CognitoHandler
from .utils import User
from . import tables

LOGGER = logging.getLogger(__name__)


def get_user(session, email):
    """ commonality """
    row = session.execute(
        sql.select(
            [tables.user.c.id, tables.user.c.email, tables.user.c.cognito]
        ).where(tables.user.c.email == email)
    ).fetchone()
    return (
        (
            row["password"],
            User(
                id=row["id"],
                email=row["email"],
                cognito=row["cognito"],
            ),
        )
        if row
        else (None, None)
    )


def upsert_user(oath2_user):
    """ a testable function to store user """
    email = oath2_user["email"]
    with ConnectionMgr.session() as session:
        query = (
            tables.user.update()
            .where(tables.user.c.email == email)
            .values(cognito=oath2_user)
        )
        LOGGER.info("upsert user: %s", email)
        rowcount = session.execute(query).rowcount
        if rowcount == 0:
            query = tables.user.insert().values(
                email=email, preferences={}, cognito=oath2_user
            )
            LOGGER.info("new user: %s", email)
            session.execute(query)
        session.commit()
        # we don't need the password
        _, user = get_user(session, email)
        return user


class CognitoDuckdown(CognitoHandler):
    """ store standard oath2 response """

    def set_current_user(self, user):
        """ this user has a cognito attribute """
        if user:
            user = upsert_user(user)
        super().set_current_user(user)


class SqlAuthenticator:
    """ trick duck to quack blue """

    @classmethod
    def get(cls, username):
        """ get a user from the db """
        with ConnectionMgr.session() as session:
            return get_user(session, username)
