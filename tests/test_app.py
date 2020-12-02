""" test s3 functionality """
import logging
import contextlib
import urllib.parse
import pytest
from duckdown.app import App

logging.getLogger().setLevel(logging.INFO)

SAMPLE = b"""Hello World! I'm a sample file."""
SAMPLE_KEY = "test/test.txt"
SAMPLE_FOLDER, SAMPLE_FILE = SAMPLE_KEY.split("/")
COOKIE_NAME = "tets_duck"


@pytest.fixture(scope="session")
def app():
    return App(
        app_path="tests/test_site",
        cookie_name=COOKIE_NAME,
        cookie_secret="secret",
    )


@contextlib.asynccontextmanager
async def using_cookie(http_client, base_url):
    """ get a cookie """
    form = {"email": "admin", "password": "admin"}
    body = urllib.parse.urlencode(form)
    response = await http_client.fetch(
        base_url + "/login",
        method="POST",
        body=body,
        follow_redirects=False,
        raise_error=False,
    )
    assert response.code == 302

    value = response.headers["set-cookie"]
    print("cookie:", value)
    assert value
    yield value


def test_put(app):
    """ does it work """
    url = app.put_file(body=SAMPLE, key=SAMPLE_KEY, mime="text/plain")
    print(url)


def test_list(app):
    """ test list folder """
    print(SAMPLE_FOLDER, SAMPLE_FILE)
    file = app.list_folder(f"{SAMPLE_FOLDER}/")["files"][0]
    assert file["path"] == SAMPLE_KEY
    assert file["name"] == SAMPLE_FILE


def test_head(app):
    """ test head file """
    head = app.get_head(SAMPLE_KEY)
    assert head.st_size == len(SAMPLE)


def test_get(app):
    """ test get file """
    head = app.get_head(SAMPLE_KEY)
    _, data = app.get_file(SAMPLE_KEY)
    assert len(data) == head.st_size


def test_delete(app):
    """ test delete file """
    app.delete_file(SAMPLE_KEY)


@pytest.mark.gen_test
async def test_hello_world(http_client, base_url):
    response = await http_client.fetch(base_url)
    assert response.code == 200
    print(response.body)
    assert b"/static/images/logo.svg" in response.body


@pytest.mark.gen_test
async def test_static(http_client, base_url):
    response = await http_client.fetch(base_url + "/static/site.css")
    assert response.code == 200

    response = await http_client.fetch(base_url + "/static/images/logo.svg")
    assert response.code == 200

    response = await http_client.fetch(base_url + "/favicon.ico")
    assert response.code == 200

    response = await http_client.fetch(base_url + "/robots.txt")
    assert response.code == 200

    response = await http_client.fetch(
        base_url + "/happy.html", raise_error=False
    )
    assert response.code == 404


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

# @pytest.mark.gen_test
# async def test_edit_pages(http_client, base_url):
#     """ can we list pages """

#     async with using_cookie(http_client, base_url) as cookie:
#         response = await http_client.fetch(
#             base_url + "/edit/pages/",
#             follow_redirects=False,
#             raise_error=False,
#             headers={"Cookie": cookie},
#         )
#         assert response.code == 200
#         print(response.body)

#         assert False
