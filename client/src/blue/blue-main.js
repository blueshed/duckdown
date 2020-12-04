import { createApp } from 'vue'
import { createStore } from 'vuex'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './BlueApp.vue'
import blue_store from "./store.js"
import routes from './routes.js'
import '../reset.css'
import '../index.css'

import utils from '../components/utils/main.js'

const store = createStore(blue_store)
const router = createRouter(routes)
const app = createApp(App)
app.config.globalProperties.window = window
app.use(router)
app.use(store)
app.use(utils)
store.dispatch("profile")
store.dispatch("load_img_path").then(() => {
    app.mount('#app')
    store.dispatch("load_files_folders", "").then(() => {
        store.dispatch("load_image_files_folders", "")
        store.dispatch("list_sites")
    })
})