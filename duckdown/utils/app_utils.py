""" commonalities """
import logging
import tornado.web
from pkg_resources import resource_filename
from .. import handlers
from . import json_utils
from . import vue_utils

LOGGER = logging.getLogger(__name__)


def setup_routes(app, routes, settings):
    """ do the thing """

    settings.setdefault("app_name", "duckdown-app")
    settings.setdefault("duck_path", "/edit/assets/")
    settings.setdefault("duck_assets", resource_filename("duckdown", "assets"))
    settings.setdefault(
        "duck_templates", resource_filename("duckdown", "templates")
    )
    settings.setdefault("login_url", "/login")

    users = json_utils.loads(app.get_file("users.json")[-1])
    LOGGER.info(users)

    debug = settings.get("debug", False)
    manifest = vue_utils.load_manifest(debug)
    vue_utils.install_vue_handlers(routes, debug)
    bucket_name = settings.get("image_bucket", None)
    routes.extend(
        [
            (r"/login", handlers.LoginHandler, {"users": users}),
            (r"/logout", handlers.LogoutHandler),
            (
                r"/browse/(.*)",
                handlers.S3Browser,
                {"bucket_name": bucket_name, "folder": "static/images/"},
            ),
            (
                r"/edit/assets/(.*)",
                tornado.web.StaticFileHandler,
                {"path": resource_filename("duckdown", "assets")},
            ),
            (r"/edit/mark/", handlers.MarkHandler),
            (
                r"/edit/pages/(.*)",
                handlers.DirHandler,
            ),
            (
                r"/edit",
                handlers.EditorHandler,
                {"page": "vue.html", "manifest": manifest},
            ),
        ]
    )
