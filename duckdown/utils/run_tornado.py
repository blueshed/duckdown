""" application entry point """
import logging
import tornado.ioloop
import tornado.log

LOGGER = logging.getLogger(__name__)


def run(app):
    """ make an app and run it """

    app.listen(app.settings["port"])
    LOGGER.info("listening on port: %s", app.settings["port"])

    if app.settings["debug"] is True:
        LOGGER.info("running in debug mode")

    ioloop = tornado.ioloop.IOLoop.current()
    try:
        ioloop.start()
    except KeyboardInterrupt:
        LOGGER.info("shutting down")
        ioloop.stop()