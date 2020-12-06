""" st_stat of file """
from dataclasses import dataclass


@dataclass
class Head:
    """ because tornado expects it """

    path: str
    st_size: int
    st_mtime: int
