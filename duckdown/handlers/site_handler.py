# pylint: disable=W0201, E1101
""" handle request for markdown pages """
import logging
import os
import tornado.web
import markdown
from .converter import Converter
from .access_control import UserMixin
from .nav import nav


LOGGER = logging.getLogger(__name__)
EMPTY_TOC = '<div class="toc">\n<ul></ul>\n</div>\n'


class SiteHandler(
    UserMixin, Converter, tornado.web.RequestHandler
):  # pylint: disable=W0223
    """ inline transform request for markdown pages """

    def initialize(self, pages, s3_loader):
        """ setup init properties """
        self.pages = pages
        self.meta = None
        self.nav = None
        self.site_nav = None
        self._s3_loader = s3_loader

    def create_template_loader(self, template_path):
        """ return s3 loader """
        if self._s3_loader:
            return self._s3_loader
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
            nav_path = os.path.join(self.pages, folder, "-nav.md")
            if os.path.isfile(nav_path):
                LOGGER.info(" -- nav: %s", nav_path)
                with open(nav_path, "r", encoding="utf-8") as file:
                    content = markdown.markdown(file.read())
                    self.nav = self.convert_images(content)

    def get(self, path):
        """ handle get """
        path = path if path else "index.html"
        file, ext = os.path.splitext(path)

        self.load_dir_nav(path)
        self.load_site_nav(path)

        doc = os.path.join(self.pages, f"{file}.md")
        if not os.path.isfile(doc):
            raise tornado.web.HTTPError(404)
        # edit_path = os.path.join("/edit", f"{file}.md")
        edit_path = "/edit"
        with open(doc, "r", encoding="utf-8") as file:
            content = file.read()
            LOGGER.info(" -- ext: %s", ext)
            if ext == ".html":
                self.meta = self.markdown
                content = self.meta.convert(content)
                LOGGER.info(" -- meta: %s", self.meta.Meta)
                template = self.one_meta_value("template", "site")
                LOGGER.info(" -- tmpl: %s", template)
                self.render(
                    f"{template}_tmpl.html",
                    content=self.convert_images(content),
                    edit_path=edit_path,
                )
            else:
                self.write(self.convert_images(content))
