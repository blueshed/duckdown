""" test loading setting from settings.cfg """
import configparser


def dump(settings):
    """ print it out """
    print(settings)
    for key, value in settings.items():
        print(f"{key}: {value}")

    for section in settings.sections():
        print(f"{section}")
        for key, value in settings.items(section):
            print(f"    {key}: {value}")


def test_settings():
    """ can we load the test file settings? """
    path = "tests/test_site/settings.cfg"
    settings = configparser.ConfigParser()
    settings.read([path])
    dump(settings)


def test_dotenv():
    """ can we use this parse to load .env """
    path = ".env"
    with open(path) as file:
        data = file.read()
        print(data)
    settings = configparser.ConfigParser()
    settings.read_string("\n".join(["[.env]", data]))
    dump(settings)
