""" utils """
import boto3
from pkg_resources import resource_filename


def get_bucket_arn(bucket_name, region="", account_id=""):
    """ We need the arn of a queue """
    bucket_arn = f"arn:aws:s3:{region}:{account_id}:{bucket_name}"
    return bucket_arn


def get_aws_region_account():
    """ Return the aws region and account_id """
    session = boto3.Session()
    region = session.region_name
    sts = session.client("sts")
    response = sts.get_caller_identity()
    return region, response["Account"]


def get_resource(name):
    """ return resource content """
    path = resource_filename("duckdown.tool.provision", f"resources/{name}")
    with open(path) as file:
        return file.read()
