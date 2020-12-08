""" development tasks """
import os
import sys
import shutil
import logging
from pathlib import Path
import tornado.log
import tornado.options
from dotenv import load_dotenv
from invoke import task, Collection
from dotenv import dotenv_values
from duckdown.utils.nav import nav as gen_nav
from duckdown.utils import run_tornado
from duckdown.tool import run
import duckdown.tool.provision.tasks

PROJECT_NAME = "duckdown"

LOGGER = logging.getLogger(__name__)


@task
def client(ctx):
    """ run the client """
    ctx.run(". nenv/bin/activate; cd client; npm run dev")


@task
def server(ctx, app_path="", bucket="", debug=False):
    """ run the server """
    load_dotenv(verbose=True)
    tornado.options.options.logging = "INFO"
    tornado.log.enable_pretty_logging()
    LOGGER.info("loaded .env")
    run(ctx, app_path, bucket, debug=debug)


@task
def lint(ctx):
    """ black and pylint """
    ctx.run(f"black -l 79 {PROJECT_NAME}")
    ctx.run(f"pylint {PROJECT_NAME}")


@task
def clean(ctx):
    """ tidy up """
    ctx.run("rm -rf client/dist")
    ctx.run("rm -rf duckdown/assets/vue/")
    ctx.run("rm -rf build")
    ctx.run("rm -rf dist")


@task(pre=[clean])
def build(ctx):
    """ build the client """
    ctx.run(". nenv/bin/activate; cd client; npm run build")
    src = "client/dist/_assets/"
    dst = "duckdown/assets/vue/"
    shutil.copytree(src, dst)


@task(pre=[clean, lint])
def release(ctx, message, part="patch"):
    """ release the build to git hub """
    ctx.run(f"bumpversion {part} --allow-dirty")
    build(ctx)
    ctx.run("pip install -r requirements.txt")
    ctx.run("python setup.py sdist bdist_wheel")
    ctx.run("twine upload dist/*")
    ctx.run(f"git add . && git commit -m '{message}'")
    ctx.run("git push")


@task
def nav(_, site, path="/"):
    """ print out nav for path """
    root = os.path.join(site, "pages")
    print(f"nav for: {root} {path}")
    for line in gen_nav(None, root, path):
        print(line)


@task
def test(ctx):
    """ run out tests """
    ctx.run("py.test --cov duckdown --cov-report term-missing tests")


ns = Collection()
ns.add_task(client)
ns.add_task(server)
ns.add_task(lint)
ns.add_task(clean)
ns.add_task(build)
ns.add_task(release)
ns.add_task(test)
ns.add_collection(duckdown.tool.provision.tasks, "p")
