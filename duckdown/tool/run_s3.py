""" run duckdown app """
from invoke import task
from duckdown.s3_app import S3App
from duckdown.utils import run_tornado


@task
def s3_run(
    _,
    bucket,
    debug=False,
    cookie="duckdown-cookie",
    secret="it was a dark and stormy duckdown",
    port=8080,
):
    """ run app """
    LOGGER.info("duckdown s3: %s", bucket)
    app = S3App(
        bucket,
        debug=debug,
        cookie_name=cookie,
        cookie_secret=secret,
        port=port,
    )
    run_tornado.run(app)
