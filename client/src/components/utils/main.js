import icon from './icon.vue'
import folders_files from './folders_files.vue'
import breadcrumbs from './breadcrumbs.vue'
import modal from './modal.vue'
import snacks from './snacks.vue'
import sidebar from "./sidebar.vue"


export default {
    install: (app, options) => {
        // Plugin code goes here
        app.component("icon", icon)
        app.component("folders-files", folders_files)
        app.component("breadcrumbs", breadcrumbs)
        app.component("modal", modal)
        app.component("snacks", snacks)
        app.component("sidebar", sidebar)
    }
}