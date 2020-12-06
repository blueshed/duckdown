""" task to create app template """
import os
import logging
from shutil import copyfile
from pkg_resources import resource_filename
from invoke import task
from .provision import s3_tools

LOGGER = logging.getLogger(__name__)
SOURCES = [
    ("", "users.json"),
    ("pages", "index.md"),
    ("static", "site.css"),
    ("static", "favicon.ico"),
    ("static", "robots.txt"),
    ("static/images", "logo.svg"),
    ("templates", "site_tmpl.html"),
]


@task
def create(ctx, path, force=False):
    """ create a duckdown app at path """
    if os.path.exists(path):
        if force is False:
            LOGGER.info("already exists: %s", path)
            return

        LOGGER.info("removing %s", path)
        ctx.run(f"rm -rf {path}")

    LOGGER.info("creating %s", path)
    for folder in {folder for folder, _ in SOURCES if folder}:
        os.makedirs(os.path.join(path, folder), exist_ok=True)

    for folder, file in SOURCES:
        copyfile(
            resource_filename("duckdown.tool", f"data/{file}"),
            os.path.join(path, folder, file),
        )


@task
def s3_create(_, bucket, force=False):
    """ create a duckdown app in bucket """

    if force is True:
        LOGGER.info("emptying: %s", bucket)
        s3_tools.empty_bucket(bucket)

    LOGGER.info("loading: %s", bucket)
    for folder, file in SOURCES:
        if file == "config.ini":
            file = "s3_config.ini"
        key = f"{folder}/{file}" if folder else file
        path = resource_filename("duckdown.tool", f"data/{file}")
        s3_tools.upload(bucket, key, path)

    LOGGER.info("done!")
