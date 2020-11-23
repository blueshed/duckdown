# pylint: disable=W0223
""" We need access for development """
import tornado.web


class BaseHandler(tornado.web.RequestHandler):
    """ allow for development """

    def set_default_headers(self):
        """ allow access for development """
        if self.application.settings.get("debug") is True:
            self.set_header("Access-Control-Allow-Origin", "*")
            self.set_header("Access-Control-Allow-Headers", "duck-token")
            self.set_header(
                "Access-Control-Allow-Methods",
                "DELETE, PUT, POST, GET, OPTIONS",
            )

    def options(self, *args, **kwargs):
        """ allow dev request """
        if self.application.settings.get("debug") is True:
            self.set_status(204)
            self.finish()
        else:
            super().options(*args, **kwargs)
