# pylint: disable=W0201, W0223
""" browser and upload to bucket """
import os
import logging
import boto3
import tornado.web
from .json_utils import dumps
from .access_control import UserMixin

LOGGER = logging.getLogger(__name__)

TYPE_MAP = {
    ".jpg": ("JPEG", "image/jpeg"),
    ".jpeg": ("JPEG", "image/jpeg"),
    ".png": ("PNG", "image/png"),
    ".gif": ("GIF", "image/gif"),
}


class S3Browser(UserMixin, tornado.web.RequestHandler):
    """ list contents of bucket """

    def initialize(
        self, aws_access_key_id, aws_secret_access_key, bucket_name
    ):
        """ setup s3 bucket """
        self.name = bucket_name
        self.client = boto3.client(
            "s3",
            aws_access_key_id=aws_access_key_id,
            aws_secret_access_key=aws_secret_access_key,
        )

    def gen_abs_url(self, keyname):
        """ return a url without protocol to the resource """
        return self.client.generate_presigned_url(
            "get_object", Params={"Bucket": self.name, "Key": keyname}
        )

    def add(self, data=None, key=None, meta=None):
        """ adds data, returns path """
        self.client.put_object(
            ACL="public-read",
            Body=data,
            Bucket=self.name,
            Key=key,
            Metadata=meta,
        )
        return self.gen_abs_url(key)

    def list(self, prefix="", delimiter="/"):
        """ list the content of the bucket """
        return self.client.list_objects(
            Bucket=self.name, Prefix=prefix, Delimiter=delimiter
        )

    @tornado.web.authenticated
    def get(self, prefix=None):
        """ returns the contents of bucket """
        if prefix is None:
            prefix = ""
        delimiter = self.get_argument("d", "/")
        self.set_header("Content-Type", "application/json")
        self.write(dumps(self.list(prefix, delimiter)))

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
