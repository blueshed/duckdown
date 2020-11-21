""" development tasks """
import logging
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
def server(_):
    """ run the server """
    tornado.options.options.logging = "INFO"
    tornado.log.enable_pretty_logging()
    LOGGER.info("server:")
    convoke.get_settings(PROJECT_NAME, debug="True", local_images="False")
    main.main()


@task
def lint(ctx):
    """ tidy up and check """
    ctx.run(f"black -l 79 {PROJECT_NAME}")
    ctx.run(f"pylint {PROJECT_NAME}")


@task(pre=[lint])
def release(ctx, message, part="patch"):
    """ release the build to git hub """
    ctx.run(f"git add . && git commit -m '{message}'")
    ctx.run(f"bumpversion {part}")
    ctx.run("git push")


@task
def env(ctx):
    """ list .env """
    values = dotenv_values()
    for key in values:
        cmd = f"heroku config:set {key}={values[key]}"
        print(cmd)
        ctx.run(cmd)


@task
def deploy(ctx):
    """ deploy to heroku """
    ctx.run("heroku container:push web")
    ctx.run("heroku container:release web")
    ctx.run("heroku open")
