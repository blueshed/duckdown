""" utilities """
import contextlib
import contextvars
import datetime
import functools
import logging
from dataclasses import dataclass
from liteblue import context
from liteblue.handlers import BroadcastMixin
from liteblue.connection import ConnectionMgr
from liteblue.handlers import json_utils
from . import tables

LOGGER = logging.getLogger(__name__)

BROADCAST_ON_SUCCESS = contextvars.ContextVar("BROADCAST_ON_SUCCESS")


def broadcast_on_success(message, user_ids=None):
    """ This allows for the broadcast to client after func return """
    LOGGER.info("broadcast_on_success(%r, %r)", message, user_ids)
    BROADCAST_ON_SUCCESS.get([]).append((message, user_ids))


@contextlib.contextmanager
def _user_call_(user=None):
    """ patch liteblue to introduce broadcast of success """
    utoken = context.USER.set(user)
    btoken = BROADCAST_ON_SUCCESS.set([])
    LOGGER.info("context vars set")
    try:
        yield
        LOGGER.info("running broadcasts")
        for message, user_ids in BROADCAST_ON_SUCCESS.get([]):
            BroadcastMixin.broadcast(message, user_ids)
    finally:
        LOGGER.info("context vars unset")
        context.USER.reset(utoken)
        BROADCAST_ON_SUCCESS.reset(btoken)


# patch liteblue to use this feature
context._user_call_ = _user_call_


def logger(func):
    """
    A method wrapper that adds a Log object to the database on success
    It records all pending broadcast messages.
    """

    @functools.wraps(func)
    def log_result(*args, **kwargs):
        LOGGER.info("call: %s", func)
        result = func(*args, **kwargs)
        now = datetime.datetime.now()
        user = context.current_user()
        messages = BROADCAST_ON_SUCCESS.get([])
        with ConnectionMgr.session() as session:
            session.execute(
                tables.log.insert(),
                [
                    {
                        "message": message,
                        "accl": repr(accl),
                        "created_by": user.id,
                        "created": now,
                    }
                    for message, accl in messages
                ],
            )
            session.commit()
        LOGGER.info("logged: %s", messages)
        return result

    return log_result
