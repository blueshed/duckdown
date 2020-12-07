# pylint: disable=unused-variable, too-many-locals
""" application entry point """
import logging
import os
import time
import tornado.ioloop
import tornado.web
import tornado.log
from pkg_resources import resource_filename
from .utils import json_utils
from .utils.folder import Folder
from .utils.s3_folders import S3Folder
from .utils.s3tmpl_loader import S3Loader
from .handlers.access_control import DictAuthenticator
from . import handlers

LOGGER = logging.getLogger(__name__)

PAGE_PATH = "pages/"
TEMPLATE_PATH = "templates/"
IMAGES_PATH = "static/images/"
SCRIPT_PATH = "scripts/"
STATIC_PATH = "static/"
USERS_PATH = "users.json"
IMG_PATH = "/static/images/"


class App(tornado.web.Application):
    """ an app served up out of a directory """

    def __init__(self, routes=None, **settings):
        """ set up """
        debug = settings.setdefault("debug", False)
        bucket_name = settings.get("bucket")
        app_path = settings.setdefault("app_path", "")
        app_name = settings.setdefault("app_name", "duckdown-app")
        add_default_paths(settings)

        if bucket_name:
            LOGGER.info("duckdown s3: %s", bucket_name)
            aws_region = os.getenv("AWS_REGION")
            self.folder = S3Folder(bucket_name, region=aws_region)
            settings.setdefault("local_images", False)
            settings.setdefault("image_path", False)
            settings.setdefault("image_bucket", bucket_name)
            settings.setdefault(
                "img_path",
                f"{self.folder.s3bucket_url}/{IMAGES_PATH}",
            )
            settings["static_handler_class"] = handlers.S3StaticFiles
        else:
            LOGGER.info("duckdown local: %s", app_path)

            self.folder = Folder(directory=app_path)
            settings.setdefault("local_images", True)
            settings.setdefault("img_path", IMG_PATH)

        if settings.get("image_bucket"):
            self.folder.set_image_bucket(
                S3Folder(settings.get("image_bucket"))
            )

        routes = [] if routes is None else routes
        setup_routes(self, routes, settings)

        if settings.get("bucket"):
            self.folder.template_loader = S3Loader(self.folder, TEMPLATE_PATH)
            routes.extend(
                [
                    (
                        r"/(.*)",
                        handlers.SiteHandler,
                        {"pages": PAGE_PATH},
                    ),
                ]
            )
        else:
            routes.extend(
                [(r"/(.*)", handlers.SiteHandler, {"pages": PAGE_PATH})]
            )
        tornado.web.Application.__init__(
            self,
            routes,
            **settings,
        )

    def load_users(self):
        """ load users from users.json """
        return DictAuthenticator(
            json_utils.loads(self.folder.get_file(USERS_PATH)[-1])
        )

    def get_site(
        self, user=None, site=None
    ):  # pylint: disable=unused-argument
        """ return current site """
        return self.folder


def add_default_paths(settings):
    """ we expect some folders """
    app_name = settings["app_name"]

    # site paths
    static_path = os.path.join(settings["app_path"], STATIC_PATH)
    settings.setdefault("static_path", static_path)
    template_path = os.path.join(settings["app_path"], TEMPLATE_PATH)
    settings.setdefault("template_path", template_path)
    script_path = os.path.join(settings["app_path"], SCRIPT_PATH)
    settings.setdefault("script_path", script_path)
    page_path = os.path.join(settings["app_path"], PAGE_PATH)
    page_path = settings.setdefault("page_path", page_path)
    image_path = settings.setdefault("image_path", IMAGES_PATH)

    # editor setup
    settings.setdefault("duck_path", "/edit/assets/")
    settings.setdefault("duck_assets", resource_filename("duckdown", "assets"))
    settings.setdefault(
        "duck_templates", resource_filename("duckdown", "templates")
    )


def setup_routes(app, routes, settings):
    """ do the thing """
    app_name = settings["app_name"]

    # access control
    settings.setdefault("cookie_name", f"{app_name}-user")
    if settings.get("debug") is True:
        settings.setdefault(
            "cookie_secret", "it was a dark and stormy duckdown"
        )
    else:
        settings.setdefault(
            "cookie_secret", f"it was a dark and stormy duckdown {time.time()}"
        )
    settings.setdefault("login_url", "/login")
    login_handler = settings.get("login_handler")
    if login_handler is None:
        users = app.load_users()
        LOGGER.info(users)
        login_handler = (handlers.LoginHandler, {"users": users})

    # vue setup
    image_bucket = settings.get("image_bucket", None)
    vue_page = settings.get("vue_page", "vue.html")
    manifest = load_manifest(settings)
    routes.extend(
        [
            (r"/login", *login_handler),
            (r"/logout", handlers.LogoutHandler),
            (
                r"/edit/browse/(.*)",
                handlers.S3Browser,
                {
                    "bucket_name": image_bucket,
                    "folder": settings["image_path"],
                },
            ),
            (
                r"/edit/assets/(.*)",
                tornado.web.StaticFileHandler,
                {"path": settings["duck_assets"]},
            ),
            (r"/edit/mark/", handlers.MarkHandler),
            (
                r"/edit/pages/(.*)",
                handlers.DirHandler,
                {"directory": PAGE_PATH},
            ),
            (
                r"/edit",
                handlers.EditorHandler,
                {"page": vue_page, "manifest": manifest},
            ),
        ]
    )
    install_vue_handlers(routes, settings)


def install_vue_handlers(routes, settings):
    """ add view handler to routes """

    if settings["debug"] is True:
        vue_path = settings.setdefault("vue_src", "./client/src/")
        LOGGER.info("vue dev handler: %s", vue_path)
        routes.insert(
            0,
            (
                r"/src/(.*)",
                tornado.web.StaticFileHandler,
                {"path": vue_path},
            ),
        )
    else:
        LOGGER.info("installing vue handler")
        _assets = settings.setdefault(
            "vue_assets", resource_filename("duckdown", "assets/vue/")
        )
        routes.insert(
            0,
            (
                r"/_assets/(.*)",
                tornado.web.StaticFileHandler,
                {"path": _assets},
            ),
        )


def load_manifest(settings):
    """ loading manifest for vue dev environment """
    manifest = None
    if settings["debug"] is False:
        path = settings.setdefault(
            "vue_manifest",
            resource_filename("duckdown", "assets/vue/manifest.json"),
        )
        LOGGER.info("loading vue manifest: %s", path)
        with open(path) as file:
            manifest = json_utils.load(file)
    return manifest
