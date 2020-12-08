# pylint: disable=attribute-defined-outside-init
""" Proxy S3 as static file handler """
import logging
from tornado.web import StaticFileHandler
from .access_control import UserMixin

LOGGER = logging.getLogger(__name__)


class StaticFiles(UserMixin, StaticFileHandler):  # pylint: disable=W0223
    """ work around """

    sites = {}

    @classmethod
    def get_content(cls, abspath, start=None, end=None):
        """ return content """
        LOGGER.info("get abs: %r", abspath)
        site = cls.sites[abspath]
        _, data = site.get_file(abspath)
        return data

    def _stat(self):
        assert self.absolute_path is not None
        abspath = self.absolute_path
        LOGGER.info("static abs: %r %r", self.root, self.absolute_path)
        if not hasattr(self, "_stat_result"):
            result = self.site.get_head(abspath)
            self._stat_result = result  # pylint: disable=W0201
        return self._stat_result

    @classmethod
    def get_absolute_path(cls, root, path):
        """ return abs path of content """
        LOGGER.info("make abs: %r %r", root, path)
        root = root[:-1] if root[-1] == "/" else root
        return path

    def validate_absolute_path(self, root, absolute_path):
        """ is it valid? and cache site for abspath """
        LOGGER.info("validate abs: %r %r", root, absolute_path)
        static_prefix = self.settings["static_prefix"]
        current_user = self.get_current_user()
        self.site = self.application.get_site(
            current_user, absolute_path, self.request
        )
        abspath = f"{static_prefix}{absolute_path}"
        self.sites[abspath] = self.site
        LOGGER.info("site set: %r", abspath)
        return abspath

    def finish(self, chunk=None):
        """ tidy up sites """
        result = super().finish(chunk)
        self.site = None
        if self.absolute_path:
            del self.sites[self.absolute_path]
        return result
