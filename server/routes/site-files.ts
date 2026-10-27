import { createTemplateStorage, createStaticStorage } from "../storage";
import { fileRoutes } from "./files";
import { siteChanged } from "../kept";

// templates/site.html decides what every page is wrapped in, and static/site.css
// decides how it looks. Both were editable only from a terminal, which on a
// bucket-backed deployment meant not at all. A template is kept between pages
// (page.ts), so saving one drops what the site keeps.
export const handleTemplateFiles = fileRoutes("/edit/templates/", createTemplateStorage(), siteChanged);
export const handleStaticFiles = fileRoutes("/edit/static/", createStaticStorage());
