""" Mixin to perform asset_url """
from tornado.web import StaticFileHandler


class AssetsMixin:  # pylint: disable=too-few-public-methods
    """ mixin to add assert_url to handler """

    @property
    def duck_assets_prefix(self):
        """ return the prefix for duck assets """
        return self.settings["duck_assets_prefix"]

    def asset_url(self, path):
        """ return asset handler versioned url """
        return StaticFileHandler.make_static_url(
            {
                "static_url_prefix": self.duck_assets_prefix,
                "static_path": self.settings["duck_assets"],
            },
            path,
        )

    def get_template_path(self):
        """ return app resource """
        return self.settings["duck_templates"]
