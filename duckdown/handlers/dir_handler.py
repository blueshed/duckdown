# pylint: disable=W0201, W0223
""" We want to manage a directory of files """
import os
import logging
import mimetypes
from .base_handler import BaseHandler
from .access_control import UserMixin

LOGGER = logging.getLogger(__name__)
mimetypes.add_type("text/markdown", ".md")


class DirHandler(UserMixin, BaseHandler):
    """ Manage a directory """

    def initialize(self, directory):
        """ setup directory """
        self.directory = directory

    def get(self, path=None):
        """ return the files and directories in path """
        path = os.path.join(self.directory, path) if path else self.directory
        site = self.get_site(path)
        LOGGER.info("dir get path: %s", path)
        if site.is_file(path):
            LOGGER.info("loading file: %s", path)
            content_type, body = site.get_file(path)
            if content_type:
                self.set_header("Content-Type", content_type)
            self.write(body)
        else:
            LOGGER.info("listing folder: %s", path)
            self.write(site.list_folder(path))

    def put(self, path):
        """ handle the setting of file to path """
        LOGGER.info("saving %s", path)
        mime, _ = mimetypes.guess_type(path)
        path = os.path.join(self.directory, path)
        site = self.get_site(path)
        site.put_file(self.request.body, path, mime=mime)
        self.write("saved")

    def delete(self, path):
        """ will remove a document """
        path = os.path.join(self.directory, path)
        site = self.get_site(path)
        site.delete_file(path)
        self.write("deleted")
