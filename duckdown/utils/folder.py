# pylint: disable=W0613
""" we want to create a commonality with directory """
import os
import logging
import mimetypes
from .head import Head

LOGGER = logging.getLogger(__name__)


class Folder:
    """ files and folders """

    def __init__(self, directory):
        self.directory = directory

    def is_file(self, path):
        """ is this a file """
        path = os.path.join(self.directory, path)
        return os.path.isfile(path)

    def list_folder(self, prefix="", delimiter="/"):
        """ list the contents of folder """
        path = os.path.join(self.directory, prefix)
        return self.scan_path(path, self.directory)

    def get_head(self, key):
        """ return Head on key """
        path = os.path.join(self.directory, key)
        stat = os.stat(path)
        return Head(path=path, st_size=stat.st_size, st_mtime=stat.st_mtime)

    def get_file(self, key):
        """ returns file key in directory """
        result = (None, None)
        path = os.path.join(self.directory, key)
        if os.path.isfile(path):
            content_type, _ = mimetypes.guess_type(path)
            with open(path, "rb") as file:
                result = content_type, file.read()
        return result

    def put_file(self, body, key, **kwargs):
        """ put file into directory """
        path = os.path.join(self.directory, key)
        folder, _ = os.path.split(path)
        if folder and not os.path.exists(folder):
            LOGGER.info("making directory: %s", folder)
            os.makedirs(folder)
        with open(path, "wb") as file:
            file.write(body)

    def delete_file(self, key):
        """ will remove file from directory """
        path = os.path.join(self.directory, key)
        if os.path.isfile(path):
            os.unlink(path)
        else:
            raise ValueError(f"No such file: {key}")

    @classmethod
    def scan_path(cls, path, prefix):
        """ return the contents of a path """
        files = []
        folders = []

        starts = len(prefix) + 1
        with os.scandir(path) as item:
            for entry in item:
                is_file = entry.is_file()
                size = entry.stat().st_size if is_file else None
                mime = mimetypes.guess_type(entry.path) if is_file else None
                if entry.name[0] != ".":
                    item = {
                        "name": entry.name,
                        "path": entry.path[starts:],
                        "file": is_file,
                        "size": size,
                        "type": mime,
                    }
                    if is_file:
                        files.append(item)
                    else:
                        folders.append(item)
        return {"files": files, "folders": folders}
