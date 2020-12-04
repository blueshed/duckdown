""" utilities """
import contextlib
import contextvars
from dataclasses import dataclass
from liteblue import context
from liteblue.handlers import BroadcastMixin


@dataclass
class User:
    id: int = None
    email: str = None
    preferences: dict = None
