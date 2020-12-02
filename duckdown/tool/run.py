""" run duckdown app """
import logging
from invoke import task
from duckdown.app import App
from duckdown.utils import run_tornado

LOGGER = logging.getLogger(__name__)


@task
def run(_, 
    path,
    debug=False,
    cookie="duckdown-cookie",
    secret="it was a dark and stormy duckdown",
    port=8080):
    """ run app """
    LOGGER.info("duckdown local: %s", path)
    app = App(
        app_path=path,
        debug=debug,
        cookie_name=cookie,
        cookie_secret=secret,
        port=port,
    )
    run_tornado.run(app)