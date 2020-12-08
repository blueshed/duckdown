# pylint: disable=too-many-instance-attributes, too-few-public-methods
""" Duckdown configuration """
import os
import time
import logging
from pkg_resources import resource_filename

LOGGER = logging.getLogger(__name__)


class Config:
    """ holding all the variables """

    # constants
    PAGE_PATH = "pages/"
    TEMPLATE_PATH = "templates/"
    IMAGES_PATH = "static/images/"
    SCRIPT_PATH = "scripts/"
    STATIC_PATH = "static/"
    USERS_PATH = "users.json"
    IMG_PATH = "/static/images/"
    ASSETS_PREFIX = "/edit/assets/"

    # variables
    debug = False
    port = int(os.getenv("PORT", "8080"))
    bucket_name = ""
    credentials = {}
    app_path = ""
    app_name = "duckdown_app"

    static_prefix = STATIC_PATH
    image_path = IMAGES_PATH
    image_bucket = None
    users_path = USERS_PATH

    image_credentials = {}
    img_path = IMG_PATH
    convert_image_paths = True

    duck_assets_prefix = ASSETS_PREFIX
    duck_assets = resource_filename("duckdown", "assets")
    duck_templates = resource_filename("duckdown", "templates")

    cookie_secret = "it was a dark and stormy duckdown"
    login_url = "/login"
    login_handler = None

    vue_page = "vue.html"
    vue_src = "./client/src/"
    vue_assets = resource_filename("duckdown", "assets/vue/")
    vue_manifest = resource_filename("duckdown", "assets/vue/manifest.json")

    def __init__(self, app_path=None, bucket=None, debug=None, port=None):
        """ init derived data members """

        # allow for command line override
        if app_path is not None:
            self.app_path = app_path
        if bucket is not None:
            self.bucket_name = bucket
        if debug is not None:
            self.debug = debug
        if port is not None:
            self.port = port

        LOGGER.debug("init app_path: %s", self.app_path)

        self.static_path = os.path.join(self.app_path, self.STATIC_PATH)
        self.template_path = os.path.join(self.app_path, self.TEMPLATE_PATH)
        self.script_path = os.path.join(self.app_path, self.SCRIPT_PATH)
        self.page_path = os.path.join(self.app_path, self.PAGE_PATH)
        self.cookie_name = f"{self.app_name}-user"

    def tornado_settings(self, settings):
        """ setup tornado settings dict """

        settings.setdefault("debug", self.debug)
        settings.setdefault("port", self.port)
        settings.setdefault("app_name", self.app_name)
        settings.setdefault("app_path", self.app_path)

        # site paths
        settings.setdefault("users_path", self.users_path)
        settings.setdefault("static_path", self.static_path)
        settings.setdefault("static_prefix", self.static_prefix)
        settings.setdefault("template_path", self.template_path)
        settings.setdefault("script_path", self.script_path)
        settings.setdefault("page_path", self.page_path)
        settings.setdefault("img_path", self.img_path)
        settings.setdefault("convert_image_paths", self.convert_image_paths)

        # editor setup
        settings.setdefault("duck_assets_prefix", self.duck_assets_prefix)
        settings.setdefault("duck_assets", self.duck_assets)
        settings.setdefault("duck_templates", self.duck_templates)

        # access control
        settings.setdefault("cookie_name", f"{self.app_name}-user")
        if settings.get("debug") is True:
            settings[
                "cookie_secret"
            ] = f"it was a dark and stormy duckdown {time.time()}"
        else:
            settings.setdefault("cookie_secret", self.cookie_secret)
        settings.setdefault("login_url", self.login_url)

        return settings
