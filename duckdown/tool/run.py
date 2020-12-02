""" run duckdown app """
import os
import sys
import logging
from pathlib import Path
import convoke
from invoke import task
from duckdown.main import main

LOGGER = logging.getLogger(__name__)


def load_settings(path):
    """ load convoke settings from config.ini """
    settings = {"app_path": path}
    config = Path(f"{path}/config.ini")
    if config.exists():
        settings["config"] = config
    result = convoke.get_settings("duckdown", **settings)
    LOGGER.info(result)
    if result.get("scripts", None) is not None:
        sys.path.append(os.getcwd())
    return result


@task
def run(_, path):
    """ run app """
    load_settings(path)
    main()
