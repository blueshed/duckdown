# pylint: disable=W0201, E1101
""" handle request for markdown pages """
import logging
import os
import importlib
from tornado.web import RequestHandler, HTTPError
from tornado.escape import url_escape
from ..utils.converter_mixin import ConverterMixin
from .access_control import UserMixin
from ..utils.nav import nav


LOGGER = logging.getLogger(__name__)
EMPTY_TOC = '<div class="toc">\n<ul></ul>\n</div>\n'


class SiteHandler(
    UserMixin, ConverterMixin, RequestHandler
):  # pylint: disable=W0223
    """ inline transform request for markdown pages """

    def initialize(self, pages, s3_loader=None, is_s3=False):
        """ setup init properties """
        self.pages = pages
        self.meta = None
        self.nav = None
        self.site_nav = None
        self._is_s3_ = is_s3
        self._s3_loader = s3_loader

    def create_template_loader(self, template_path):
        """ return s3 loader """
        if self._s3_loader:
            return self._s3_loader
        return super().create_template_loader(template_path)

    def get_file_content(self, path, mode="r", encoding="utf-8"):
        """ return file content if exists else None"""
        result = None
        _, result = self.application.get_file(path)
        if result and mode == "r":
            result = result.decode(encoding)
        return result

    @property
    def has_toc(self):
        """ determin if toc is empty """
        return self.meta.toc != EMPTY_TOC

    def meta_value(self, name, default=None):
        """ return markdown meta value """
        return self.meta.Meta.get(name, [default])

    def one_meta_value(self, name, default=None):
        """ return markdown meta value """
        result = self.meta_value(name, default)
        return result[0] if result else None

    def load_site_nav(self, path):
        """ set the handler site_nav attribute """
        menu = nav(self.pages, path)
        if menu:
            self.site_nav = "\n".join(menu)

    def load_dir_nav(self, path):
        """ load nav section if it exist """
        folder = os.path.dirname(path)
        if folder:
            LOGGER.info(" -- folder: %s", folder)
            nav_path = os.path.join(folder, "-nav.md")
            content = self.get_file_content(nav_path, "r", encoding="utf-8")
            if content:
                LOGGER.info(" -- nav: %s", nav_path)
                content = self.meta.convert(content)
                self.nav = self.convert_images(content)

    def run_script(self, script_name, path):
        """ load a module and call module.main """
        name = f"{self.application.settings['duck_scripts']}.{script_name}"
        script_module = importlib.import_module(name)

        return script_module.main(path)

    async def get(self, path):
        """ handle get """
        path = path if path else "index.html"

        file, ext = os.path.splitext(path)

        doc = os.path.join(self.pages, f"{file}.md")
        content = self.get_file_content(doc, "r", encoding="utf-8")
        if content is None:
            raise HTTPError(404)

        self.meta = self.markdown
        self.load_dir_nav(doc)
        self.load_site_nav(path)

        file_path = os.path.split(file)[0]

        # load theme
        theme_file = os.path.join(self.pages, file_path, "-theme.css")
        theme_css = self.get_file_content(theme_file)
        if theme_css:
            LOGGER.info(" -- theme.css")

        edit_path = "/edit"
        if file:
            edit_path = f"/edit?path={ url_escape(file) }.md"

        LOGGER.info(" -- ext: %s", ext)
        if ext == ".html":
            content = self.meta.convert(content)
            LOGGER.info(" -- meta: %s", self.meta.Meta)
            template = self.one_meta_value("template", "site")
            LOGGER.info(" -- tmpl: %s", template)
            for key in self.meta.Meta:
                if key.startswith("x-script-"):
                    outcome = self.run_script(self.meta.Meta[key][0], path)
                    self.meta.Meta[key] = [outcome]
            self.render(
                f"{template}_tmpl.html",
                content=self.convert_images(content),
                edit_path=edit_path,
                theme_css=theme_css,
            )
        else:
            self.write(self.convert_images(content))
