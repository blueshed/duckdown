# pylint: disable=R0914
""" make public folder of site """
import os
import logging
import shutil
from tornado import httpclient
from invoke import task

LOGGER = logging.getLogger(__name__)


@task
def publish(_, src, dst="public", port="8080"):
    """ generate public site """
    port = int(port)
    http_client = httpclient.HTTPClient()

    public_path = dst
    if os.path.isdir(public_path):
        shutil.rmtree(public_path)

    pages = os.path.join(src, "pages")
    for dirpath, _, filenames in os.walk(pages):
        for filename in filenames:
            if filename[0] not in ["-"]:
                page, ext = os.path.splitext(os.path.join(dirpath, filename))
                if ext == ".md":
                    web_page = os.path.relpath(page, pages)
                    web_page = f"{os.path.splitext(web_page)[0]}.html"
                    LOGGER.debug("page: %s%s", page, ext)
                    LOGGER.debug("\tweb: %s", web_page)

                    public_page = os.path.join(public_path, web_page)
                    LOGGER.debug("\tpub: %s", public_page)
                    url = f"http://localhost:{port}/{web_page}"
                    LOGGER.debug(url)
                    response = http_client.fetch(url)
                    folder = os.path.split(public_page)[0]
                    if folder and not os.path.exists(folder):
                        os.makedirs(folder)
                    with open(public_page, "wb") as file:
                        file.write(response.body)

    static = os.path.join(src, "static")
    public_static = os.path.join(public_path, "static")
    for dirpath, _, filenames in os.walk(static):
        if dirpath.endswith("/images"):
            continue
        for filename in filenames:
            fsrc = os.path.join(dirpath, filename)
            fdst = os.path.join(
                os.path.relpath(os.path.split(fsrc)[0], static), public_static
            )
            LOGGER.debug("%s %s", fsrc, fdst)
            if fdst != ".":
                os.makedirs(fdst, exist_ok=True)
            shutil.copy(fsrc, fdst)
    LOGGER.info("done!")
