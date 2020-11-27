# pylint: disable=E1101
""" Mixin to convert to images to s3 """
import markdown
import pymdownx.emoji

EXTENSIONS = [
    "meta",
    "toc",
    "footnotes",
    "tables",
    "fenced_code",
    "attr_list",
    "def_list",
    "pymdownx.tilde",
    "pymdownx.tasklist",
    "pymdownx.emoji",
]

EXTENSIONS_CONFIG = {
    "pymdownx.emoji": {
        "emoji_index": pymdownx.emoji.twemoji,
        "emoji_generator": pymdownx.emoji.to_svg,
    }
}


class ConverterMixin:
    """ convert to remote if not debug """

    @property
    def markdown(self):
        """ returns a markdown instance """
        return markdown.Markdown(
            extensions=EXTENSIONS, extension_configs=EXTENSIONS_CONFIG
        )

    @property
    def img_path(self):
        """ return application img_path """
        return self.application.settings["img_path"]

    @property
    def local_images(self):
        """ return application local_images """
        return self.application.settings.get("local_images")

    def convert_images(self, value):
        """ use img_path """
        if self.local_images is True:
            return value
        return value.replace("/static/images/", self.img_path)
