import { createApp } from 'vue'
import App from './App.vue'
import './reset.css'
import './index.css'

import icon from './components/Icon.vue'

const app = createApp(App)
app.component("icon", icon)
app.mount('#app')
