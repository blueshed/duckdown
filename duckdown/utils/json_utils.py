# pylint: disable=R0205, R0911, R0903
"""
    We want our own DateTimeEncoder
"""
import dataclasses
import enum
import json
from collections.abc import Callable
from decimal import Decimal

try:
    from bson.objectid import ObjectId

except ImportError:

    class ObjectId:
        """ in case you're not using Mongodb """


class DateTimeEncoder(json.JSONEncoder):
    """
    Encodes datetimes and Decimals
    calls to_json on object if it has that method
    """

    def default(self, obj):  # pylint: disable=W0221,E0202
        """ check for our types """
        if hasattr(obj, "to_json") and isinstance(
            getattr(obj, "to_json"), Callable
        ):
            return obj.to_json()
        if dataclasses.is_dataclass(obj):
            return dataclasses.asdict(obj)
        if isinstance(obj, enum.Enum):
            return obj.name
        if hasattr(obj, "isoformat"):
            return obj.isoformat().replace("T", " ")
        if isinstance(obj, Decimal):
            return float(obj)
        if isinstance(obj, ObjectId):
            return str(obj)
        return super().default(obj)


def load(*args, **kwargs):
    """ calls json.load """
    return json.load(*args, **kwargs)


def loads(*args, **kwargs):
    """ calls json.loads """
    return json.loads(*args, **kwargs)


def dump(*args, **kwargs):
    """ calls json.load """
    kwargs["cls"] = DateTimeEncoder
    return json.dump(*args, **kwargs)


def dumps(obj, **kwargs):
    """ calls json.dumps using DateTimeEncoder """
    return json.dumps(obj, cls=DateTimeEncoder, **kwargs)
