# pylint: disable=W0621
""" testing utilities and fixtures """
import os
import logging
from urllib.parse import urlencode
import pytest
import boto3
from duckdown.tool.create import SOURCES
from pkg_resources import resource_filename
from tornado import httpclient

LOGGER = logging.getLogger(__name__)


def wait_s3(port):
    """ waits for minio """
    url = f"http://127.0.0.1:{port}/"
    client = httpclient.HTTPClient()
    try:
        response = client.fetch(url, raise_error=False)
        if 200 <= response.code < 500:
            return True
    except Exception:  # pylint: disable=W0703
        pass
    return False


@pytest.fixture(scope="session")
def site_bucket():
    return "test.duckdown.tech"


@pytest.fixture(scope="session")
def test_site(docker_services, site_bucket):
    """ s3 fixture """
    public_port = docker_services.port_for("test_s3", 9000)
    public_url = f"http://localhost:{public_port}/{site_bucket}/"
    credentials = {
        "aws_access_key_id": "minio",
        "aws_secret_access_key": "minio123",
        "endpoint_url": f"http://localhost:{public_port}",
        "region_name": "us-east-1",
    }
    docker_services.wait_until_responsive(
        timeout=10.0, pause=0.5, check=lambda: wait_s3(public_port)
    )
    resource = boto3.resource("s3", **credentials)
    try:
        bucket = resource.Bucket(site_bucket)
        bucket.objects.all().delete()
        bucket.delete()
    except Exception:  # pylint: disable=W0703
        pass
    resource.create_bucket(ACL="public-read", Bucket=site_bucket)

    LOGGER.info("loading: %s", bucket)
    for folder, file in SOURCES:
        key = f"{folder}/{file}" if folder else file
        path = resource_filename("duckdown.tool", f"data/{file}")
        bucket.upload_file(Filename=path, Key=key)

    return site_bucket, public_port, public_url, credentials
