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
        profile: null,
        sites: null,
        site: null
    },
    getters: {
        broadcast: state => state.broadcast,
        status: state => state.status,
        profile: state => state.profile,
        sites: state => state.sites,
        site: state => state.site
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
        },
        set_preferences(state, value) {
            if (state.profile) {
                state.profile.prefernces = value
            }
        },
        set_sites(state, value) {
            state.sites = value
        },
        set_site(state, value) {
            state.site = value
        },
        upsert_permission(state, value) {
            let perms = state.site.accl
            let perm = perms.find(item => item.email == value.email)
            if (perm) {
                perm.permission = value.permission
            } else {
                perms.push({ email: value.email, permission: value.permission })
            }
        },
        removed_permission(state, email) {
            let perms = state.site.permissions
            let perm = perms.find(item => item.email == email)
            if (perm) {
                perms.splice(perms.indexOf(perm), 1)
            }
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
        },
        list_sites({
            commit
        }) {
            return this.$rpc.call("list_sites", []).then(response => {
                commit("set_sites", response)
                return response
            }, error => {
                commit("set_error", error)
                return error
            })
        },
        get_site({ commit }, site) {
            return this.$rpc.call("get_site", [site.id]).then(response => {
                site.accl = response
                commit("set_site", site)
                return response
            }, error => {
                commit("set_error", error)
                return error
            })
        },
        added_site({ dispatch }, value) {
            dispatch("list_sites")
        },
        saved_preferences({ commit }, value) {
            commit("set_preferences", value)
        },
        added_permission({ state, commit }, value) {
            if (state.site && state.site.id == value.site_id) {
                commit("upsert_permission", value)
            }
        },
        removed_permission({ state, commit }, value) {
            if (value.email == state.profile.email) {
                window.location = '/logout'
            } else if (state.site && state.site.id == value.site_id) {
                commit("remove_permission", value.email)
            }
        }
    },
    plugins: [ws_plugin]
}