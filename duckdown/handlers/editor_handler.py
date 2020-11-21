""" Handle request for index page """
from tornado.web import RequestHandler, StaticFileHandler, authenticated
from .access_control import UserMixin


class EditorHandler(UserMixin, RequestHandler):  # pylint: disable=W0223
    """ return index page """

    def get_template_path(self):
        """ return app resource """
        return self.application.settings["duck_templates"]

    def asset_url(self, path):
        """ return asset handler versioned url """
        return StaticFileHandler.make_static_url(
            {
                "static_url_prefix": "/edit/assets/",
                "static_path": self.application.settings["duck_assets"],
            },
            path,
        )

    @authenticated
    def get(self):
        """ handle get request """
        self.render("editor.html")
