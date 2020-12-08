""" test s3 functionality """
import logging
import pytest
from dotenv import load_dotenv
from duckdown.app import App
from duckdown.config import Config
from duckdown.utils import json_utils
from .utils import using_cookie

logging.getLogger().setLevel(logging.INFO)
# load_dotenv(verbose=True)

SAMPLE = b"""Hello World! I'm a sample file."""
SAMPLE_KEY = "test/test.txt"
SAMPLE_FOLDER, SAMPLE_FILE = SAMPLE_KEY.split("/")


@pytest.fixture
def app(test_site):
    site_bucket, _, _, site_credentials = test_site

    class AppConfig(Config):
        """ config override for tests """

        bucket_name = site_bucket
        credentials = site_credentials
        cookie_name = "tets_duck"

    return App(AppConfig())


def test_put(app):
    """ does it work """
    site = app.get_site()
    url = site.put_file(body=SAMPLE, key=SAMPLE_KEY, mime="text/plain")
    print(url)