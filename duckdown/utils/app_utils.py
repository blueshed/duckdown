""" commonalities """
import logging
import tornado.web
from pkg_resources import resource_filename
from .. import handlers
from . import vue_utils

LOGGER = logging.getLogger(__name__)


def setup_routes(app, routes, settings, s3_pages_key=None):
    """ do the thing """

    settings.setdefault("app_name", "duckdown-app")
    settings.setdefault("duck_path", "/edit/assets/")
    settings.setdefault("duck_assets", resource_filename("duckdown", "assets"))
    settings.setdefault(
        "duck_templates", resource_filename("duckdown", "templates")
    )
    settings.setdefault("login_url", "/login")

    users = app.load_users()
    LOGGER.info(users)

    debug = settings.get("debug", False)
    bucket_name = settings.get("image_bucket", None)
    vue_page = settings.get("vue_page", "vue.html")
    manifest = vue_utils.load_manifest(debug)
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
                {"directory": "pages/", "s3_key": s3_pages_key},
            ),
            (
                r"/edit",
                handlers.EditorHandler,
                {"page": vue_page, "manifest": manifest},
            ),
        ]
    )
    vue_utils.install_vue_handlers(routes, debug)
