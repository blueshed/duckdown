# pylint: disable=E1101
""" convert put to markdown """
import tornado.web
from .access_control import UserMixin
from .base_handler import BaseHandler
from .converter import Converter


class MarkHandler(UserMixin, Converter, BaseHandler):  # pylint: disable=W0223
    """ convert mardown put to json """

    @tornado.web.authenticated
    def put(self):
        """ handle put request """
        meta = self.markdown
        content = meta.convert(self.request.body.decode("utf-8"))
        content = self.convert_images(content)
        self.write({"content": content, "meta": meta.Meta, "toc": meta.toc})
