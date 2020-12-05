""" fixtures for our tests """
import os
import logging
import pytest
import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError
from alembic import command
from alembic.config import Config
from liteblue.connection import ConnectionMgr
from liteblue.handlers import json_utils


def json_serializer(obj):
    result = json_utils.dumps(obj)
    logging.debug(result)
    return result


@pytest.fixture(scope="session")
def sqlite_db():
    """ provide the name for a sqlite connection """
    path = "tests/blue_tests/test.db"
    if os.path.isfile(path):
        os.unlink(path)
    db_url = f"sqlite:///{path}"
    alembic_config = Config()
    alembic_config.set_main_option("sqlalchemy.url", db_url)
    alembic_config.set_main_option("script_location", "blue/scripts")
    command.upgrade(alembic_config, "head")

    ConnectionMgr.connection(
        "default",
        db_url,
        echo=False,
        json_serializer=json_serializer,
    )
    with ConnectionMgr.session() as session:
        try:
            session.execute(
                "INSERT INTO user (email, password) VALUES ('admin', 'gAAAAABfyLo5TeGnv0ZWjbpjeDXmQELq9-mChiWi0bTeVbT84Y5bJYjKy2uHrP4Hanu3pDOXq-zZ7nk2xF8T3PCkt5dTiGdI1Q==')"
            )
            session.commit()
        except IntegrityError:
            pass
    return "default"
