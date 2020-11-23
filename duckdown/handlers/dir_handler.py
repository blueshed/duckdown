""" We want to manage a directory of files """
import os
import logging
import mimetypes
from .base_handler import BaseHandler
from .access_control import UserMixin

LOGGER = logging.getLogger(__name__)
mimetypes.add_type("text/markdown", ".md")


def scan_path(path):
    """ return the contents of a path """
    with os.scandir(path) as item:
        for entry in item:
            is_file = entry.is_file()
            size = entry.stat().st_size if is_file else None
            mime = mimetypes.guess_type(entry.path) if is_file else None
            if entry.name[0] != ".":
                yield {
                    "name": entry.name,
                    "file": is_file,
                    "size": size,
                    "type": mime,
                }


class DirHandler(UserMixin, BaseHandler):  # pylint: disable=W0223
    """ Manage a directory """

    def initialize(self, directory):
        """ setup directory """
        self.directory = directory  # pylint: disable=W0201

    def get(self, path=None):
        """ return the files and directories in path """
        path = os.path.join(self.directory, path) if path else self.directory
        if os.path.isfile(path):
            content_type, _ = mimetypes.guess_type(path)
            self.set_header("Content-Type", content_type)
            self.write(open(path, "r").read())
        else:
            self.write({"items": list(scan_path(path))})

    def put(self, path=None):
        """ handle the setting of file to path """
        LOGGER.info("saving %s", path)
        path = os.path.join(self.directory, path) if path else self.directory
        folder, _ = os.path.split(path)
        if folder and not os.path.exists(folder):
            LOGGER.info("making directory: %s", folder)
            os.makedirs(folder)
        with open(path, "wb") as file:
            file.write(self.request.body)
        self.write("saved")

    def delete(self, path=None):
        """ will remove a document """
        path = os.path.join(self.directory, path) if path else self.directory
        if os.path.isfile(path):
            os.unlink(path)
            self.write("deleted")
