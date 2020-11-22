""" run duckdown app """
import os
import convoke
from invoke import task
from duckdown.main import main


@task
def run(_, path):
    """ run app """
    settings = {
        "debug": "True",
        "local_images": "False",
        "static_path": os.path.join(path, "static"),
        "template_path": os.path.join(path, "templates"),
        "pages_path": os.path.join(path, "pages"),
    }
    convoke.get_settings("duckdown", **settings)
    main()
