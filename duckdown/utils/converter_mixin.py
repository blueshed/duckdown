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

    def convert_images(self, value):
        """ use img_path """
        if self.settings.get("convert_image_paths") is True:
            return value
        img_path = self.settings["img_path"]
        return value.replace("/static/images/", img_path)
