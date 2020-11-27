""" an s3 template loader """
import io
import os
import logging
from typing import Any
import boto3
from tornado.template import BaseLoader, Template

LOGGER = logging.getLogger(__name__)


class S3Loader(BaseLoader):
    """A template loader that loads from a single root directory."""

    def __init__(
        self,
        aws_access_key_id: str,
        aws_secret_access_key: str,
        bucket_name: str,
        folder="",
        **kwargs: Any
    ) -> None:
        super().__init__(**kwargs)
        s3resource = boto3.resource(
            "s3",
            aws_access_key_id=aws_access_key_id,
            aws_secret_access_key=aws_secret_access_key,
        )
        self.bucket = s3resource.Bucket(bucket_name)
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
        key = "/".join([self.folder, name]) if self.folder else name
        LOGGER.info("template: %s", key)
        data = io.BytesIO()
        self.bucket.download_fileobj(key, data)
        template = Template(
            data.getvalue().decode("utf-8"), name=name, loader=self
        )
        return template
