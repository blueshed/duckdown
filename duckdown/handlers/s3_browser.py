# pylint: disable=W0201, W0223
""" browser and upload to bucket """
import os
import logging
import boto3
import tornado.web
from .base_handler import BaseHandler
from .access_control import UserMixin
from .utils.json_utils import dumps

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
        aws_access_key_id=None,
        aws_secret_access_key=None,
        bucket_name=None,
        folder="",
    ):
        """ setup s3 bucket """
        self.name = bucket_name
        self.aws_access_key_id = aws_access_key_id
        self.aws_secret_access_key = aws_secret_access_key
        self.folder = folder

    @property
    def bucket(self):
        """ return boto3 client """
        return boto3.client(
            "s3",
            aws_access_key_id=self.aws_access_key_id,
            aws_secret_access_key=self.aws_secret_access_key,
        )

    @property
    def static_path(self):
        """ return application static_path """
        return self.application.settings.get("static_path")

    @property
    def img_path(self):
        """ return application img_path """
        return self.application.settings.get("img_path")

    @property
    def local_images(self):
        """ return application local_images """
        return self.application.settings.get("local_images")

    def add(self, data=None, key=None, meta=None):
        """ adds data, returns path """
        if self.local_images:
            # move to static_path
            folder = self.folder if self.folder else ""
            if folder.endswith("/"):
                folder = folder[:-1]
            path = os.path.join(self.static_path, folder, key)
            LOGGER.info("adding %s", path)
            folder, _ = os.path.split(path)
            if not os.path.exists(folder):
                os.makedirs(folder, exist_ok=True)
            with open(path, "wb") as file:
                file.write(data)
            return str(path)

        # add to bucket
        key = self.folder + key if self.folder else key
        bucket = self.bucket
        bucket.put_object(
            ACL="public-read",
            Body=data,
            Bucket=self.name,
            Key=key,
            Metadata=meta,
        )
        return bucket.generate_presigned_url(
            "get_object", Params={"Bucket": self.name, "Key": key}
        )

    def list(self, prefix="", delimiter="/"):
        """ list the content of the bucket """
        folders = []
        files = []
        result = {
            "CommonPrefixes": folders,
            "Contents": files,
        }
        if self.local_images:
            # return to static_path
            path = os.path.join(self.static_path, self.folder, prefix)
            with os.scandir(path) as item:
                for entry in item:
                    if entry.is_file():
                        _, ext = os.path.splitext(entry.name)
                        if ext.lower() in TYPE_MAP:
                            file = f"{prefix}{entry.name}"
                            files.append({"Key": f"{file}"})
                    else:
                        folder = f"{prefix}{entry.name}/"
                        folders.append({"Prefix": f"{folder}"})
            return result

        # list bucket objects
        prefix = self.folder + prefix if self.folder else prefix
        items = self.bucket.list_objects(
            Bucket=self.name, Prefix=prefix, Delimiter=delimiter
        )
        starting = len(self.folder)
        for item in items.get("Contents", []):
            files.append({"Key": item["Key"][starting:]})
        for item in items.get("CommonPrefixes", []):
            folders.append({"Prefix": item["Prefix"][starting:]})
        return result

    @tornado.web.authenticated
    def get(self, prefix=None):
        """ returns the contents of bucket """
        if prefix is None:
            prefix = ""
        delimiter = self.get_argument("d", "/")
        self.set_header("Content-Type", "application/json")
        self.write(dumps(self.list(prefix, delimiter)))

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
