"""
    This is a our invoke program
"""
import os
import sys
import tornado.log
from invoke import Program, Collection
from duckdown import VERSION
from .create import create, s3_create
from .run import run
from .publish import publish
from .secure import secure, unsecure

sys.path.insert(0, os.getcwd())

VERSION = "0.0.12"

_NAMESPACE_ = Collection()

_NAMESPACE_.add_task(create)
_NAMESPACE_.add_task(run)
_NAMESPACE_.add_task(publish)
_NAMESPACE_.add_task(secure)
_NAMESPACE_.add_task(unsecure)
_NAMESPACE_.add_task(s3_create)

tornado.log.enable_pretty_logging()

program = Program(
    version=VERSION, namespace=_NAMESPACE_
)  # pylint: disable=C0103
