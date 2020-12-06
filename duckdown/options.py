""" here we define our tonrado options """
import os
from tornado.options import define, parse_config_file
from pkg_resources import resource_filename


define('debug',
       default=False,
       type=bool,
       help='run in debug mode')

define('PORT',
       default=8080,
       type=int,
       help='port to listen on')

define("app_name", "duckdown-app", help="which folder to serve as website")
define("app_path", help="which folder to serve as website")
define("bucket", help="which s3 bucket to serve as website")

define("local_images", True)
define("img_path", "/static/images/", help="where the images are.")
define("image_bucket", None, help="s3 bucket for images")

define("duck_path", "/edit/assets/")
define("duck_pages", resource_filename("duckdown", "assets"))
define("duck_assets", resource_filename("duckdown", "assets"))
define("duck_templates", resource_filename("duckdown", "templates"))
define("login_handler", None)
define("vue_page", "vue.html")

def load_config(path=None):
    '''
        This extends the tornado parser to enable use in
        heroku where options are accessed through os.getenv

        Will read file at path if exists

        Will then read environment variables to override

        Will then parse command line to override

    '''
    if path is not None and os.path.isfile(path):
        logging.info("loading config from %s", path)
        parse_config_file(path)

    for k in options.as_dict():
        ''' danger: access of private variables '''
        value = os.getenv(k)
        if value:
            name = options._normalize_name(k)
            option = options._options.get(name)
            option.parse(value)

    parse_command_line()
