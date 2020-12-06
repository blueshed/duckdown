""" tools for us with s3 """
import io
import logging
import mimetypes
import boto3
from botocore.exceptions import ClientError
from pkg_resources import resource_filename
from tornado.template import Loader
from duckdown.utils.json_utils import loads
from .store import store
from .utils import get_resource, get_aws_region_account, get_bucket_arn

LOGGER = logging.getLogger(__name__)


def buckets():
    """ return a set of bucket names """
    # create s3 client
    client = boto3.client("s3")
    response = client.list_buckets()
    LOGGER.debug(response)
    return response["Buckets"]


def bucket_exists(bucket_name):
    """ check to see if bucket exists """
    return bucket_name in {bucket["Name"] for bucket in buckets()}


def get_bucket(bucket_name):
    """ get a bucket and store provision """
    result = None
    for bucket in buckets():
        if bucket["Name"] == bucket_name:
            result = bucket
            break

    if result:
        # create s3 client
        client = boto3.client("s3")

        result["arn"] = get_bucket_arn(bucket_name)

        # load cors, acl and policy
        response = client.get_bucket_cors(Bucket=bucket_name)
        LOGGER.debug(response)
        result["cors"] = response["CORSRules"]

        response = client.get_bucket_acl(Bucket=bucket_name)
        LOGGER.debug(response)
        result["acl"] = {
            "Owner": response["Owner"],
            "Grants": response["Grants"],
        }

        response = client.get_bucket_policy(Bucket=bucket_name)
        LOGGER.debug(response)
        result["policy"] = loads(response["Policy"])

        response = client.get_bucket_location(Bucket=bucket_name)
        LOGGER.debug(response)
        result["location"] = response["LocationConstraint"]

        try:
            response = client.get_bucket_website(Bucket=bucket_name)
            LOGGER.debug(response)
            result["website"] = {
                key: value
                for key, value in response.items()
                if key != "ResponseMetadata"
            }
        except ClientError as ex:
            if "NoSuchWebsiteConfiguration" not in str(ex):
                raise

        # store
        store(f"bucket-{bucket_name}", result)
    return result


def create_bucket(bucket_name, public=False, region=None):
    """ create a bucket """
    if region is None:
        region, _ = get_aws_region_account()

    # create s3 client
    client = boto3.client("s3")

    # create bucket
    LOGGER.info("creating bucket: %r in %r", bucket_name, region)

    args = {
        "ACL": "public-read" if public else "private",
        "Bucket": bucket_name,
        "CreateBucketConfiguration": {"LocationConstraint": region},
    }
    LOGGER.info(args)
    response = client.create_bucket(**args)
    LOGGER.debug(response)

    arn = get_bucket_arn(bucket_name)

    # set cors
    cors = {"CORSRules": loads(get_resource("cors_tmpl.json"))}
    response = client.put_bucket_cors(
        Bucket=bucket_name, CORSConfiguration=cors
    )
    LOGGER.debug(response)

    # set policy
    bucket_policy = get_resource("bucket_policy_tmpl.json").format(
        bucket_arn=arn
    )

    response = client.put_bucket_policy(
        Bucket=bucket_name, Policy=bucket_policy
    )
    LOGGER.debug(response)

    return get_bucket(bucket_name)


def empty_bucket(bucket_name, client=None):
    """ remove the conents of a bucket """
    # create s3 client
    client = client if client else boto3.client("s3")

    # get contents
    for key in _bucket_keys_(client, bucket_name):
        # remove contents
        _remove_keys_(client, bucket_name, [key])


def delete_bucket(bucket_name):
    """ delete a bucket """
    # create s3 client
    client = boto3.client("s3")

    # required to be empty
    empty_bucket(bucket_name, client)

    # delete bucket
    response = client.delete_bucket(Bucket=bucket_name)
    LOGGER.debug(response)

    return response


def upload(bucket_name, key, file_path):
    """ upload object to bucket """
    # create s3 client
    client = boto3.client("s3")

    # guess ContentType
    mime, _ = mimetypes.guess_type(file_path, strict=False)
    mime = "text/plain" if mime is None else mime

    with open(file_path, "rb") as file:
        response = client.put_object(
            Body=file, Bucket=bucket_name, Key=key, ContentType=mime
        )
    LOGGER.debug(response)

    return response


def download(bucket_name, key):
    """ return the content of key in bucket """
    # create s3 client
    client = boto3.client("s3")

    content_type, content = None, None
    try:
        LOGGER.debug("getting: %s %s", bucket_name, key)
        data = io.BytesIO()
        client.download_fileobj(Bucket=bucket_name, Key=key, Fileobj=data)
        content_type, _ = mimetypes.guess_type(key)
        content = data.getvalue()
    except ClientError as err:
        if err.response["ResponseMetadata"]["HTTPStatusCode"] != 404:
            LOGGER.info(err)
            raise
    return content_type, content


def _bucket_keys_(client, bucket_name, prefix="", delimiter=""):
    """ list bucket keys """
    response = client.list_objects_v2(
        Bucket=bucket_name, Prefix=prefix, Delimiter=delimiter
    )
    LOGGER.debug(response)
    for obj in response.get("Contents", []):
        yield obj.get("Key")


def _remove_keys_(client, bucket_name, keys):
    """ remove bucket keys """
    for key in keys:
        response = client.delete_object(Bucket=bucket_name, Key=key)
        LOGGER.debug(response)
        return response["ResponseMetadata"]["HTTPStatusCode"], key


def make_website(bucket_name, title=None):
    """ make a website and upload index and error pages """
    # region for url
    region, _ = get_aws_region_account()

    # create s3 client
    client = boto3.client("s3")

    if title is None:
        title = bucket_name

    # load pages
    loader = Loader(resource_filename("duckdown.tool.provision", "resources"))
    index_page = loader.load("index_tmpl.html").generate(title=title)
    error_page = loader.load("error_tmpl.html").generate(title=title)
    response = client.put_object(
        Body=index_page,
        Bucket=bucket_name,
        Key="index.html",
        ContentType="text/html",
    )
    LOGGER.debug(response)
    response = client.put_object(
        Body=error_page,
        Bucket=bucket_name,
        Key="error.html",
        ContentType="text/html",
    )
    LOGGER.debug(response)

    # set as website
    response = client.put_bucket_website(
        Bucket=bucket_name,
        WebsiteConfiguration={
            "ErrorDocument": {"Key": "error.html"},
            "IndexDocument": {"Suffix": "index.html"},
        },
    )
    LOGGER.debug(response)

    get_bucket(bucket_name)
    return f"http://{bucket_name}.s3-website-{region}.amazonaws.com"
