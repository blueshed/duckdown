""" test s3 functionality """
import logging
import pytest
from duckdown.s3_app import S3App

logging.getLogger().setLevel(logging.INFO)

SAMPLE = b"""Hello World! I'm a sample file."""
SAMPLE_KEY = "test/test.txt"
SAMPLE_FOLDER, SAMPLE_FILE = SAMPLE_KEY.split("/")


@pytest.fixture
def app():
    return S3App(
        "dkdn.blueshed.info", cookie_name="tets_duck", cookie_secret="secret"
    )


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
def test_hello_world(http_client, base_url):
    response = yield http_client.fetch(base_url)
    assert response.code == 200
    print(response.body)
    assert (
        b"//s3-eu-west-1.amazonaws.com/dkdn.blueshed.info/static/images/logo.svg"
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
