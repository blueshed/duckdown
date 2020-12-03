import { createApp } from 'vue'
import App from './App.vue'
import store from "./store.js"
import './reset.css'
import './index.css'

import utils from './components/utils/main.js'

const app = createApp(App)
app.use(store)
app.use(utils)
console.debug("loading img_path")
store.dispatch("load_img_path").then(() => {
    console.debug("loaded img_path", "mounting")
    app.mount('#app')
    store.dispatch("load_files_folders", "").then(() => {
        console.debug("loading files_folder")
        store.dispatch("load_image_files_folders", "")
        console.debug("loading images", "mounting")
        console.debug("after load")
    })
})