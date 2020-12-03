import { createStore } from 'vuex'
import axios from 'axios'

const PATH_SEP = "/"
const FOLDERS_PATH = "pages/"
const FOLDERS_ROOT_PATH = "/edit/" + FOLDERS_PATH
const IMAGES_ROOT_PATH = "/browse/"
const FILE_ROOT = "/edit/pages/"

function clean_file_folder(path, root) {
    if (path.startsWith(root)) {
        path = path.substring(root.length)
    }
    return path
}

// Create a new store instance.
const store = createStore({
    state() {
        return {
            error: null,
            folder_path: "",
            files: [],
            folders: [],
            file_path: null,
            file_content: null,
            previous_content: null,
            image_path: "",
            image_files: [],
            image_folders: [],
            image_url: null,
            img_path: "/static/images/",
            loading_images: false,
            loading_files: false
        }
    },
    mutations: {
        set_error(state, value) {
            state.error = value
        },
        set_files_folder(state, value) {
            state.folder_path = value.path
            state.files = value.files
            state.folders = value.folders
            console.log("files", value)
        },
        set_file(state, value) {
            state.file_path = value.path
            state.file_content = value.content
        },
        set_file_content(state, value) {
            state.file_content = value
        },
        set_previous_content(state, value) {
            state.file_path = value.path
            state.file_content = value.content
            state.previous_content = value.content
        },
        set_images(state, value) {
            state.image_path = value.path
            state.image_files = value.files
            state.image_folders = value.folders
            state.image_url = null
            console.log("images", value)
        },
        set_image_url(state, image) {
            state.image_url = `${state.img_path}${image}`
            console.log("image_url", state.image_url)
        },
        set_img_path(state, value) {
            state.img_path = value
        },
        loading_files(state, value) {
            state.loading_files = value
        },
        loading_images(state, value) {
            state.loading_images = value
        },
        reset_content(state) {
            state.file_path = "";
            state.file_content = "# hello";
            state.previous_content = "# hello";
        }
    },
    getters: {
        error(state) {
            return state.error
        },
        folder_path(state) {
            return state.folder_path
        },
        files(state) {
            return state.files
        },
        folders(state) {
            return state.folders
        },
        file_path(state) {
            return state.file_path
        },
        file_content(state) {
            return state.file_content
        },
        previous_content(state) {
            return state.previous_content
        },
        image_files(state) {
            return state.image_files
        },
        image_folders(state) {
            return state.image_folders
        },
        image_path(state) {
            return state.image_path
        },
        image_url(state) {
            return state.image_url
        },
        img_path(state) {
            return state.img_path
        },
        loading_files(state) {
            return state.loading_files
        },
        loading_folders(state) {
            return state.loading_folders
        }
    },
    actions: {
        load_files_folders({ commit }, value) {
            commit("loading_files", true)
            let path = `${FOLDERS_ROOT_PATH}${value}`
            return axios.get(path).then(response => {
                let folders = response.data.folders.map(item => {
                    item.path = clean_file_folder(item.path, FOLDERS_PATH)
                    return item
                })
                let files = response.data.files.map(item => {
                    item.path = clean_file_folder(item.path, FOLDERS_PATH)
                    return item
                })
                commit("set_files_folder", { path: value, files: files, folders: folders })
                commit("loading_files", false)
                return [files, folders]
            }).catch(error => {
                commit("set_error", error)
                commit("loading_files", false)
                return error
            })
        },
        load_file({ commit }, path) {
            let key = FILE_ROOT + path;
            console.log("file: ", key)
            return axios.get(key).then(response => {
                commit("set_previous_content", { path: path, content: response.data })
                return response.data
            }).catch(error => {
                commit("set_error", error)
                return error
            })
        },
        save_file({ commit }, path, content) {
            let key = FILE_ROOT + path;
            return axios.put(key, content).then(response => {
                return path
            }).catch(error => {
                commit("set_error", error)
                return error
            })
        },
        remove_file({ commit }, path) {
            let key = FILE_ROOT + path;
            return axios.delete(key).then(response => {
                commit("reset_content")
                return response
            }).catch(error => {
                console.log(error)
                this.message = error
            })
        },
        load_image_files_folders({ state, commit }, value) {
            commit("loading_images", true)
            if (value == undefined || value == null) {
                value = ""
            }
            let path = `${IMAGES_ROOT_PATH}${value}`
            return axios.get(path).then(response => {
                let folders = response.data.folders.map(item => {
                    item.path = clean_file_folder(item.path, IMAGES_ROOT_PATH)
                    return item
                })
                let files = response.data.files.map(item => {
                    item.path = clean_file_folder(item.path, IMAGES_ROOT_PATH)
                    return item
                })
                commit("set_images", { path: value, files: files, folders: folders })
                commit("loading_images", false)
                return [files, folders]
            }).catch(error => {
                commit("set_error", error)
                commit("loading_images", false)
                console.log(error)
                return error
            })
        },
        load_img_path({ commit }) {
            return axios.put(IMAGES_ROOT_PATH).then(response => {
                let img_path = response.data["img_path"]
                commit("set_img_path", img_path)
                return img_path
            }).catch(error => {
                commit("set_error", error)
                return error
            })
        },
        upload_images({ state, commit, dispatch }, formData, path) {
            commit("loading_images", true)
            axios.post(`${IMAGES_ROOT_PATH}${path}`, formData, {
                headers: {
                    "Content-Type": "multipart/form-data",
                },
            }).then((response) => {
                commit("loading_images", false)
                dispatch("load_images", state.image_path)
            }).catch((error) => {
                console.error(error);
                commit("loading_images", false)
                commit("set_error", error)
            });
        }
    }
})

export default store