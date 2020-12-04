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

    def initialize(self, directory=None, s3_key=None):
        """ setup directory """
        self.directory = directory
        self.s3_key = s3_key

    def get(self, path=None):
        """ return the files and directories in path """
        if self.s3_key:
            key = self.s3_key + path
            LOGGER.info("dir get key: %s", key)
            if self.application.is_file(key):
                LOGGER.info("loading file: %s", key)
                content_type, data = self.application.get_file(key)
                LOGGER.info(data)
                if content_type:
                    self.set_header("Content-Type", content_type)
                self.write(data)
            else:
                LOGGER.info("listing folder: %s", key)
                items = self.application.list_folder(key)
                LOGGER.info(items)
                self.write(items)
        else:
            path = (
                os.path.join(self.directory, path) if path else self.directory
            )
            LOGGER.info("dir get path: %s", path)
            if self.application.is_file(path):
                LOGGER.info("loading file: %s", path)
                content_type, body = self.application.get_file(path)
                if content_type:
                    self.set_header("Content-Type", content_type)
                self.write(body)
            else:
                LOGGER.info("listing directory: %s", path)
                self.write(self.application.list_folder(path))

    def put(self, path):
        """ handle the setting of file to path """
        LOGGER.info("saving %s", path)
        if self.s3_key:
            key = self.s3_key + path
            mime, _ = mimetypes.guess_type(path)
            self.application.put_file(
                body=self.request.body, key=key, mime=mime
            )
        else:
            path = os.path.join(self.directory, path)
            self.application.put_file(self.request.body, path)
        self.write("saved")

    def delete(self, path):
        """ will remove a document """
        if self.s3_key:
            self.application.delete_file(path)
        else:
            path = os.path.join(self.directory, path)
            self.application.delete_file(path)
        self.write("deleted")
