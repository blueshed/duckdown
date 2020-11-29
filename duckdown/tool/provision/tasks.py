""" provision tasks """
from invoke import task
from duckdown.handlers.utils import json_utils
from .credentials import using_credentials
from . import s3_tools, iam_tools, route53_tools


@task
def get_region(_):
    """ aws region """
    print(s3_tools.get_aws_region_account())


@task
def get_buckets(_):
    """ list buckets """
    response = s3_tools.buckets()
    print(json_utils.dumps(response, indent=4))


@task
def get_bucket(_, name):
    """ get bucket """
    response = s3_tools.get_bucket(name)
    print(json_utils.dumps(response, indent=4))


@task
def create_bucket(_, name):
    """ create a bucket on s3 """
    response = s3_tools.create_bucket(name, True)
    print(json_utils.dumps(response, indent=4))


@task
def delete_bucket(_, name):
    """ delete bucket on s3 """
    response = s3_tools.delete_bucket(name)
    print(json_utils.dumps(response, indent=4))


@task
def create_website(_, name, title=None):
    """ convert bucket to s3 website """
    response = s3_tools.make_website(name, title)
    print(json_utils.dumps(response, indent=4))


@task
def upload(_, creds, bucket_name, key, filepath):
    """ upload file to bucket """
    with using_credentials(creds):
        response = s3_tools.upload(bucket_name, key, filepath)
        print(json_utils.dumps(response, indent=4))


@task
def get_user(_, name):
    """ get iam user """
    response = iam_tools.get_user(name)
    print(json_utils.dumps(response, indent=4))


@task
def create_user(_, name, bucket_name):
    """ create a user on iam """
    response = iam_tools.create_user(name, bucket_name)
    print(json_utils.dumps(response, indent=4))


@task
def delete_user(_, name):
    """ delete user on iam """
    response = iam_tools.delete_user(name)
    print(json_utils.dumps(response, indent=4))


@task
def get_domains(_):
    """ list current domains """
    response = route53_tools.get_domains()
    print(json_utils.dumps(response, indent=4))


@task
def get_hosted_zones(_):
    """ list current domains """
    response = route53_tools.get_hosted_zones()
    print(json_utils.dumps(response, indent=4))


@task
def set_bucket_cname(_, bucket_name):
    """ set the CNAME on the domain hosted zone in route53 """
    response = route53_tools.set_website_cname(bucket_name)
    print(json_utils.dumps(response, indent=4))
