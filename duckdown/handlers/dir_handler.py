# pylint: disable=W0201, W0223
""" We want to manage a directory of files """
import os
import logging
import mimetypes
from ..utils.folder import Folder
from .base_handler import BaseHandler
from .access_control import UserMixin

LOGGER = logging.getLogger(__name__)
mimetypes.add_type("text/markdown", ".md")


class DirHandler(UserMixin, BaseHandler):
    """ Manage a directory """

    def initialize(self, directory=None, s3_key=None):
        """ setup directory """
        self.directory = Folder(directory)
        self.s3_key = s3_key

    @classmethod
    def clean_files_folders(cls, prefix, items):
        """ remove prefix from paths """
        start = len(prefix)
        for item in items.get("folders"):
            item["path"] = item["path"][start:]
        for item in items.get("files"):
            item["path"] = item["path"][start:]

    def get(self, path=None):
        """ return the files and directories in path """
        if self.s3_key:
            key = self.s3_key + path
            if self.application.is_file(key):
                LOGGER.info("loading file: %s", key)
                content_type, data = self.application.get_file(key)
                LOGGER.info(data)
                self.set_header("Content-Type", content_type)
                self.write(data)
            else:
                LOGGER.info("listing folder: %s", key)
                items = self.application.list_folder(key)
                self.clean_files_folders(self.s3_key, items)
                LOGGER.info(items)
                self.write({"items": items})
        else:
            path = (
                os.path.join(self.directory, path) if path else self.directory
            )
            if self.directory.is_file(path):
                LOGGER.info("loading file: %s", key)
                content_type, body = self.directory.get_file(path)
                self.set_header("Content-Type", content_type)
                self.write(body)
            else:
                LOGGER.info("listing directory: %s", path)
                self.write(self.directory.list_folder(path))

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
            self.directory.put_file(self.request.body, path)
        self.write("saved")

    def delete(self, path):
        """ will remove a document """
        if self.s3_key:
            self.application.delete_file(path)
        else:
            self.directory.delete_file(path)
        self.write("deleted")
