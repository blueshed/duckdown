""" Our liteblue app """
import os
from liteblue.connection import ConnectionMgr
from duckdown.utils import run_tornado
from .app import BlueApp
from .config import Config, make_cognito


def make_app(cfg):
    """ Construct our app and setup db """
    ConnectionMgr.connection("default", cfg.db_url, **cfg.connection_kwargs)
    settings = {
        "app_path": cfg.duckdown,
        "debug": cfg.tornado_debug,
        "cookie_name": cfg.tornado_cookie_name,
        "cookie_secret": cfg.tornado_cookie_secret,
        "vue_page": "blue_vue.html",
    }
    if os.getenv("COGNITO_KEY"):
        make_cognito(settings)
    return BlueApp(cfg, **settings)


def main():  # pragma: no cover
    """ run the application """
    run_tornado.run(make_app(Config))
