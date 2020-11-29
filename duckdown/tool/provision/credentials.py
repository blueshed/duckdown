""" save credentials """
import io
import os
import logging
import configparser
from contextlib import contextmanager
from .store import store

LOGGER = logging.getLogger(__name__)
DEFAULT_FILENAME = "credentials.cfg"


def _get_config_(default_path="~/.aws/credentials"):
    # open configparser
    config = configparser.ConfigParser(allow_no_value=True)
    config.read([f"./inventory/{DEFAULT_FILENAME}"])
    if not config:
        # read defaults and start over
        path = os.path.expanduser(default_path)
        assert os.path.isfile(path), "missing credentials"
        config.read([path])

    LOGGER.debug(config.sections())
    return config


def _save_config_(config):
    """ save to store """
    with io.StringIO() as stream:
        config.write(stream)
        credentials = stream.getvalue()

    cfg_path = store(DEFAULT_FILENAME, credentials, as_json=False)

    return cfg_path


def save_credentials(default_path="~/.aws/credentials"):
    """ open the default aws credentials and save in provision """
    config = _get_config_(default_path)
    LOGGER.debug(config.sections())
    return _save_config_(config)


def add_credentials(section, **kwargs):
    """ add kwargs to section """
    config = _get_config_()
    if not config.has_section(section):
        config.add_section(section)
    for option, value in kwargs.items():
        config.set(section, option, value)
    _save_config_(config)


@contextmanager
def using_credentials(section, default_path="~/.aws/credentials"):
    """ set the environ credentials """
    config = _get_config_(default_path)
    keys = ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"]
    previous = {}
    for key in keys:
        previous[key] = os.environ.get(key, None)
        os.environ[key] = config[section][key]
    try:
        yield
    finally:
        for key, value in previous.items():
            if value:
                os.environ[key] = value
            else:
                del os.environ[key]
