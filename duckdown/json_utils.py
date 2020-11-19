# pylint: disable=R0205, R0911, R0903
"""
    We want our own DateTimeEncoder
"""
import dataclasses
import datetime
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


def loads(*args, **kwargs):
    """ calls json.loads """
    return json.loads(*args, **kwargs)


def dumps(obj, **kwargs):
    """ calls json.dumps using DateTimeEncoder """
    return json.dumps(obj, cls=DateTimeEncoder, **kwargs)


def type_from_json(type_, value):
    """provided with a string and type return the value as type"""
    result = value
    if value:
        if type_ == int:
            result = int(value)
        elif type_ == float:
            result = float(value)
        elif type_ == bool:
            result = str(value).lower() in ("yes", "true", "t", "1")
        elif type_ == Decimal:
            result = Decimal(value)
        elif type_ == datetime.datetime:
            result = (
                datetime.datetime.strptime(value, "%Y-%m-%d %H:%M:%S")
                if value
                else None
            )
        elif type_ == datetime.date:
            result = (
                datetime.datetime.strptime(value, "%Y-%m-%d").date()
                if value
                else None
            )
        elif type_ == datetime.time:
            result = (
                datetime.datetime.strptime(value, "%H:%M:%S").time()
                if value
                else None
            )
    return result
