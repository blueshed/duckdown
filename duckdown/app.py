# pylint: disable=unused-variable, too-many-locals
""" application entry point """
import logging
import os
import tornado.ioloop
import tornado.web
import tornado.log
import boto3
from .utils import json_utils
from .utils.folder import Folder
from .utils.s3_folders import S3Folder
from .handlers.access_control import DictAuthenticator
from . import handlers

LOGGER = logging.getLogger(__name__)


class App(tornado.web.Application):
    """ an app served up out of a directory """

    def __init__(self, cfg, routes=None, **settings):
        """ set up """
        self.cfg = cfg

        s3client = None
        s3region = None

        if cfg.bucket_name:
            LOGGER.info("duckdown s3: %s", cfg.bucket_name)
            s3client, s3region = make_s3client(**cfg.credentials)

            self.folder = S3Folder(
                cfg.bucket_name, client=s3client, region=s3region
            )
            cfg.convert_image_paths = False
            cfg.image_path = False
            cfg.image_bucket = (
                cfg.image_bucket if cfg.image_bucket else cfg.bucket_name
            )
            cfg.img_path = f"{self.folder.s3bucket_url}/{cfg.IMAGES_PATH}"
        elif cfg.app_path:
            LOGGER.info("duckdown local: %s", cfg.app_path)
            self.folder = Folder(directory=cfg.app_path)
        else:
            raise Exception("app_path or bucket required")

        if cfg.image_bucket:
            cfg.convert_image_paths = False
            cfg.image_path = False
            if s3client is None:
                s3client, s3region = make_s3client(**cfg.image_credentials)
            image_folder = S3Folder(
                cfg.image_bucket, client=s3client, region=s3region
            )
            cfg.img_path = f"{image_folder.s3bucket_url}/{cfg.IMAGES_PATH}"
            self.folder.set_image_bucket(image_folder)

        settings = cfg.tornado_settings(settings or {})
        settings.setdefault("static_handler_class", handlers.StaticFiles)
        routes = setup_routes(cfg, routes)
        super().__init__(
            routes,
            **settings,
        )

    def load_users(self, request):
        """ return the user and password """
        site = self.get_site(None, None, request)
        users_path = self.settings["users_path"]
        LOGGER.info("loading users: %s", users_path)
        return DictAuthenticator(
            json_utils.loads(site.get_file(users_path)[-1])
        )

    def get_site(
        self, user=None, path=None, request=None
    ):  # pylint: disable=unused-argument
        """ return current site """
        return self.folder


def setup_routes(cfg, routes):
    """ do the thing """
    routes = routes or []

    login_handler = cfg.login_handler or (handlers.LoginHandler,)
    routes.extend(
        [
            (r"/login", *login_handler),
            (r"/logout", handlers.LogoutHandler),
            (
                r"/edit/browse/(.*)",
                handlers.S3Browser,
                {
                    "bucket_name": cfg.image_bucket,
                    "folder": cfg.image_path,
                },
            ),
            (
                r"/edit/assets/(.*)",
                tornado.web.StaticFileHandler,
                {"path": cfg.duck_assets},
            ),
            (r"/edit/mark/", handlers.MarkHandler),
            (
                r"/edit/pages/(.*)",
                handlers.DirHandler,
                {"directory": cfg.PAGE_PATH},
            ),
            (
                r"/edit",
                handlers.EditorHandler,
                {"page": cfg.vue_page, "manifest": load_manifest(cfg)},
            ),
        ]
    )

    if cfg.debug is True:
        LOGGER.info("vue dev handler: %s", cfg.vue_src)
        routes.insert(
            0,
            (
                r"/src/(.*)",
                tornado.web.StaticFileHandler,
                {"path": cfg.vue_src},
            ),
        )
    else:
        LOGGER.debug("vue manifest handler")
        routes.insert(
            0,
            (
                r"/_assets/(.*)",
                tornado.web.StaticFileHandler,
                {"path": cfg.vue_assets},
            ),
        )

    routes.append(
        (
            r"/(.*)",
            handlers.SiteHandler,
            {"pages": cfg.PAGE_PATH},
        )
    )
    return routes


def load_manifest(cfg):
    """ loading manifest for vue dev environment """
    manifest = None
    if cfg.debug is False:
        path = cfg.vue_manifest
        LOGGER.info("loading vue manifest: %s", path)
        with open(path) as file:
            manifest = json_utils.load(file)
    return manifest


def make_s3client(**credentials):
    """ determine region or get from env """
    s3region = (
        credentials["region_name"]
        if "region_name" in credentials
        else os.environ["AWS_REGION"]
    )
    s3client = boto3.client("s3", **credentials)
    return s3client, s3region
