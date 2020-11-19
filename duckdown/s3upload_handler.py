# pylint: disable=W0201, W0223, C0103, R0201, R0913, W0703, W0613
""" Uploads images to s3 """
import logging
import io
import os
import random
import string
import boto3
import tornado.web
from PIL import Image
from pkg_resources import resource_filename
from .json_utils import dumps
from .access_control import UserMixin

TYPE_MAP = {
    ".jpg": ("JPEG", "image/jpeg"),
    ".jpeg": ("JPEG", "image/jpeg"),
    ".png": ("PNG", "image/png"),
    ".gif": ("GIF", "image/gif"),
}

THUMB_SIZE = (184, 138)
SMALL_SIZE = (368, 276)


class Bucket:
    """ Wrapper around s3 connection and bucket """

    def __init__(self, aws_access_key_id, aws_secret_access_key, bucket_name):
        """ provide config and bucket name """
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


def _make_one(bucket, data, size, fType, fMime, prefix, fActual, fExt):
    """ thumbnails image and adds to bucket """
    img = Image.open(io.BytesIO(data))
    img.thumbnail(size, Image.ANTIALIAS)
    img_io = io.BytesIO()
    img.save(img_io, fType)
    img_io.seek(0)
    key_path = (
        "{}/{}{}".format(prefix, fActual, fExt)
        if prefix
        else "{}{}".format(fActual, fExt)
    )
    return bucket.add(
        img_io.read(), key=key_path, meta={"content-type": fMime}
    )


def main(bucket, s3path, files):
    """ with bucket resize and put up to s3 """
    response = {"result": None, "error": None, "pid": os.getpid()}
    result = {}
    try:
        for key in files:
            for fileinfo in files[key]:
                fname = fileinfo["filename"]
                _, fExt = os.path.splitext(fname)
                fType, fMime = TYPE_MAP.get(fExt.lower(), (None, None))
                if fType is None:
                    raise Exception("File Type not accepted: {}".format(fType))
                key_path = (
                    "{}/original{}".format(s3path, fExt)
                    if s3path
                    else "original{}".format(fExt)
                )
                s3key = bucket.add(
                    fileinfo["body"],
                    key=key_path,
                    meta={"original_name": fname, "content-type": fMime},
                )
                result[key] = {"name": fname, "key": s3key, "original": s3key}
                result[key]["small"] = _make_one(
                    bucket,
                    fileinfo["body"],
                    THUMB_SIZE,
                    fType,
                    fMime,
                    s3path,
                    "small",
                    fExt,
                )
                result[key]["thumb"] = _make_one(
                    bucket,
                    fileinfo["body"],
                    THUMB_SIZE,
                    fType,
                    fMime,
                    s3path,
                    "thumbnail",
                    fExt,
                )
        response["result"] = result
    except Exception as ex:
        logging.exception(ex)
        response["error"] = str(ex)
    return response


class S3Browser(UserMixin, tornado.web.RequestHandler):
    """ list contents of bucket """

    def initialize(self, **kwargs):
        """ setup s3 bucket """
        self.bucket = Bucket(**kwargs)

    @tornado.web.authenticated
    def get(self, prefix=None):
        """ returns the contents of bucket """
        if prefix is None:
            prefix = ""
        delimiter = self.get_argument("d", "/")
        self.set_header("Content-Type", "application/json")
        self.write(dumps(self.bucket.list(prefix, delimiter)))


class S3UploadHandler(UserMixin, tornado.web.RequestHandler):
    """ handler that sizes images and loads them to s3 """

    def initialize(self, **kwargs):
        """ setup s3 bucket """
        self.bucket = Bucket(**kwargs)

    def gen_token(self, length=32):
        """generates and random string of length"""
        return "".join(random.choice(string.hexdigits) for _ in range(length))

    @tornado.web.authenticated
    def get(self, path=None):
        """ return test page """
        return self.render(resource_filename("duckdown", "s3_upload.html"))

    @tornado.web.authenticated
    def post(self, path=None):
        """ handle the upload """
        if not path:
            path = self.gen_token()
        self.write(main(self.bucket, path, self.request.files))
