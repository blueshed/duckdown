""" An application loaded from s3 """
import logging
import tornado.web
import tornado.ioloop
from .utils import app_utils
from .utils.s3_folders import S3Folder
from .utils.s3tmpl_loader import S3Loader
from . import handlers

LOGGER = logging.getLogger(__name__)


class S3App(S3Folder, tornado.web.Application):
    """ We server at the pleasure of s3 """

    def __init__(self, bucket_name, routes=None, **settings):
        """ send it on and do the right thing """
        S3Folder.__init__(self, bucket_name)
        routes = [] if routes is None else routes
        app_utils.setup_routes(self, routes, settings, s3_pages_key="pages/")
        settings.setdefault(
            "img_path",
            f"//s3-{self.s3region}.amazonaws.com/{bucket_name}/static/images/",
        )
        settings.setdefault("local_images", False)
        routes.extend(
            [
                (
                    r"/(.*)",
                    handlers.SiteHandler,
                    {
                        "pages": "pages/",
                        "s3_loader": S3Loader(self, "templates/"),
                        "is_s3": True,
                    },
                ),
            ]
        )
        handlers.S3StaticFiles.s3_app = self
        tornado.web.Application.__init__(
            self,
            routes,
            static_handler_class=handlers.S3StaticFiles,
            static_path="static",
            **settings,
        )

    def list_templates(self, prefix=""):
        """ return a directory list of templates """
        return self.list_folder("templates/", prefix)

    def list_pages(self, prefix=""):
        """ return a directory list of templates """
        return self.list_folder("pages/", prefix)

    def list_statics(self, prefix=""):
        """ return a directory list of templates """
        return self.list_folder("static/", prefix)
