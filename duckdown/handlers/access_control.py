# pylint: disable=W0201
"""
    Simple mixin to provide utility methods
    to support User
"""
import os
import logging
from tornado.web import RequestHandler, HTTPError
from ..utils.assets_mixin import AssetsMixin
from ..utils.json_utils import dumps, loads
from ..utils import encrypt

LOGGER = logging.getLogger(__name__)


class DictAuthenticator:  # pylint: disable=R0903
    """ hold a dictionary and return value, key on get """

    def __init__(self, users):
        self.users = users

    def get(self, key):
        """ simple """
        result = self.users.get(key)
        return (result, key) if result else (None, None)


class UserMixin:
    """ Support for user in tornado handlers """

    @property
    def cookie_name(self):
        """ return the cookie_name declared in application settings"""
        return self.settings.get("cookie_name")

    @property
    def debug(self):
        """ app setting access """
        return self.application.settings.get("debug") is True

    def get_site(self, path):
        """ get the current user site """
        current_user = None
        if hasattr(self, "_current_user"):
            current_user = self._current_user
        return self.application.get_site(current_user, path)

    def get_current_user(self):
        """ return the current user from the cookie """
        if self.debug:
            token = self.request.headers.get("duck-token", None)
            if token:
                return token
        result = self.get_secure_cookie(self.cookie_name)
        if result:
            result = loads(result.decode("utf-8"))
        return result

    def set_current_user(self, value):
        """ put the current user in the cookie """
        if value:
            self.set_secure_cookie(self.cookie_name, dumps(value))
        else:
            self.clear_cookie(self.cookie_name)


class LoginHandler(
    AssetsMixin, UserMixin, RequestHandler
):  # pylint: disable=W0223
    """
    Can be called as ajax from the
    websocket client to get the auth cookie
    into the headers.
    """

    def initialize(self, page=None, users=None):
        """ we're configured with a page """
        self.page = page if page else "login.html"
        self.register = None
        self.users = users

    def get_template_path(self):
        """ return app resource """
        return self.application.settings["duck_templates"]

    def login(self, username, password):
        """ return a user """
        result = None
        pwd, user = self.users.get(username)
        if pwd and os.getenv("DKDN_KEY"):
            LOGGER.info("pwd>: %r", pwd)
            pwd = encrypt.decrypt(pwd)
            LOGGER.info("pwd<: %r", pwd)
        if pwd == password:
            result = user
            LOGGER.info("logged in: %s", username)
        return result

    def get(self, error=None, notice=None):
        """ render the form """
        email = self.get_argument("email", default=None)
        next_ = self.get_argument("next", "/")
        can_register = self.register is not None
        self.render(
            self.page,
            email=email,
            error=error,
            notice=notice,
            next=next_,
            can_register=can_register,
            app_name=self.settings.get("app_name", "duckdown"),
        )

    async def post(self):
        """ handle login post """
        try:
            email = self.get_argument("email", None)
            password = self.get_argument("password", None)
            submit = self.get_argument("submit", "login")
            if email is None or password is None:
                raise HTTPError(403, "email or password is None")

            user = None
            if submit == "login":
                user = self.login(email, password)
            elif self.register:
                user = self.register(email, password)  # pylint: disable=E1102
            if user:
                self.set_current_user(user)
                self.redirect(self.get_argument("next", "/"))
            else:
                raise Exception("email or password incorrect")
        except Exception as ex:  # pylint: disable=W0703
            LOGGER.exception(ex)
            self.get(error=str(ex))


class LogoutHandler(UserMixin, RequestHandler):  # pylint: disable=W0223
    """
    Removes the cookie from application settings
    and redirects.
    """

    def get(self):
        """ removes cookie and redirects to optional next argument """
        self.set_current_user(None)
        self.redirect(self.get_argument("next", "/"))
