import { createApp } from 'vue'
import App from './App.vue'
import './reset.css'
import './index.css'

import icon from './components/icon.vue'
import folders_files from './components/folders_files.vue'
import breadcrumbs from './components/breadcrumbs.vue'

const app = createApp(App)
app.component("icon", icon)
app.component("folders-files", folders_files)
app.component("breadcrumbs", breadcrumbs)
app.mount('#app')
