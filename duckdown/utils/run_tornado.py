""" application entry point """
import os
import logging
import tornado.ioloop
import tornado.log

LOGGER = logging.getLogger(__name__)


def run(app):
    """ make an app and run it """
    if app.settings["debug"] is True:
        LOGGER.info("running in debug mode")

    port = os.getenv("PORT", app.settings.get("port", "8080"))
    app.listen(port)
    LOGGER.info("listening on port: %s", port)

    ioloop = tornado.ioloop.IOLoop.current()
    try:
        ioloop.start()
    except KeyboardInterrupt:
        LOGGER.info("shutting down")
        ioloop.stop()
