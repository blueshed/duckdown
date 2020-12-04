// a ws aware store
import create_ws from "./ws_plugin.js"
import duckdown from "../store.js"

const ws_plugin = create_ws('/ws')
export default {
    strict: false,
    modules: {
        duckdown
    },
    state: {
        broadcast: null,
        status: "connecting",
        profile: null
    },
    getters: {
        broadcast: state => {
            return state.broadcast
        },
        status: state => {
            return state.status
        },
        profile: state => {
            return state.profile
        }
    },
    mutations: {
        set_broadcast(state, value) {
            state.broadcast = value
        },
        set_status(state, value) {
            state.status = value
        },
        set_profile(state, value) {
            state.profile = value
        }
    },
    actions: {
        profile({
            commit
        }) {
            return this.$rpc.call("profile", []).then(response => {
                commit("set_profile", response)
                return response
            }, error => {
                commit("set_error", error)
                return error
            })
        }
    },
    plugins: [ws_plugin]
}