import { createTemplateStorage, createStaticStorage } from "../storage";
import { fileRoutes } from "./files";

// templates/site.html decides what every page is wrapped in, and static/site.css
// decides how it looks. Both were editable only from a terminal, which on a
// bucket-backed deployment meant not at all.
export const handleTemplateFiles = fileRoutes("/edit/templates/", createTemplateStorage());
export const handleStaticFiles = fileRoutes("/edit/static/", createStaticStorage());
