""" test the encrytpion """
import os
from duckdown.utils import encrypt
from dotenv import load_dotenv
from cryptography.fernet import Fernet

load_dotenv(verbose=True)

passcode = "it was a rainy day in woodsend."


def test_encrypt():
    """ can we encrypt """
    message = "foo"
    e_result = encrypt.encrypt(message)
    d_result = encrypt.decrypt(e_result)
    assert message == d_result


def test_encrypt_with_passcode():
    """ can we encrypt """
    message = "foo"
    e_result = encrypt.encrypt(message, passcode)
    d_result = encrypt.decrypt(e_result, passcode)
    assert message == d_result


def test_new_key():
    """ """
    message = "bar"
    old_var = os.getenv("DKDN_KEY")
    os.environ["DKDN_KEY"] = Fernet.generate_key().decode("utf-8")
    e_result = encrypt.encrypt(message)
    d_result = encrypt.decrypt(e_result)

    del os.environ["DKDN_KEY"]
    try:
        encrypt.encrypt(message)
        assert False, "no envar"
    except KeyError:
        pass

    os.environ["DKDN_KEY"] = old_var
    assert message == d_result