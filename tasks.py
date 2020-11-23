""" development tasks """
import os
import shutil
import logging
from pathlib import Path
import convoke
import tornado.log
import tornado.options
from invoke import task
from dotenv import dotenv_values
from duckdown import main

PROJECT_NAME = "duckdown"

LOGGER = logging.getLogger(__name__)


@task
def client(ctx):
    """ run the client """
    ctx.run(". nenv/bin/activate; cd client; npm run dev")

@task
def server(_, folder, dev=False):
    """ run the server """
    tornado.options.options.logging = "INFO"
    tornado.log.enable_pretty_logging()
    LOGGER.info("server:")
    settings = {"app_path": folder, "production": not dev}
    config = Path(f"{folder}/config.ini")
    if config.exists():
        settings["config"] = config
    convoke.get_settings(PROJECT_NAME, **settings)
    main.main()


@task
def lint(ctx):
    """ tidy up and check """
    ctx.run(f"black -l 79 {PROJECT_NAME}")
    ctx.run(f"pylint {PROJECT_NAME}")

@task
def clean(ctx):
    """ tidy up """
    ctx.run("rm -rf client/dist")
    ctx.run("rm -rf duckdown/assets/vue/")
    ctx.run("rm -rf build")
    ctx.run("rm -rf dist")

@task
def build(ctx):
    """ build the client """
    ctx.run(". nenv/bin/activate; cd client; npm run build")
    src = "client/dist/_assets/"
    dst = "duckdown/assets/vue/"
    shutil.copytree(src, dst)

@task(pre=[clean, lint, build])
def release(ctx, message, part="patch"):
    """ release the build to git hub """
    ctx.run(f"git add . && git commit -m '{message}'")
    ctx.run(f"bumpversion {part}")
    ctx.run("pip install -r requirements.txt")
    ctx.run("python setup.py sdist bdist_wheel")
    ctx.run("twine upload dist/*")
