""" A utility to scan a directory and generate navigation """
import os
import logging

LOGGER = logging.getLogger(__name__)


def parse_header(content, tag=None, alt_tag=None):
    """ return header or header tag value """
    values = {}
    parts = content.split("\n\n", 1)
    if len(parts) == 2:
        header, _ = parts
        for line in header.split("\n"):
            try:
                name, value = line.split(":", maxsplit=1)
            except ValueError:
                LOGGER.info(line)
                raise
            values[name.strip()] = value.strip()
    result = None
    if tag:
        result = values.get(tag)
    if result is None and alt_tag is not None:
        result = values.get(alt_tag)
    if result is None:
        result = values
    return result


def nav(root: str, path: str) -> str:  # pylint: disable=W0613
    """
    walk from root and discover index.md
    grab the title and generate <ul class="nav>
    go as deep a peers to path
    """
    result = []
    result.append('<ul class="nav">')
    indent = "    "
    depth = 0
    for dirpath, _, filenames in os.walk(root):
        for filename in filenames:
            if filename == "index.md":
                file_path = os.path.join(dirpath, filename)
                with open(file_path) as file:
                    title = parse_header(file.read(), "nav", "Title")
                if title:
                    fpath, _ = os.path.splitext(file_path)
                    rel_path = os.path.relpath(f"{fpath}.html", root)
                    new_depth = rel_path.count("/")
                    if new_depth > depth:
                        result.append(f'{indent * (depth+1)}<ul class="nav">')
                    elif new_depth < depth:
                        result.append(f"{indent * depth}</ul>")
                    result.append(
                        f'{indent * (new_depth+1)}<li><a href="/{rel_path}">{title}</a></li>'
                    )
                    depth = new_depth
    while depth:
        result.append(f"{indent * depth}</ul>")
        depth = depth - 1
    result.append("</ul>")
    return result
