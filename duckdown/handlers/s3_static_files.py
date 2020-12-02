""" Proxy S3 as static file handler """
from tornado.web import StaticFileHandler


class S3StaticFiles(StaticFileHandler):  # pylint: disable=W0223
    """ S3 Procy """

    s3_app = None

    @classmethod
    def get_content(cls, abspath, start=None, end=None):
        """ return content """
        _, data = cls.s3_app.get_file(abspath)
        return data

    def _stat(self):
        assert self.absolute_path is not None
        if not hasattr(self, "_stat_result"):
            result = self.application.get_head(self.absolute_path)
            self._stat_result = result  # pylint: disable=W0201
        return self._stat_result

    @classmethod
    def get_absolute_path(cls, root, path):
        """ return abs path of content """
        return f"{root}/{path}"

    def validate_absolute_path(self, root, absolute_path):
        """ is it valid? """
        return absolute_path
