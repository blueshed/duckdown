# pylint: disable=W0201
"""
    Simple mixin to provide utility methods
    to support User
"""
import logging
from json import dumps, loads
from tornado.web import RequestHandler, HTTPError
from .utils.assets_mixin import AssetsMixin

LOGGER = logging.getLogger(__name__)


class UserMixin:
    """ Support for user in tornado handlers """

    @property
    def cookie_name(self):
        """ return the cookie_name declared in application settings"""
        return self.settings.get("cookie_name")

    def get_current_user(self):
        """ return the current user from the cookie """
        if self.application.settings.get("debug") is True:
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
        user = None
        pwd = self.users.get(username)
        if pwd == password:
            user = username
            LOGGER.info("logged in: %s", user)
        return user

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
