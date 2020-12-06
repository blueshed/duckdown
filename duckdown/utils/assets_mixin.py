""" Mixin to perform asset_url """
from tornado.web import StaticFileHandler


class AssetsMixin:  # pylint: disable=too-few-public-methods
    """ mixin to add assert_url to handler """

    def asset_url(self, path):
        """ return asset handler versioned url """
        return StaticFileHandler.make_static_url(
            {
                "static_url_prefix": "/edit/assets/",
                "static_path": self.application.settings["duck_assets"],
            },
            path,
        )
