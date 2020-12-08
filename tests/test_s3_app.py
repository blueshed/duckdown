""" test s3 functionality """
import logging
import pytest
from dotenv import load_dotenv
from duckdown.app import App
from duckdown.config import Config
from duckdown.utils import json_utils
from .utils import using_cookie

logging.getLogger().setLevel(logging.INFO)
load_dotenv(verbose=True)

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


def test_list(app):
    """ test list folder """
    print(SAMPLE_FOLDER, SAMPLE_FILE)
    site = app.get_site()
    file = site.list_folder(f"{SAMPLE_FOLDER}/")["files"][0]
    assert file["path"] == SAMPLE_KEY
    assert file["name"] == SAMPLE_FILE


def test_head(app):
    """ test head file """
    site = app.get_site()
    head = site.get_head(SAMPLE_KEY)
    assert head.st_size == len(SAMPLE)


def test_get(app):
    """ test get file """
    site = app.get_site()
    head = site.get_head(SAMPLE_KEY)
    _, data = site.get_file(SAMPLE_KEY)
    assert len(data) == head.st_size


def test_delete(app):
    """ test delete file """
    site = app.get_site()
    site.delete_file(SAMPLE_KEY)


@pytest.mark.gen_test
def test_hello_world(http_client, base_url):
    response = yield http_client.fetch(base_url)
    assert response.code == 200
    print(response.body)
    assert (
        b"//s3-us-east-1.amazonaws.com/test.duckdown.tech/static/images/logo.svg"
        in response.body
    )


@pytest.mark.gen_test
def test_static(http_client, base_url):
    response = yield http_client.fetch(base_url + "/static/site.css")
    assert response.code == 200

    response = yield http_client.fetch(base_url + "/static/images/logo.svg")
    assert response.code == 200

    response = yield http_client.fetch(base_url + "/favicon.ico")
    assert response.code == 200

    response = yield http_client.fetch(base_url + "/robots.txt")
    assert response.code == 200

    response = yield http_client.fetch(
        base_url + "/happy.html", raise_error=False
    )
    assert response.code == 404


@pytest.mark.gen_test
async def test_home(http_client, base_url):
    """ can we see home page """

    response = await http_client.fetch(
        base_url, follow_redirects=False, raise_error=False
    )
    assert response.code == 200


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


@pytest.mark.gen_test
async def test_assets(http_client, base_url):
    """ can we list pages """

    async with using_cookie(http_client, base_url) as cookie:
        response = await http_client.fetch(
            base_url + "/edit/assets/logo.svg",
            follow_redirects=False,
            raise_error=False,
            headers={"Cookie": cookie},
        )
        assert response.code == 200


@pytest.mark.gen_test
async def test_edit_pages(http_client, base_url):
    """ can we list pages """

    async with using_cookie(http_client, base_url) as cookie:
        response = await http_client.fetch(
            base_url + "/edit/pages/",
            follow_redirects=False,
            raise_error=False,
            headers={"Cookie": cookie},
        )
        assert response.code == 200
        print(response.body)
        result = json_utils.loads(response.body)
        assert result["files"][0]["name"] == "index.md"

        response = await http_client.fetch(
            base_url + "/edit/pages/test.md",
            method="PUT",
            body=SAMPLE,
            follow_redirects=False,
            raise_error=False,
            headers={"Cookie": cookie},
        )
        assert response.code == 200

        response = await http_client.fetch(
            base_url + "/edit/pages/test.md",
            follow_redirects=False,
            raise_error=False,
            headers={"Cookie": cookie},
        )
        assert response.code == 200
        assert response.body == SAMPLE

        response = await http_client.fetch(
            base_url + "/edit/pages/test.md",
            method="DELETE",
            follow_redirects=False,
            raise_error=False,
            headers={"Cookie": cookie},
        )
        assert response.code == 200
