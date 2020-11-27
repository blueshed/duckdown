# pylint: disable=W0201
""" Handle request for index page """
from tornado.web import RequestHandler, authenticated
from .access_control import UserMixin
from .utils.assets_mixin import AssetsMixin


class EditorHandler(
    AssetsMixin, UserMixin, RequestHandler
):  # pylint: disable=W0223
    """ return index page """

    def initialize(self, manifest, page):
        """ setup production """
        self.manifest = manifest
        self.page = page

    @property
    def duck_path(self):
        """ return application duck_path """
        return self.application.settings.get("duck_path")

    @property
    def img_path(self):
        """ return application img_path """
        if self.application.settings.get("local_images"):
            path = self.application.settings.get("img_path", "")
            return f"/static/{path}"
        return self.application.settings.get("img_path")

    def get_template_path(self):
        """ return app resource """
        return self.application.settings["duck_templates"]

    @authenticated
    def get(self):
        """ handle get request """
        self.render(self.page)
