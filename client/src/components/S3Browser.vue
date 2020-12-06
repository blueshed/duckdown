<template>
    <div class="s3browser">
        <breadcrumbs :folder="folder" @selected="breadcrumb_selected($event)" />
        <div class="upload">
            <form
                class="menu"
                enctype="multipart/form-data"
                @submit.prevent.stop="uploadFiles"
            >
                <input
                    type="file"
                    ref="file"
                    multiple="multiple"
                    v-on:change="update_can_upload()"
                />
                <div class="menu">
                    <icon name="loader" :spin="loading" v-if="loading" />
                    <button type="submit" id="submit" :disabled="!can_upload">
                        <icon
                            name="upload-cloud"
                            width="14px"
                            height="14px"
                            v-if="$root.with_icons"
                        />
                        Upload
                    </button>
                    <button type="reset">
                        <span v-if="$root.with_icons"
                            ><icon name="x-circle" width="14px" height="14px" />
                            Reset</span
                        >
                        <span v-else>Reset</span>
                    </button>
                    <button @click.prevent.stop="add_folder">
                        <span v-if="$root.with_icons"
                            ><icon
                                name="folder-plus"
                                width="14px"
                                height="14px"
                            />
                            Add</span
                        >
                        <span v-else>Add Folder</span>
                    </button>
                </div>
            </form>
        </div>
        <div class="files">
            <folders-files
                :folders="image_folders"
                :files="image_files"
                @selected="folders_files_selected($event)"
            />
        </div>
        <div class="file" v-if="image_url">
            <button @click="copytoclipboard" class="copytoclipboard">
                <icon name="clipboard" />
            </button>
            <img :src="image_url" />
        </div>
    </div>
</template>

<script>
import { mapGetters } from "vuex";

function clean_path(folder) {
    if (folder == null || folder == undefined) {
        folder = "";
    } else {
        if (!folder.endsWith("/")) {
            folder = folder + "/";
        }
        if (folder.startsWith("/")) {
            folder = folder.substring(1, folder.length);
        }
    }
    return folder;
}
export default {
    data() {
        return {
            local_path: null,
            can_upload: false,
        };
    },
    computed: {
        ...mapGetters([
            "image_path",
            "image_files",
            "image_folders",
            "image_url",
            "img_path",
        ]),
        folder() {
            let folder = clean_path(this.local_path);
            return folder;
        },
        loading() {
            return this.$store.getters.loading_images;
        },
    },
    methods: {
        update_can_upload() {
            this.can_upload =
                this.$refs.file &&
                this.$refs.file.files &&
                this.$refs.file.files.length != 0;
        },
        copytoclipboard() {
            const el = document.createElement("textarea");
            el.value = `![Alt text](/static/images/${this.file} "Optional title")`;
            el.setAttribute("readonly", "");
            el.style.position = "absolute";
            el.style.left = "-9999px";
            document.body.appendChild(el);
            el.select();
            document.execCommand("copy");
            document.body.removeChild(el);
        },
        uploadFiles() {
            let formData = new FormData();
            let count = this.$refs.file.files.length;
            for (var i = 0; i < count; i++) {
                let file = this.$refs.file.files[i];
                formData.append("files[" + i + "]", file);
            }
            this.$store
                .dispatch("upload_images", {
                    path: this.folder,
                    formData: formData,
                })
                .then(() => {
                    this.$emit("uploaded", `Uploaded ${count} file(s).`);
                });
            return false;
        },
        folders_files_selected(value) {
            if (value.file) {
                this.$store.commit("set_image_url", value.file);
            } else {
                this.$store.dispatch("load_image_files_folders", value.folder);
            }
        },
        breadcrumb_selected(value) {
            let folder = clean_path(value);
            this.$store.dispatch("load_image_files_folders", folder);
        },
        add_folder() {
            let new_path = prompt("New folder path", "/foo/bar");
            if (new_path) {
                this.local_path = clean_path(new_path);
            }
        },
    },
    watch: {
        image_path(value) {
            this.local_path = value;
        },
    },
};
</script>

<style lang="css" scoped>
.s3browser {
    height: 100%;
    display: flex;
    margin-left: 1em;
    margin-right: 6px;
    flex-direction: column;
}
.copytoclipboard {
    float: right;
}
.upload,
.file {
    margin-bottom: 1em;
}
.file {
    margin-top: 1em;
    text-align: center;
}
.file img {
    max-width: 120px;
    border: 1px solid gray;
    border-radius: 4px;
    padding: 6px;
    margin: 4px;
}
.menu > button,
.menu > a {
    float: right;
}
.files {
    margin: 4px 0;
    max-height: 50%;
    background-color: rgb(100%, 100%, 100%, 0.88);
}
.breadcrumb {
    background-color: white;
}
</style>
