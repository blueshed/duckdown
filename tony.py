""" tony dev tools """
import os
import shutil
import string
import uuid
import xml.etree.ElementTree as ET
from tornado import template
from tornado.template import filter_whitespace
from invoke import task

EXCLUDE = set(string.punctuation)
EXCLUDE.remove("-")


def next_id():
    """ generate an id """
    return str(uuid.uuid4())[:8]


def safe_name(name):
    """ string sub and shorted in necessary """
    max_length = 32
    name = filter_whitespace("oneline", name)
    name = "".join(char for char in name if char not in EXCLUDE)
    return name.replace(" ", "-").strip().lower()[:max_length]


def page_title(page):
    """ return page title """
    title = page.get("title")
    image = page.find("image")
    video = page.find("video")

    # print("page.title", title)
    # print("image", image)
    # print("video", video)

    if title is None:
        title = page.get("label")

    if title is None and image is not None:
        title = image.get("title")
        # print("image.title", title)
    if title is None and image is not None:
        title = image.get("src")
        # print("image.src", title)
        if title:
            title = os.path.splitext(title)[0]

    if title is None and video is not None:
        title = video.get("title")
        # print("video.title", title)
    if title is None and video is not None:
        title = video.get("src")
        # print("video.src", title)
        if title:
            title = os.path.splitext(title)[0]

    if title is None:
        raise ValueError("No title")
    return title


def page_filename(page):
    """ return the filename for a page """
    return safe_name(page_title(page))


def get_next_prev(files, file_path):
    """ return next and previous page """
    pages = list(files.keys())
    offset = pages.index(file_path)
    next_ = pages[offset + 1] if offset < (len(pages) - 1) else pages[0]
    prev_ = pages[offset - 1] if offset != 0 else pages[-1]
    return next_, prev_


def gen_tmpl(files, page, file_path, tmpl):
    """ generate tmpl page """
    print("gen_tmpl", file_path)
    next_, prev_ = get_next_prev(files, file_path)
    src, title, poster = None, None, None
    if page.find("image") is not None:
        src = page.find("image").get("src")
        title = page.find("image").get("title")
    if page.find("video") is not None:
        src = page.find("video").get("src")
        title = page.find("video").get("title")
        poster = page.find("video").get("poster")
    caption = (
        filter_whitespace("oneline", page.find("caption").text)
        if page.find("caption") is not None
        else None
    )
    t = template.Template(tmpl)
    os.makedirs(os.path.join("tony/pages", os.path.split(file_path)[0]), exist_ok=True)
    with open(f"tony/pages/{file_path}.md", "wb") as file:
        file.write(
            t.generate(
                page=page,
                next_=next_,
                prev_=prev_,
                caption=caption,
                src=src,
                title=title,
                poster=poster,
            )
        )


@task
def tony(_):
    """ generate tony's site """
    if os.path.isdir("tony/pages"):
        shutil.rmtree("tony/pages")
        os.makedirs("tony/pages")
    tree = ET.parse("tony/static/data.xml")
    root = tree.getroot()
    files = {}
    menu = []
    sub_menus = {}
    for section in root.iter("section"):
        name = section.attrib.get("name")
        section_page = None

        for page in section.findall("page"):
            page_path = os.path.join(name, page_filename(page))
            if name == "video":
                files[page_path] = [gen_tmpl, files, page, page_path, VIDEO_TMPL]
            else:
                files[page_path] = [gen_tmpl, files, page, page_path, PAGE_TMPL]
            section_page = page_path if section_page is None else section_page

        for sub_section in section.findall("subsection"):
            sub_section_page = None
            sub_name = sub_section.attrib.get("name")
            for page in sub_section.findall("page"):
                page_path = os.path.join(name, sub_name, page_filename(page))
                files[page_path] = [gen_tmpl, files, page, page_path, PAGE_TMPL]

                section_page = page_path if section_page is None else section_page
                sub_section_page = page_path if sub_section_page is None else sub_section_page

            sub_menus.setdefault(f"{name}", []).append((sub_name, sub_section_page))
        menu.append((name, section_page))
    
    for page in root.findall("page"):
        name = page.attrib.get("name")
        if name == "index":
            path = f"index"
            files[path] = [gen_tmpl, files, page, path, HOME_TMPL]
        elif name == "information":
            path = f"{name}"
            files[path] = [gen_tmpl, files, page, path, INFO_TMPL]
            menu.append((path, path))

    for args in files.values():
        args[0](*args[1:])
    print(len(files))

    with open("tony/pages/-nav.md", "w") as file:
        for label, path in menu:
            file.write(f"[{label}]({path}.html)  \n")

    for section in root.iter("section"):
        name = section.attrib.get("name")
        with open(os.path.join("tony/pages", name, "-nav.md"), "w") as file:
                for label, path in menu:
                    if label == name :
                        file.write(f"- [{label}](/{path}.html){{class=selected}}  \n")
                    else:
                        file.write(f"- [{label}](/{path}.html)  \n")

        for sub_section in section.findall("subsection"):
            sub_name = sub_section.attrib.get("name")

            with open(os.path.join("tony/pages", name, sub_name, "-nav.md"), "w") as file:
                    for label, path in menu:
                        if label == name :
                            file.write(f"- [{label}](/{path}.html){{class=selected}}  \n")
                            for sub_label, path in sub_menus.get(f"{name}", []):
                                if sub_label == sub_name :
                                    file.write(f"\t - [{sub_label}](/{path}.html){{class=selected}}  \n")
                                else:
                                    file.write(f"\t - [{sub_label}](/{path}.html)  \n")
                        else:
                            file.write(f"- [{label}](/{path}.html)  \n")


INFO_TMPL = """{% whitespace all %}Title: {{ page.attrib["label"] }}
theme: information duckdown
template: information
next: {{ next_ }}
prev: {{ prev_ }}

# {{ page.attrib["label"] }}
{% for table in page.iter('table') %}
## {{ table.attrib['name'] }} { name="{{ table.attrib['name'] }}" }

{% if len(list(table)[0]) == 0 %}
| {{ list(table)[0].tag }} | 
| --- |  
{% for row in table %}| {{ row.text }} |
{% end %}
{% else %}
{% for cell in list(list(table)[0]) %}| {{ cell.tag }} {% end %}| 
{% for cell in list(list(table)[0]) %}| --- {% end %}|  
{% for row in list(table) %}{% for cell in list(row) %}| {{ cell.text }} {% end %}|  
{% end %}

{% end %}

{% end %}
"""

HOME_TMPL = """Title: Antony Donaldson
template: home
next: {{ next_ }}
prev: {{ prev_ }}
"""

VIDEO_TMPL = """{% whitespace all %}Title: {{ page.find("video").get("title") }}
src: /static/images/video/{{ page.find("video").get("src") }}
poster: /static/images/video/{{ page.find("video").get("poster") }}
title: {{page.find("video").get("title")}}
template: video
next: {{ next_ }}
prev: {{ prev_ }}

{{ caption }}
"""

PAGE_TMPL = """{% whitespace all %}Title: {{ title }}
next: {{ next_ }}
prev: {{ prev_ }}

![{{title}}](/static/images/{{src}})  
{{ caption }}
"""


@task
def tony_paths(_):
    """ list folders in tony pages """
    path = "tony/pages"
    for dirpath, _, filenames in os.walk(path):
        if filenames:
            if dirpath[0] == ".":
                continue
            print(os.path.relpath(dirpath, path))
