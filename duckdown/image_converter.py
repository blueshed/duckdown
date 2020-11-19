# pylint: disable=E1101
""" Mixin to convert to images to s3 """


class ImageConverter:
    """ convert to remote if not debug """

    @property
    def img_path(self):
        """ return application img_path """
        return self.application.settings.get("img_path")

    def convert_images(self, value):
        """ use img_path """
        if self.application.settings.get("debug") is True:
            return value
        return value.replace("/static/images/", self.img_path)
