""" an s3 template loader """
import os
import logging
from typing import Any
from tornado.template import BaseLoader, Template

LOGGER = logging.getLogger(__name__)


class S3Loader(BaseLoader):
    """A template loader that loads from a single root directory."""

    def __init__(self, site, folder, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self.site = site
        self.folder = folder

    def resolve_path(self, name, parent_path=None):
        """ resolve a path """
        if (
            parent_path
            and not parent_path.startswith("<")
            and not parent_path.startswith("/")
            and not name.startswith("/")
        ):
            current_path = os.path.join(self.folder, parent_path)
            file_dir = os.path.dirname(os.path.abspath(current_path))
            relative_path = os.path.abspath(os.path.join(file_dir, name))
            if relative_path.startswith(self.folder):
                name = relative_path[len(self.folder) + 1 :]
        return name

    def _create_template(self, name: str) -> Template:
        """ create a template from bucket/folder/name """
        key = f"{self.folder}{name}"
        LOGGER.info("template: %s", key)
        _, data = self.site.get_file(key)
        template = Template(data.decode("utf-8"), name=name, loader=self)
        return template
