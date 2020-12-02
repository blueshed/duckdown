""" to support vue and vite """
import logging
import tornado.web
from pkg_resources import resource_filename
from . import json_utils

LOGGER = logging.getLogger(__name__)


def load_manifest(production):
    """ loading manifest for vue dev environment """
    manifest = None
    if production is True:
        LOGGER.info("loading client manifest")
        with open(
            resource_filename("duckdown", "assets/vue/manifest.json")
        ) as file:
            manifest = json_utils.load(file)
    return manifest


def install_vue_handlers(routes, production):
    """ add view handler to routes """

    if production is False:
        LOGGER.info("installing vue dev handler")
        routes.insert(
            0,
            (
                r"/src/(.*)",
                tornado.web.StaticFileHandler,
                {"path": "./client/src/"},
            ),
        )
    else:
        LOGGER.info("installing vue handler")
        _assets = resource_filename("duckdown", "assets/vue/")
        routes.insert(
            0,
            (
                r"/_assets/(.*)",
                tornado.web.StaticFileHandler,
                {"path": _assets},
            ),
        )
