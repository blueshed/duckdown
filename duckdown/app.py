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
from .utils import vue_utils
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
        bucket_name = settings.get("bucket")
        app_path = settings.setdefault("app_path", "")
        app_name = settings.setdefault("app_name", "duckdown-app")
        add_default_paths(settings)

        if bucket_name:
            LOGGER.info("duckdown s3: %s", bucket_name)

            self.folder = S3Folder(bucket_name)
            settings.setdefault("local_images", False)
            settings.setdefault(
                "img_path",
                f"{self.folder.s3bucket_url}/{IMAGES_PATH}",
            )
            settings['static_handler_class']= handlers.S3StaticFiles
            handlers.S3StaticFiles.s3_app = self
        else:
            LOGGER.info("duckdown local: %s", app_path)

            self.folder = Folder(directory=app_path)
            settings.setdefault("local_images", True)
            settings.setdefault("img_path", IMG_PATH)

        routes = [] if routes is None else routes
        setup_routes(self, routes, settings)

        if settings.get("bucket"):
            routes.extend(
                [
                    (
                        r"/(.*)",
                        handlers.SiteHandler,
                        {
                            "pages": PAGE_PATH,
                            "s3_loader": S3Loader(self, TEMPLATE_PATH),
                            "is_s3": True,
                        },
                    ),
                ]
            )
        else:
            routes.extend([(r"/(.*)", handlers.SiteHandler, {"pages": PAGE_PATH})])
        tornado.web.Application.__init__(
            self,
            routes,
            **settings,
        )

    def load_users(self):
        """ load users from users.json """
        return DictAuthenticator(
            json_utils.loads(self.get_file(USERS_PATH)[-1])
        )

    def list_templates(self, prefix=""):
        """ return a directory list of templates """
        template_path = self.settings["template_path"]
        return self.list_folder(template_path, prefix)

    def list_pages(self, prefix=""):
        """ return a directory list of templates """
        page_path = self.settings["page_path"]
        return self.list_folder(page_path, prefix)

    def list_statics(self, prefix=""):
        """ return a directory list of templates """
        static_path = self.settings["static_path"]
        return self.list_folder(static_path, prefix)

    def list_folder(self, prefix="", delimiter="/"):
        """ list the contents of folder """
        return self.folder.list_folder(prefix, delimiter)
    
    def is_file(self, path):
        """ is this a file """
        return self.folder.is_file(path)

    def get_head(self, key):
        """ return Head on key """
        return self.folder.get_head(key)

    def get_file(self, key):
        """ returns file key in directory """
        return self.folder.get_file(key)

    def put_file(self, body, key, **kwargs):
        """ put file into directory """
        return self.folder.put_file(body, key, **kwargs)
    
    def delete_file(self, key):
        """ will remove file from directory """
        return self.folder.delete_file(key)


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

    # editor setup
    settings.setdefault("duck_path", "/edit/assets/")
    settings.setdefault("duck_assets", resource_filename("duckdown", "assets"))
    settings.setdefault(
        "duck_templates", resource_filename("duckdown", "templates")
    )

def setup_routes(app, routes, settings, s3_pages_key=None):
    """ do the thing """
    app_name = settings["app_name"]

    # access control
    settings.setdefault("cookie", f"{app_name}-user")
    settings.setdefault("cookie_secret", f"it was a dark and stormy duckdown {time.time()}")
    settings.setdefault("login_url", "/login")
    login_handler = settings.get("login_handler")
    if login_handler is None:
        users = app.load_users()
        LOGGER.info(users)
        login_handler = (handlers.LoginHandler, {"users": users})

    # vue setup
    debug = settings.get("debug", False)
    image_bucket = settings.get("image_bucket", None)
    vue_page = settings.get("vue_page", "vue.html")
    manifest = vue_utils.load_manifest(debug)
    routes.extend(
        [
            (r"/login", *login_handler),
            (r"/logout", handlers.LogoutHandler),
            (
                r"/edit/browse/(.*)",
                handlers.S3Browser,
                {"bucket_name": image_bucket, "folder": "static/images/"},
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
    vue_utils.install_vue_handlers(routes, debug)