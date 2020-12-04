# pylint: disable=unused-variable, too-many-locals
""" application entry point """
import logging
import os
import tornado.ioloop
import tornado.web
import tornado.log
from .utils import json_utils
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

    def load_users(self):
        """ load users from local users.json """
        return json_utils.loads(self.get_file("users.json")[-1])
