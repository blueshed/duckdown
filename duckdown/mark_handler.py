# pylint: disable=E1101
""" convert put to markdown """
import tornado.web
import markdown
from .access_control import UserMixin
from .image_converter import ImageConverter


class MarkHandler(
    UserMixin, ImageConverter, tornado.web.RequestHandler
):  # pylint: disable=W0223
    """ convert mardown put to json """

    @tornado.web.authenticated
    def put(self):
        """ handle put request """
        meta = markdown.Markdown(extensions=["meta", "toc"])
        content = meta.convert(self.request.body.decode("utf-8"))
        content = self.convert_images(content)
        self.write({"content": content, "meta": meta.Meta, "toc": meta.toc})
