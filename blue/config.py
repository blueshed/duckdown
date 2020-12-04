# pylint: disable=too-few-public-methods
""" Configuration settings for blue """
import os
from pkg_resources import resource_filename
from liteblue import config


class Config(config.Config):
    """ overide of default config """

    name = "blue"
    procedures = "blue.procedures"
    duckdown = "site2"

    tornado_debug = True
    tornado_cookie_name = f"{name}-user"
    tornado_cookie_secret = f"it was dark and stormy night for {name}"

    db_url = os.getenv("DB_URL", "sqlite:///blue.db")
    db_url = os.getenv("DB_URL", "sqlite:///tests/blue_tests/test.db")
    alembic_script_location = resource_filename("blue", "scripts")

    redis_topic = f"{name}-broadcast"  # topic for all broadcasts
    redis_queue = f"{name}-work"  # queue for remote workers
