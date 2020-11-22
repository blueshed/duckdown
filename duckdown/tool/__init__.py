"""
    This is a our invoke program
"""
import os
import sys
import tornado.log
from invoke import Program, Collection
from duckdown import VERSION
from .create import create
from .run import run
from .publish import publish

sys.path.insert(0, os.getcwd())

VERSION = "0.0.12"

_NAMESPACE_ = Collection()

_NAMESPACE_.add_task(create)
_NAMESPACE_.add_task(run)
_NAMESPACE_.add_task(publish)

tornado.log.enable_pretty_logging()

program = Program(
    version=VERSION, namespace=_NAMESPACE_
)  # pylint: disable=C0103
