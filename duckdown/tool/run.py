# pylint: disable=R0913
""" run duckdown app """
import logging
from invoke import task
from duckdown.app import App
from duckdown.config import Config
from duckdown.utils import run_tornado

LOGGER = logging.getLogger(__name__)


@task
def run(
    _,
    app_path="",
    bucket="",
    debug=False,
    port=8080,
):
    """ run app """
    settings = {
        "app_path": app_path,
        "bucket": bucket,
        "debug": debug,
        "port": port,
    }
    if not app_path and not bucket:
        LOGGER.info("run: %s", settings)
        print("either a path or bucket are required!")
    else:
        app = App(Config(**settings))
        run_tornado.run(app)
