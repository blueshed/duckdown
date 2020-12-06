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

    def initialize(self, pages):
        """ setup init properties """
        self.pages = pages
        self.meta = None
        self.nav = None
        self.site_nav = None
        self.site = None

    def create_template_loader(self, template_path):
        """ if we have one, us it """
        if self.site.template_loader:
            return self.site.template_loader
        return super().create_template_loader(template_path)

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

    def load_site_nav(self, site, path):
        """ set the handler site_nav attribute """
        menu = nav(site, root=self.pages, path=path)
        if menu:
            self.site_nav = "\n".join(menu)

    def load_dir_nav(self, site, path):
        """ load nav section if it exist """
        folder = os.path.dirname(path)
        if folder:
            LOGGER.info(" -- folder: %s", folder)
            nav_path = os.path.join(folder, "-nav.md")
            _, content = site.get_file(nav_path)
            if content:
                content = content.decode("utf-8")
                LOGGER.info(" -- nav: %s", nav_path)
                content = self.meta.convert(content)
                self.nav = self.convert_images(content)

    def run_script(
        self, site, script_name, path
    ):  # pylint: disable=unused-argument
        """ load a module and call module.main """
        name = f"{self.application.settings['script_path']}.{script_name}"
        script_module = importlib.import_module(name)

        return script_module.main(path)

    async def get(self, path):
        """ handle get """
        path = path if path else "index.html"

        file, ext = os.path.splitext(path)

        doc = os.path.join(self.pages, f"{file}.md")
        self.site = self.get_site(path)
        _, content = self.site.get_file(doc)
        if content is None:
            raise HTTPError(404)
        if content:
            content = content.decode("utf-8")

        self.meta = self.markdown
        self.load_dir_nav(self.site, doc)
        self.load_site_nav(self.site, path)

        file_path = os.path.split(file)[0]

        # load theme
        theme_file = os.path.join(self.pages, file_path, "-theme.css")
        _, theme_css = self.site.get_file(theme_file)
        if theme_css:
            LOGGER.info(" -- theme.css")
            theme_css = theme_css.decode("utf-8")

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
                    outcome = self.run_script(
                        self.site, self.meta.Meta[key][0], path
                    )
                    self.meta.Meta[key] = [outcome]
            self.render(
                f"{template}_tmpl.html",
                content=self.convert_images(content),
                edit_path=edit_path,
                theme_css=theme_css,
            )
        else:
            self.write(self.convert_images(content))
