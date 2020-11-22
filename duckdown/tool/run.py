""" run duckdown app """
from pathlib import Path
import convoke
from invoke import task
from duckdown.main import main


def load_settings(path):
    """ load convoke settings from config.ini """
    settings = {"app_path": path}
    config = Path(f"{path}/config.ini")
    if config.exists():
        settings["config"] = config
    return convoke.get_settings("duckdown", **settings)


@task
def run(_, path):
    """ run app """
    load_settings(path)
    main()
