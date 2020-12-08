# pylint: disable=W0201
""" Handle request for index page """
from tornado.web import RequestHandler, authenticated
from .access_control import UserMixin
from ..utils.assets_mixin import AssetsMixin


class EditorHandler(
    AssetsMixin, UserMixin, RequestHandler
):  # pylint: disable=W0223
    """ return index page """

    def initialize(self, manifest, page):
        """ setup production """
        self.manifest = manifest
        self.page = page

    @authenticated
    def get(self):
        """ handle get request """
        self.render(self.page)
