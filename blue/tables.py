# pylint: disable=C0103, W0401, W0614
""" sqlalchemy schema """
import enum
from liteblue import context
from sqlalchemy import (
    MetaData,
    Table,
    Column,
    ForeignKey,
    Integer,
    String,
    DateTime,
    Boolean,
    Enum,
    JSON,
    Text,
)


class PERMISSIONS_VALUES(enum.Enum):
    """ enum type for permission.permissions """

    reader = 1
    writer = 2
    owner = 3


metadata = MetaData()


user = Table(
    "user",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("email", String(128), nullable=False, unique=True, doc="required"),
    Column("password", String(64), doc="and no longer"),
    Column("preferences", JSON),
    Column("cognito", JSON),
)


site = Table(
    "site",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("name", String(255), unique=True, nullable=False),
    Column("published_url", String(255)),
    Column("published_on", DateTime),
    Column("subdomain", String(128), unique=True),
    Column("bucket", String(128)),
    Column("public", Boolean(), nullable=False, default=False),
)


permission = Table(
    "permission",
    metadata,
    Column("id", Integer, primary_key=True),
    Column(
        "user_id", Integer, ForeignKey("user.id", name="fk_permission_user_id")
    ),
    Column(
        "site_id", Integer, ForeignKey("site.id", name="fk_permission_site_id")
    ),
    Column("permission", Enum(PERMISSIONS_VALUES), nullable=False),
)


log = Table(
    "log",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("message", JSON),
    Column("accl", Text),
    Column("created", DateTime),
    Column("created_by", Integer),
)
