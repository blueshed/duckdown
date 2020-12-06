""" an example function and exposing it through __all__ """
import base64
import os
from contextlib import contextmanager
from cryptography.fernet import Fernet
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC


@contextmanager
def fkey(envar="DKDN_KEY", passcode=None):
    """ will provide crypto using os.environ[envar] """

    try:
        key = os.environ[envar]
    except KeyError as ex:
        raise KeyError(f"Expecting environment variable {envar}") from ex

    if passcode:
        password = passcode.encode()  # Convert to type bytes
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=key,
            iterations=100000,
            backend=default_backend(),
        )
        key = base64.urlsafe_b64encode(
            kdf.derive(password)
        )  # Can only use kdf once
    crypto = Fernet(key)
    yield crypto


def encrypt(message, passcode=None):
    """ returns an encrytped utf-8 string """
    with fkey(passcode=passcode) as crypto:
        return crypto.encrypt(message.encode()).decode("utf-8")


def decrypt(message, passcode=None):
    """ returns a decrypted utf-8 string """
    with fkey(passcode=passcode) as crypto:
        return crypto.decrypt(message.encode()).decode("utf-8")
