# pylint: disable=C0103, W0401, W0614
""" sqlalchemy schema """
import enum
from sqlalchemy import *


class PERMISSIONS_VALUES(enum.Enum):
    """ enum type for permission.permissions """

    owner_ = 0
    writer_ = 1
    reader_ = 2


metadata = MetaData()


user = Table(
    "user",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("email", String(128), nullable=False, unique=True, doc="required"),
    Column("password", String(64), doc="and no longer"),
)


site = Table(
    "site",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("name", String(255)),
    Column("published_url", String(255)),
    Column("published_on", DateTime),
    Column("subdomain", String(128), unique=True),
    Column("bucket", String(128)),
)


permission = Table(
    "permission",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("user_id", Integer, ForeignKey("user.id", name="fk_permission_user_id")),
    Column("site_id", Integer, ForeignKey("site.id", name="fk_permission_site_id")),
    Column("permissions", Enum(PERMISSIONS_VALUES)),
)
