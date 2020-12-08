""" test s3 functionality """
import contextlib
import logging
import pytest
from dotenv import load_dotenv
from duckdown.app import App
from duckdown.config import Config
from duckdown.utils import json_utils
from duckdown.tool.create import populate_folder
from .utils import using_cookie

logging.getLogger().setLevel(logging.INFO)
LOGGER = logging.getLogger(__name__)
load_dotenv(verbose=True)

SAMPLE = b"""Hello World! I'm a sample file."""
SAMPLE_KEY = "test/test.txt"
SAMPLE_FOLDER, SAMPLE_FILE = SAMPLE_KEY.split("/")
COOKIE_NAME = "tets_duck"
APP_PATH = "tests/data/test_site"


@pytest.fixture(scope="session")
def app():
    populate_folder(APP_PATH, force=True)

    class AppConfig(Config):
        """ config override for tests """

        app_path = APP_PATH
        cookie_name = COOKIE_NAME

    duck_app = App(AppConfig())
    return duck_app


@pytest.mark.gen_test
async def test_hello_world(app, http_client, base_url):
    LOGGER.info("settings: %s", app.settings)
    response = await http_client.fetch(base_url)
    assert response.code == 200
    print(response.body)
    assert b"/static/images/logo.svg" in response.body


@pytest.mark.gen_test
async def test_login(http_client, base_url):
    """ can we login """
    response = await http_client.fetch(base_url + "/login")
    assert response.code == 200

    async with using_cookie(http_client, base_url) as cookie:
        response = await http_client.fetch(
            base_url + "/edit",
            follow_redirects=False,
            raise_error=False,
            headers={"Cookie": cookie},
        )
        assert response.code == 200