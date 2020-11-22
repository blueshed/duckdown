""" task to create app template """
import os
from shutil import copyfile
from pkg_resources import resource_filename
from invoke import task


@task
def create(ctx, path, force=False):
    """ create a duckdown app at path """
    if os.path.exists(path):
        if force is False:
            print("already exists: ", path)
            return

        print("removing ", path)
        ctx.run(f"rm -rf {path}")

    print("creating ", path)
    sources = [
        ("", "config.ini"),
        ("", "users.json"),
        ("pages", "index.md"),
        ("static", "site.css"),
        ("static", "favicon.ico"),
        ("static/images", "logo.svg"),
        ("templates", "site_tmpl.html"),
    ]

    for folder in {folder for folder, _ in sources if folder}:
        os.makedirs(os.path.join(path, folder), exist_ok=True)

    for folder, file in sources:
        copyfile(
            resource_filename("duckdown.tool", f"data/{file}"),
            os.path.join(path, folder, file),
        )
