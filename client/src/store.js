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
export default {
    state() {
        return {
            error: null,
            folder_path: "",
            files: [],
            folders: [],
            file_path: null,
            file_content: null,
            editor_content: null,
            image_path: "",
            image_files: [],
            image_folders: [],
            image_url: null,
            img_path: "/static/images/",
            loading_images: false,
            loading_files: false,
            with_icons: true
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
            console.debug("files", value)
        },
        set_file(state, value) {
            state.file_path = value.path
            state.file_content = value.content
        },
        set_file_content(state, value) {
            state.file_path = value.path
            state.file_content = value.content
        },
        set_editor_content(state, value) {
            state.editor_content = value
        },
        set_images(state, value) {
            state.image_path = value.path
            state.image_files = value.files
            state.image_folders = value.folders
            state.image_url = null
            console.debug("images", value)
        },
        set_image_url(state, image) {
            state.image_url = `${state.img_path}${image}`
            console.debug("image_url", state.image_url)
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
        },
        with_icons(state, value) {
            state.with_icons = value;
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
        editor_content(state) {
            return state.editor_content
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
        },
        with_icons(state) {
            return state.with_icons
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
                return response
            }).catch(error => {
                commit("set_error", error)
                commit("loading_files", false)
                return error
            })
        },
        load_file({ commit }, path) {
            let key = FILE_ROOT + path;
            console.debug("file: ", key)
            return axios.get(key).then(response => {
                commit("set_file_content", { path: path, content: response.data })
                return response
            }).catch(error => {
                commit("set_error", error)
                return error
            })
        },
        save_file({ commit }, value) {
            let key = FILE_ROOT + value.path;
            console.debug("save_file", value)
            return axios.put(key, value.content).then(response => {
                commit("set_file_content", value)
                return response
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
                console.debug(error)
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
                console.debug(error)
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
        upload_images({ state, commit, dispatch }, value) {
            commit("loading_images", true)
            let key = `${IMAGES_ROOT_PATH}${value.path}`
            axios.post(key, value.formData, {
                headers: {
                    "Content-Type": "multipart/form-data",
                },
            }).then((response) => {
                commit("loading_images", false)
                dispatch("load_image_files_folders", value.path)
            }).catch((error) => {
                console.error(error);
                commit("loading_images", false)
                commit("set_error", error)
            });
        }
    }
}