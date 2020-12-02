# pylint: disable=unused-variable, too-many-locals
""" application entry point """
import logging
import os
import sys
import tornado.ioloop
import tornado.web
import tornado.log
import convoke
from pkg_resources import resource_filename
from .utils import json_utils
from .utils import vue_utils
from .utils import app_utils
from .utils.folder import Folder
from . import handlers

LOGGER = logging.getLogger(__name__)


class App(Folder, tornado.web.Application):
    """ an app served up out of a directory """

    def __init__(self, routes=None, **settings):
        """ set up """
        Folder.__init__(self, directory=settings["app_path"])
        routes = [] if routes is None else routes
        app_utils.setup_routes(self, routes, settings)
        settings.setdefault("local_images", True)
        settings.setdefault("img_path", "/static/images/")

        static_path = os.path.join(settings["app_path"], "static")
        settings.setdefault("static_path", static_path)
        template_path = os.path.join(settings["app_path"], "templates")
        settings.setdefault("template_path", template_path)

        routes.extend([(r"/(.*)", handlers.SiteHandler, {"pages": "pages/"})])
        tornado.web.Application.__init__(
            self,
            routes,
            **settings,
        )


def make_app_path(settings, name, default):
    """ return path relative to app """
    return os.path.join(
        settings.get("app_path", ""), settings.get(name, default)
    )


def make_app():
    """ make a tornado application """
    LOGGER.info(sys.path)
    settings = convoke.get_settings("duckdown")
    debug = settings.as_bool("debug", default="False")
    production = settings.as_bool("production", default="True")

    manifest = vue_utils.load_manifest(production)

    static_path = make_app_path(settings, "static_path", "static")
    template_path = make_app_path(settings, "template_path", "templates")
    pages_path = make_app_path(settings, "pages_path", "pages")
    users_path = make_app_path(settings, "users_path", "users.json")
    img_path = settings.get("img_path", "")

    tornado_settings = {
        "debug": debug,
        "production": production,
        "port": settings.as_int("port", default="8080"),
        "duck_users": users_path,
        "duck_scripts": settings.get("scripts", "scripts"),
        "duck_path": "/edit/assets/",
        "duck_assets": resource_filename("duckdown", "assets"),
        "duck_templates": resource_filename("duckdown", "templates"),
        "static_path": settings.get("static", static_path),
        "template_path": settings.get("templates", template_path),
        "cookie_name": settings.get("cookie_name", "duckdown-cookie"),
        "cookie_secret": settings.get(
            "cookie_secret", "it was a dark and stormy duckdown"
        ),
        "login_url": settings.get("login_url", "/login"),
        "app_name": settings.get("app_name", "duckdown-app"),
        "local_images": settings.as_bool("local_images", default="False"),
        "img_path": img_path,
        "compress_response": True,
    }

    # load aws credentials
    image_bucket = {
        "bucket_name": settings.get("image_bucket", None),
        "aws_access_key_id": settings.get("AWS_ACCESS_KEY_ID", None),
        "aws_secret_access_key": settings.get("AWS_SECRET_ACCESS_KEY", None),
        "folder": "images/",
    }

    LOGGER.info("settings:")
    for key, value in tornado_settings.items():
        LOGGER.info("\t%s: %r", key, value)

    routes = [
        (
            r"/login",
            handlers.LoginHandler,
            {"users": json_utils.load(open(users_path))},
        ),
        (r"/logout", handlers.LogoutHandler),
        (r"/browse/(.*)", handlers.S3Browser, image_bucket),
        (
            r"/edit/assets/(.*)",
            tornado.web.StaticFileHandler,
            {"path": tornado_settings["duck_assets"]},
        ),
        (r"/edit/mark/", handlers.MarkHandler),
        (r"/edit/pages/(.*)", handlers.DirHandler, {"directory": pages_path}),
        (
            r"/edit",
            handlers.EditorHandler,
            {"manifest": manifest, "page": "vue.html"},
        ),
        (r"/(.*)", handlers.SiteHandler, {"pages": pages_path}),
    ]

    vue_utils.install_vue_handlers(routes, production)

    return tornado.web.Application(routes, **tornado_settings)
