# pylint: disable=C0103
""" Simple remote functions """
import logging
import sys
from sqlalchemy import sql
from sqlalchemy.exc import IntegrityError
from liteblue.describe import describe, describe_sql
from liteblue.connection import ConnectionMgr
from liteblue import context
from .broadcast import broadcast_on_success, logger
from .utils import User
from . import tables

LOGGER = logging.getLogger(__name__)

__all__ = ["profile", "add_site", "save_preferences", "grant_permission"]


class UserException(Exception):
    """ user messed up """


def create_user(email: str) -> dict:
    """ create a db user """
    with ConnectionMgr.session() as session:
        row = session.execute(
            tables.user.insert().values({"email": email})
        ).inserted_primary_key
        session.commit()
        result = User(id=row[0], email=email)
        LOGGER.info("created %s", result)
        return result


def list_users() -> list:
    """ returns a list of users """
    with ConnectionMgr.session() as session:
        rows = session.execute(
            sql.select([tables.user.c.email, tables.user.c.id])
        )
        return [dict(row) for row in rows]


def profile():
    """ returns the current user """
    return context.current_user()


def list_sites():
    """ return the list of sites for the current user """
    result = []
    email = context.current_user().email
    with ConnectionMgr.session() as session:
        user_id = (
            sql.select([tables.user.c.id])
            .where(tables.user.c.email == email)
            .as_scalar()
        )
        query = (
            sql.select([tables.site, tables.permission.c.permission])
            .select_from(
                tables.site.join(
                    tables.permission,
                    tables.site.c.id == tables.permission.c.site_id,
                )
            )
            .where(tables.permission.c.user_id == user_id)
        )
        LOGGER.info(query)
        for row in session.execute(query):
            result.append(dict(row))
    return result


def site_accl(site_id):
    """ returns a list of email and permission """
    current_user = context.current_user()
    with ConnectionMgr.session() as session:
        LOGGER.info("is owner: %s %s", current_user.id, site_id)
        query = sql.select([tables.permission.c.user_id]).where(
            sql.and_(
                tables.permission.c.site_id == site_id,
                tables.permission.c.permission
                == tables.PERMISSIONS_VALUES["owner"],
            )
        )
        row = session.execute(query).scalar()
        if row != current_user.id:
            raise UserException("Not owner.")
        query = (
            sql.select([tables.user.c.email, tables.permission.c.permission])
            .select_from(
                tables.user.join(
                    tables.permission,
                    tables.user.c.id == tables.permission.c.user_id,
                )
            )
            .where(tables.permission.c.site_id == site_id)
        )
        return [dict(row) for row in session.execute(query)]


@logger
def add_site(name, bucket, subdomain=None, public=False):
    """ add a site for the current user """
    current_user = context.current_user()
    with ConnectionMgr.session() as session:
        user_id = (
            sql.select([tables.user.c.id])
            .where(tables.user.c.email == current_user.email)
            .as_scalar()
        )

        LOGGER.info("user_id: %r", user_id)
        try:
            site_id = session.execute(
                sql.insert(
                    tables.site,
                    {
                        "name": name,
                        "bucket": bucket,
                        "subdomain": subdomain,
                        "public": public,
                    },
                )
            ).inserted_primary_key[0]
        except IntegrityError as ex:
            raise UserException("That site name is not available") from ex

        session.execute(
            sql.insert(
                tables.permission,
                {
                    "user_id": user_id,
                    "site_id": site_id,
                    "permission": "owner",
                },
            )
        )
        session.commit()
        row = session.execute(
            sql.select([tables.site]).where(tables.site.c.id == site_id)
        ).fetchone()
        result = dict(row)
        broadcast_on_success(
            {"signal": "added-site", "message": dict(row)}, [current_user.id]
        )
        return result


@logger
def save_preferences(values: dict) -> None:
    """ save the current users preferences """
    user_id = context.current_user().id
    LOGGER.info("saving pref")
    broadcast_on_success(
        {"signal": "saved-preferences", "message": values}, [user_id]
    )
    with ConnectionMgr.session() as session:
        affected = session.execute(
            tables.user.update()
            .where(tables.user.c.id == user_id)
            .values(preferences=values)
        )
        assert affected.rowcount == 1
        session.commit()


@logger
def grant_permission(site, email, permission=None):
    """ grant permission to site, current user is owner, to email """
    user_id = context.current_user().id
    with ConnectionMgr.session() as session:
        LOGGER.info("fetching site: %s", tables.PERMISSIONS_VALUES["owner"])
        query = (
            sql.select([tables.permission.c.site_id])
            .select_from(
                tables.permission.join(
                    tables.site,
                    tables.permission.c.site_id == tables.site.c.id,
                )
            )
            .where(
                sql.and_(
                    tables.permission.c.user_id == user_id,
                    tables.permission.c.permission
                    == tables.PERMISSIONS_VALUES["owner"],
                    tables.site.c.name == site,
                )
            )
        )
        LOGGER.info(query)
        site_id = session.execute(query).scalar()
        LOGGER.info("site_id: %s", site_id)
        assert site_id is not None, "unknown site, or you don't own it."

        LOGGER.info("fetching other user: %r", email)
        query = sql.select([tables.user.c.id]).where(
            tables.user.c.email == email
        )
        other_id = session.execute(query).scalar()
        LOGGER.info("other: %s", other_id)
        assert other_id is not None, "unknown email address"

        if permission is None:
            LOGGER.info("removing permission")
            session.execute(
                tables.permission.delete().where(
                    sql.and_(
                        tables.permission.c.user_id == other_id,
                        tables.permission.c.site_id == site_id,
                    )
                )
            )
            broadcast_on_success(
                {"signal": "removed-permission", "message": (site, email)},
                [user_id, other_id],
            )
        else:
            try:
                role = getattr(tables.PERMISSIONS_VALUES, permission)
                LOGGER.info(
                    "granting permission %s: %s", permission, role.value
                )
            except ValueError as ex:
                raise UserException("that is not a permission") from ex

            if role == tables.PERMISSIONS_VALUES.owner:
                raise UserException("You canot grant ownership to others.")

            LOGGER.info("updating permission")
            rowcount = session.execute(
                tables.permission.update()
                .where(
                    sql.and_(
                        tables.permission.c.user_id == other_id,
                        tables.permission.c.site_id == site_id,
                    )
                )
                .values(permission=role)
            ).rowcount
            if rowcount == 0:

                LOGGER.info("oops, creating it")
                session.execute(
                    tables.permission.insert().values(
                        user_id=other_id, site_id=site_id, permission=role
                    )
                ).rowcount
            broadcast_on_success(
                {
                    "signal": "added-permission",
                    "message": (site, email, permission),
                },
                [user_id, other_id],
            )
