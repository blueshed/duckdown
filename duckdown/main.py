""" application entry point """
import logging
import tornado.ioloop
import tornado.web
import tornado.log
import convoke
from dotenv import load_dotenv
from .editor_handler import EditorHandler
from .site_handler import SiteHandler
from .dir_handler import DirHandler
from .mark_handler import MarkHandler
from .s3upload_handler import S3UploadHandler, S3Browser
from .access_control import LoginHandler, LogoutHandler

LOGGER = logging.getLogger(__name__)


def make_app():
    """ make a tornado application """
    settings = convoke.get_settings("duckdown")
    pages = settings.get("pages", "pages")
    image_bucket = {
        "bucket_name": "vashti.blueshed.info",
        "aws_access_key_id": settings.get("AWS_ACCESS_KEY_ID"),
        "aws_secret_access_key": settings.get("AWS_SECRET_ACCESS_KEY"),
    }

    routes = [
        (r"/login", LoginHandler),
        (r"/logout", LogoutHandler),
        (r"/browse/(.*)", S3Browser, image_bucket),
        (r"/upload/(.*)", S3UploadHandler, image_bucket),
        (r"/edit/mark/", MarkHandler),
        (r"/edit/pages/(.*)", DirHandler, {"directory": pages}),
        (r"/edit", EditorHandler),
        (r"/(.*)", SiteHandler, {"docs": pages}),
    ]
    tornado_settings = {
        "debug": settings.as_bool("debug", default="False"),
        "port": settings.as_int("port", default="8080"),
        "static_path": settings.get("static", "static"),
        "template_path": settings.get("templates", "templates"),
        "cookie_name": settings.get("cookie_name", "duckdown-cookie"),
        "cookie_secret": settings.get(
            "cookie_secret", "it was a dark and stormy duckdown"
        ),
        "login_url": "/login",
        "app_name": settings.get("app_name", "duckdown-app"),
        "img_path": "https://s3-eu-west-1.amazonaws.com/"
        + "vashti.blueshed.info/images/",
    }
    LOGGER.info("settings: %s", tornado_settings)
    return tornado.web.Application(routes, **tornado_settings)


def main():
    """ make an app and run it """
    load_dotenv(verbose=True)
    app = make_app()

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


if __name__ == "__main__":
    tornado.log.enable_pretty_logging()
    main()
