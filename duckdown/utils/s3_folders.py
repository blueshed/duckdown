""" we want to create a commonality with directory """
import io
import logging
import mimetypes
import time
import boto3
import botocore
from .head import Head

LOGGER = logging.getLogger(__name__)


class S3Folder:
    """ files and folders """

    def __init__(self, bucket_name):
        session = boto3.Session()
        self.s3region = session.region_name
        self.s3client = session.client("s3")
        self.s3bucket = bucket_name

    @classmethod
    def _last_item_(cls, value, sep="/"):
        if sep in value:
            if value[-1] == sep:
                value = value[:-1].split(sep)[-1]
            value = value.split(sep)[-1]
        return value

    @classmethod
    def is_file(cls, path):
        """ is this a file """
        return path[-1] == "/"

    def list_folder(self, prefix="", delimiter="/"):
        """ list the contents of bucket folder """
        response = self.s3client.list_objects_v2(
            Bucket=self.s3bucket, Prefix=prefix, Delimiter=delimiter
        )
        LOGGER.debug(response)
        result = {
            "files": [
                {
                    "path": item["Key"],
                    "name": self._last_item_(item["Key"]),
                    "size": item["Size"],
                    "type": mimetypes.guess_type(item["Key"])[0],
                    "file": True,
                }
                for item in response.get("Contents", [])
            ],
            "folders": [
                {
                    "path": item["Prefix"],
                    "name": self._last_item_(item["Prefix"]),
                    "file": False,
                }
                for item in response.get("CommonPrefixes", [])
            ],
        }
        return result

    def get_head(self, key):
        """ return meta data on key """
        response = self.s3client.head_object(Bucket=self.s3bucket, Key=key)
        LOGGER.debug(response)
        st_size = int(response["ContentLength"])
        dt_obj = response["LastModified"]
        st_mtime = time.mktime(dt_obj.timetuple())
        return Head(path=key, st_size=st_size, st_mtime=st_mtime)

    def get_file(self, key):
        """ returns object of key """
        content_type, content = None, None
        try:
            LOGGER.info("getting: %s", key)
            data = io.BytesIO()
            self.s3client.download_fileobj(
                Bucket=self.s3bucket, Key=key, Fileobj=data
            )
            content_type, _ = mimetypes.guess_type(key)
            content = data.getvalue()
        except botocore.exceptions.ClientError as err:
            if err.response["ResponseMetadata"]["HTTPStatusCode"] != 404:
                LOGGER.info(err)
                raise
        return content_type, content

    def put_file(
        self, body=None, key=None, meta=None, mime=None, enc=None
    ):  # pylint: disable=R0913
        """ put_object """
        if mime:
            content_type, content_encoding = mime, enc
        else:
            content_type, content_encoding = mimetypes.guess_type(key)
        if content_type is None:
            raise Exception(f"Unknown Content Type: {key}")

        kwargs = {
            "ACL": "public-read",
            "Body": body,
            "Bucket": self.s3bucket,
            "Key": key,
            "ContentType": content_type,
        }
        if meta:
            kwargs["Meta"] = meta
        if content_encoding:
            kwargs["ContentEncoding"] = content_encoding

        response = self.s3client.put_object(**kwargs)
        LOGGER.debug(response)
        result = self.s3client.generate_presigned_url(
            "get_object", Params={"Bucket": self.s3bucket, "Key": key}
        )
        return result

    def delete_file(self, key):
        """ will remove file from bucket """
        response = self.s3client.delete_object(Bucket=self.s3bucket, Key=key)
        LOGGER.debug(response)
        return response
