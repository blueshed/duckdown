import { createWebHashHistory } from 'vue-router'
import duckdown from "./duckdown.vue"
import settings from "./settings.vue"

export default {
    history: createWebHashHistory(),
    routes: [{
            path: '/settings',
            component: settings,
            meta: { transition: 'slide-left' },
        },
        {
            path: '/',
            component: duckdown,
            meta: { transition: 'slide-right' },
        }
    ]
}