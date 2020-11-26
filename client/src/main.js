import { createApp } from 'vue'
import App from './App.vue'
import './reset.css'
import './index.css'

import utils from './components/utils/main.js'

const app = createApp(App)
app.use(utils)
app.mount('#app')
