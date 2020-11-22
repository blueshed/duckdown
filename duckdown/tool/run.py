""" run duckdown app """
from pathlib import Path
import convoke
from invoke import task
from duckdown.main import main


@task
def run(_, path):
    """ run app """
    settings = {"app_path": path}
    config = Path(f"{path}/config.ini")
    if config.exists():
        settings["config"] = config
    convoke.get_settings("duckdown", **settings)
    main()
