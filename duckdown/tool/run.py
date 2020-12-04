# pylint: disable=R0913
""" run duckdown app """
import logging
from invoke import task
from duckdown.app import App
from duckdown.s3_app import S3App
from duckdown.utils import run_tornado

LOGGER = logging.getLogger(__name__)


@task
def run(
    _,
    app_path=None,
    bucket=None,
    debug=False,
    cookie="duckdown-cookie",
    secret="it was a dark and stormy duckdown",
    port=8080,
):
    """ run app """
    if app_path:
        LOGGER.info("duckdown local: %s", app_path)
        app = App(
            app_path=app_path,
            debug=debug,
            cookie_name=cookie,
            cookie_secret=secret,
            port=port,
        )
    elif bucket:
        LOGGER.info("duckdown s3: %s", bucket)
        app = S3App(
            bucket,
            debug=debug,
            cookie_name=cookie,
            cookie_secret=secret,
            port=port,
        )
    else:
        print("either a path or bucket are required!")
    run_tornado.run(app)
