<template>
    <div class="s3browser">
        <breadcrumbs :folder="path" @changed="set_path($event)" />
        <div class="upload menu">
            <form enctype="multipart/form-data" @submit.prevent.stop="uploadFiles">
                <input type="file" ref="file" multiple="multiple">
                <icon name="loader" :spin="loading" v-if="loading"/>
                <button type="submit" id="submit" :disabled="disable_upload">
                    <icon name="upload-cloud" width="14px" height="14px" v-if="$root.with_icons"/> Upload
                </button>
                <button @click.prevent.stop="add_folder">
                    <span v-if="$root.with_icons"><icon name="folder-plus"  width="14px" height="14px"/> Add</span>
                    <span v-else>Add Folder</span>
                </button>
            </form>
        </div>
        <div class="files">
            <folders-files :folders="folders" :files="files" @selected="folders_files_selected" />
        </div>
        <div class="file" v-if="filepath">
            <button @click="copytoclipboard" class="copytoclipboard">
                <icon name="clipboard" />
            </button>
            <img :src="filepath" />
        </div>
    </div>
</template>

<script>
import axios from 'axios'

const PATH_SEP = "/"
const ROOT_PATH = "/browse/"

export default {
    data() {
        return {
            path: "",
            folders: [],
            files: [],
            file: null,
            loading: false,
            error: null,
            ignore_path_change: false,
            img_path: "/static/images/"
        }
    },
    computed: {
        filepath() {
            if (this.file) {
                return `${this.img_path}${this.file}`
            }
        },
        disable_upload(){
            return this.$refs.file && this.$refs.file.files && this.$refs.file.files.length == 0
        }
    },
    methods: {
        load_img_path(){
            axios.put(`${ROOT_PATH}`).then(response => {
                this.img_path = response.data["img_path"]
            })
        },
        load() {
            if(this.ignore_path_change === true){
                return
            }
            this.file = null
            let path = `${ROOT_PATH}${this.path}`
            axios.get(path).then(response => {
                let files = response.data.Contents ? response.data.Contents : []
                files.map(item => {
                    let elems = item.Key.split(PATH_SEP)
                    item.name = elems[elems.length - 1]
                    item.path = item.Key
                })
                this.files = files
                let folders = response.data.CommonPrefixes ? response.data.CommonPrefixes : []
                folders.map(item => {
                    let elems = item.Prefix.split(PATH_SEP)
                    item.name = elems[elems.length - 2]
                    item.path = item.Prefix
                })
                this.folders = folders
            }).catch(error => {
                console.log(error)
            })
        },
        copytoclipboard() {
            const el = document.createElement('textarea');
            el.value = `![Alt text](/static/images/${this.file} "Optional title")`;
            el.setAttribute('readonly', '');
            el.style.position = 'absolute';
            el.style.left = '-9999px';
            document.body.appendChild(el);
            el.select();
            document.execCommand('copy');
            document.body.removeChild(el);
        },
        uploadFiles() {
            this.loading = true
            this.error = null
            let formData = new FormData()
            for (var i = 0; i < this.$refs.file.files.length; i++) {
                let file = this.$refs.file.files[i];
                formData.append('files[' + i + ']', file);
            }
            axios.post(`${ROOT_PATH}${this.path}`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            }).then(response => {
                this.load()
                this.loading = false
            }).catch(error => {
                console.error(error)
                this.error = error
                this.loading = false
            })
            return false;
        },
        folders_files_selected(value){
            if(value.file){
                this.file = value.file
            } else {
                let folder = value.folder
                this.path = folder
            }
        },
        set_path(value){
            let folder = value
            if(!folder.endsWith("/")){
                folder = folder + "/"
            }
            if(folder.startsWith("/")){
                folder = folder.substring(1, folder.length)
            }
            this.path=folder
        },
        add_folder(){
            let folder = prompt("New folder path", "/foo/bar")
            if(folder){
                this.ignore_path_change = true
                this.set_path(folder)
                this.ignore_path_change = true
            }
        }
    },
    watch: {
        path() {
            this.load()
        }
    },
    created() {
        this.load_img_path()
        this.load()
    }
}
</script>

<style lang="css" scoped>
.s3browser{
    height: 100%;
    display: flex;
    flex-direction: column;
}
.copytoclipboard{
    float: right;
}
.upload, .file{
    margin-bottom: 1em;
}
.file{
    margin-top: 1em;
    text-align: center;
}
.file img{
    max-width: 120px;
    border: 1px solid gray;
    border-radius: 4px;
    padding: 6px;
    margin: 4px;
}
.menu > button, .menu > a {
    float: right;
}
.files{
    max-height: 50%;
}
</style>