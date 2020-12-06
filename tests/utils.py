""" common functions """
import logging
import contextlib
import urllib.parse

LOGGER = logging.getLogger(__name__)

@contextlib.asynccontextmanager
async def using_cookie(http_client, base_url):
    """ get a cookie """
    form = {"email": "admin", "password": "admin"}
    body = urllib.parse.urlencode(form)
    response = await http_client.fetch(
        base_url + "/login",
        method="POST",
        body=body,
        follow_redirects=False,
        raise_error=False,
    )
    assert response.code == 302

    value = response.headers["set-cookie"]
    LOGGER.debug("cookie: %s", value)
    assert value
    yield value
