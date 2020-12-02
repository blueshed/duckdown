import { createApp } from 'vue'
import App from './App.vue'
import store from "./store.js"
import './reset.css'
import './index.css'

import utils from './components/utils/main.js'

const app = createApp(App)
app.use(store)
app.use(utils)
app.mount('#app')