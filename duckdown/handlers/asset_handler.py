# pylint: disable=W0223
""" authenticated static files """
import logging
import tornado.web
from .access_control import UserMixin

LOGGER = logging.getLogger(__name__)


class AssetHandler(UserMixin, tornado.web.StaticFileHandler):
    """ you need to login to get these assets """

    @tornado.web.authenticated
    def prepare(self):
        """ nothing to be done """
