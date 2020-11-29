""" provision store """
import os
import logging
from duckdown.handlers.utils.json_utils import dumps

LOGGER = logging.getLogger(__name__)


def _make_inventory_store_():
    """ make a directory called inventory """
    # make inventory directory
    path = os.path.join(".", "inventory")
    if not os.path.exists(path):
        LOGGER.info("creating inventory directory: %s", path)
        os.makedirs(path, exist_ok=True)
    return path


def store(name, value, as_json=True):
    """ store file name with value in inventory """
    path = _make_inventory_store_()
    filename = f"{name}.json" if as_json else name
    file_path = os.path.join(path, filename)
    data = dumps(value, indent=4) if as_json else value
    with open(file_path, "w") as file:
        file.write(data)
    return file_path
