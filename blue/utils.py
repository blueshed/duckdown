""" utilities """
import logging
from dataclasses import dataclass
from tornado.httpclient import HTTPClient
from tornado.escape import json_decode

LOGGER = logging.getLogger(__name__)


@dataclass
class User:
    id: int = None
    email: str = None
    preferences: dict = None
    cognito: dict = None


def get_ngrok_url():
    """
    Provides a handy helper to get the ngrok public url
    of our dev environment (during debug/testing).
    ngrok has an API that allows us to get our public
    url.  This helper function uses that api call to
    find our public URL and returns it (if ngrok is running).
    Returns None if the function cannot connect to ngrok
    :return: str
    """
    url = None
    response = None
    try:
        http_client = HTTPClient()
        response = http_client.fetch("http://127.0.0.1:4040/api/tunnels")
        data = json_decode(response.body)
        url = data["tunnels"][0]["public_url"]
        url = url.replace("http:", "https:")
        LOGGER.info("NGROK URL = %s", url)
    except:  # pylint: disable=bare-except
        try:
            if response:
                content = response.body.decode("utf8")
                x = content.find("https")
                y = content.find('\\"', x + 1)
                url = content[x:y]
        except:  # pylint: disable=bare-except
            pass
    return url
