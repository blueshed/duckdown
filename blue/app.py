# pylint: disable=too-few-public-methods
""" A duckdown with rpc """
import logging
from importlib import import_module
from concurrent.futures import ThreadPoolExecutor
from tornado import ioloop
from liteblue import handlers
from liteblue.worker import Channel
from duckdown.app import App
from .auth import SqlAuthenticator
from .utils import User


LOGGER = logging.getLogger(__name__)


class BlueApp(App):
    """ A duckdown app with rpc """

    def __init__(self, cfg, **settings):
        """ make a duckdown liteblue """
        settings["procedures"] = import_module(cfg.procedures)
        routes = [(r"/ws", handlers.RpcWebsocket)]

        self._cfg_ = cfg
        self._loop_ = ioloop.IOLoop.current()
        self._loop_.set_default_executor(
            ThreadPoolExecutor(max_workers=cfg.max_workers)
        )
        handlers.context.LOOP = self._loop_
        handlers.BroadcastMixin.init_broadcasts(
            self._loop_, cfg.redis_topic, cfg.redis_url
        )
        self.channel = None
        if self._cfg_.redis_workers:
            self.channel = Channel(cfg.redis_url, cfg.redis_queue)
        super().__init__(routes, **settings)

    async def perform(self, user, proc, *args, **kwargs):
        """ runs a proc in threadpool or ioloop """
        if user and isinstance(user, (dict)):
            user = User(**user)
        if self.channel:
            return await self.channel.perform(user, proc, *args, **kwargs)
        proc = getattr(self.settings["procedures"], proc)
        return await handlers.context.perform(user, proc, *args, **kwargs)

    def load_users(self):
        """ load users from local users.json """
        LOGGER.info("using sql authenticator")
        return SqlAuthenticator
