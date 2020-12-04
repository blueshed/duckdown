""" secure a users file """
from invoke import task
from dotenv import load_dotenv
from duckdown.utils.encrypt import encrypt, decrypt
from duckdown.utils import json_utils


@task
def secure(_, path):
    """ encrypt the passwords in a users.json file """
    load_dotenv(verbose=True)

    with open(path) as file:
        users = json_utils.load(file)

    new_values = {}
    for user in users:
        new_values[user] = encrypt(user)

    print(json_utils.dumps(new_values))


@task
def unsecure(_, data):
    """ return to normal """
    load_dotenv(verbose=True)
    print(decrypt(data))
