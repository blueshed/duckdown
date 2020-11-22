""" fixtures """
import pytest
import convoke
from duckdown.main import make_app

@pytest.fixture
def app(default_db, io_loop):
    """ returns a testable app """
    convoke.get_settings("duckdown", debug="False", local_images="True")
    app = make_app()  # a tornado.web.Application
    yield app