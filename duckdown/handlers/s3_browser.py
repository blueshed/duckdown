# pylint: disable=W0201, W0223
""" browser and upload to bucket """
import os
import logging
import boto3
import tornado.web
from .base_handler import BaseHandler
from .access_control import UserMixin
from ..utils.json_utils import dumps
from ..utils.folder import Folder
from ..utils.s3_folders import S3Folder

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
    def s3client(self):
        """ return boto3 client """
        return boto3.client("s3")

    @property
    def app_path(self):
        """ return application app_path """
        return self.application.settings.get("app_path")

    @property
    def img_path(self):
        """ return application img_path """
        return self.application.settings.get("img_path")

    @property
    def local_images(self):
        """ return application local_images """
        return self.application.settings.get("local_images")

    def make_app_path(self, key):
        """ return a path inside app path """
        folder = self.folder if self.folder else ""
        if folder.endswith("/"):
            folder = folder[:-1]
        folder_path = os.path.join(self.app_path, folder)
        if key:
            path = os.path.join(self.app_path, folder, key)
        else:
            path = folder_path
        return path, folder_path

    def add(self, data=None, key=None, meta=None):
        """ adds data, returns path """
        if self.local_images:
            # write file
            path = self.make_app_path(key)
            LOGGER.info("adding %s", path)
            folder, _ = os.path.split(path)
            if not os.path.exists(folder):
                os.makedirs(folder)
            with open(path, "wb") as file:
                file.write(data)
            return str(path)

        # add to bucket
        key = self.folder + key if self.folder else key
        client = self.s3client
        client.put_object(
            ACL="public-read",
            Body=data,
            Bucket=self.s3bucket,
            Key=key,
            Metadata=meta,
        )
        return client.generate_presigned_url(
            "get_object", Params={"Bucket": self.s3bucket, "Key": key}
        )

    def scan_dir(self, prefix="", delimiter="/"):
        """ list the content of the bucket """
        if self.local_images:
            file, folder = self.make_app_path(prefix)
            return Folder.scan_path(file, folder)

        # list bucket objects
        prefix = self.folder + prefix if self.folder else prefix
        return S3Folder.scan_path(self.s3client, self.s3bucket, prefix)


    @tornado.web.authenticated
    def get(self, prefix=None):
        """ returns the contents of bucket """
        if prefix is None:
            prefix = ""
        delimiter = self.get_argument("d", "/")
        self.set_header("Content-Type", "application/json")
        self.write(dumps(self.scan_dir(prefix, delimiter)))

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
                    key=f"{path}{fname}",
                    meta={"original_name": fname, "content-type": fmime},
                )
                result.append(s3key)
        self.write({"result": result})
