""" Handle request for index page """
from pkg_resources import resource_filename
import tornado.web
from .access_control import UserMixin


class EditorHandler(
    UserMixin, tornado.web.RequestHandler
):  # pylint: disable=W0223
    """ return index page """

    @tornado.web.authenticated
    def get(self):
        """ handle get request """
        self.render(resource_filename("duckdown", "editor.html"))
