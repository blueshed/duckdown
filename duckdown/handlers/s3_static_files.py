""" Proxy S3 as static file handler """
import logging
from tornado.web import StaticFileHandler

LOGGER = logging.getLogger(__name__)


class S3StaticFiles(StaticFileHandler):  # pylint: disable=W0223
    """ S3 Procy """

    sites = {}

    @classmethod
    def get_content(cls, abspath, start=None, end=None):
        """ return content """
        site = cls.sites[abspath]
        _, data = site.get_file(abspath)
        return data

    def _stat(self):
        assert self.absolute_path is not None
        LOGGER.debug("static abs: %s", self.absolute_path)
        site = self.sites[self.absolute_path]
        if not hasattr(self, "_stat_result"):
            result = site.get_head(self.absolute_path)
            self._stat_result = result  # pylint: disable=W0201
        return self._stat_result

    @classmethod
    def get_absolute_path(cls, root, path):
        """ return abs path of content """
        LOGGER.debug("static: %s %s", root, path)
        root = root[:-1] if root[-1] == "/" else root
        return f"{root}/{path}"

    def validate_absolute_path(self, root, absolute_path):
        """ is it valid? and cache site for abspath """
        LOGGER.info("validate: %s", absolute_path)
        current_user = None
        if hasattr(self, "_current_user"):
            current_user = self._current_user
        site = self.application.get_site(current_user, absolute_path)
        self.sites[absolute_path] = site
        return absolute_path

    def finish(self, chunk=None):
        """ tidy up sites """
        result = super().finish(chunk)
        # if self.absolute_path:
        #     del self.sites[self.absolute_path]
        return result
