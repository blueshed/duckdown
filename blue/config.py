# pylint: disable=too-few-public-methods
""" Configuration settings for blue """
import os
import logging
from pkg_resources import resource_filename
from liteblue import config
from .auth import CognitoDuckdown
from .utils import get_ngrok_url

LOGGER = logging.getLogger(__name__)


class Config(config.Config):
    """ overide of default config """

    name = "blue"
    procedures = "blue.procedures"
    duckdown = "site2"

    tornado_debug = False
    tornado_cookie_name = f"{name}-user"
    tornado_cookie_secret = f"it was dark and stormy night for {name}"

    db_url = os.getenv("DB_URL", "sqlite:///blue.db")
    db_url = os.getenv("DB_URL", "sqlite:///tests/blue_tests/test.db")
    alembic_script_location = resource_filename("blue", "scripts")

    redis_topic = f"{name}-broadcast"  # topic for all broadcasts
    redis_queue = f"{name}-work"  # queue for remote workers


def make_cognito(settings):
    ngrok_url = get_ngrok_url()
    cognito_pool = os.environ["COGNITO_POOL"]
    LOGGER.info("cognito_pool: %s", cognito_pool)
    settings["cognito_oauth"] = {
        "key": os.environ["COGNITO_KEY"],
        "secret": os.environ["COGINTO_SECRET"],
        "redirect_url": f"{ngrok_url}/login",
        "endpoint": f"https://{cognito_pool}.amazoncognito.com",
    }
    settings["login_url"] = f"{ngrok_url}/login"
    settings["login_handler"] = (CognitoDuckdown,)
    settings["cookie_secret"] = "it was a dark and stormy cognito duck"
