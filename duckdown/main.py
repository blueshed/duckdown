""" application entry point """
import logging
import tornado.ioloop
import tornado.log
from dotenv import load_dotenv
from .utils import run_tornado
from .app import make_app

LOGGER = logging.getLogger(__name__)


def main():
    """ make an app and run it """
    load_dotenv(verbose=True)
    app = make_app()
    run_tornado.run(app)


if __name__ == "__main__":
    tornado.log.enable_pretty_logging()
    main()
