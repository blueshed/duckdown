# pylint: disable=W0201, W0223
""" browser and upload to bucket """
import os
import logging
import tornado.web
from .base_handler import BaseHandler
from .access_control import UserMixin
from ..utils.json_utils import dumps

LOGGER = logging.getLogger(__name__)

TYPE_MAP = {
    ".svg": ("SVG", "image/svg+xml"),
    ".jpg": ("JPEG", "image/jpeg"),
    ".jpeg": ("JPEG", "image/jpeg"),
    ".png": ("PNG", "image/png"),
    ".gif": ("GIF", "image/gif"),
}


class S3Browser(UserMixin, BaseHandler):
    """ list contents of bucket """

    def initialize(
        self,
        bucket_name=None,
        folder="",
    ):
        """ setup s3 bucket """
        self.s3bucket = bucket_name
        self.folder = folder

    @property
    def img_path(self):
        """ return application img_path """
        return self.application.settings.get("img_path")

    @property
    def local_images(self):
        """ return application local_images """
        return self.application.settings.get("local_images")

    def add(self, body, path, meta=None):
        """ adds body, returns path """
        key = self.folder + path
        LOGGER.info("adding %s", key)
        site = self.get_site(key)
        return site.put_file(body=body, key=key, meta=meta)

    @tornado.web.authenticated
    def get(self, prefix=None):
        """ returns the contents of bucket """
        result = None
        if prefix is None:
            prefix = ""
        LOGGER.info("browse: %s", prefix)
        self.set_header("Content-Type", "application/json")
        prefix = self.folder + prefix if self.folder else prefix
        LOGGER.info("prefix: %s", prefix)
        site = self.get_site(prefix)
        result = site.list_folder(prefix, self.folder)
        self.write(dumps(result))

    @tornado.web.authenticated
    def put(self, path=None):  # pylint: disable=W0613
        """ return the img_path """
        self.write({"img_path": self.img_path})

    @tornado.web.authenticated
    def post(self, path=None):
        """ handle the upload """
        result = []
        for key in self.request.files:
            for fileinfo in self.request.files[key]:
                fname = fileinfo["filename"]
                _, ext = os.path.splitext(fname)
                ftype, fmime = TYPE_MAP.get(ext.lower(), (None, None))
                if ftype is None:
                    raise Exception("File Type not accepted: {}".format(ftype))
                LOGGER.info("upload: %s", f"{path}{fname}")
                s3key = self.add(
                    fileinfo["body"],
                    path=f"{path}{fname}",
                    meta={"original_name": fname, "content-type": fmime},
                )
                result.append(s3key)
        self.write({"result": result})
