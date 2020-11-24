<template>
    <div class="s3browser">
        <breadcrumbs :folder="this.path" @changed="path=$event" />
        <div>
            <form enctype="multipart/form-data" @submit.prevent="uploadFiles">
                <input type="file" ref="file" multiple="multiple">
                <input type="submit" value="Upload Image" name="submit">
                <icon name="loader" :spin="loading" v-if="loading"/>
            </form>
        </div>
        <div v-if="error">{{! error }}</div>
        <folders-files :folders="folders" :files="files" @selected="folders_files_selected" />
        <div class="file" v-if="filepath">
            <button @click="copytoclipboard" class="float-right">
                <icon name="clipboard" />
            </button>
            <img :src="filepath" />
        </div>
    </div>
</template>

<script>
import axios from 'axios'

const PATH_SEP = "/"
const ROOT_PATH = "/"

export default {
    data() {
        return {
            path: "",
            folders: [],
            files: [],
            file: null,
            loading: false,
            error: null,
            img_path: "/static/images/"
        }
    },
    computed: {
        filepath() {
            if (this.file) {
                return `${this.img_path}${this.file}`
            }
        }
    },
    methods: {
        load_img_path(){
            axios.put(`${ROOT_PATH}browse/`).then(response => {
                this.img_path = response.data["img_path"]
            })
        },
        load() {
            this.file = null
            let path = `${ROOT_PATH}browse/${this.path}`
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
                console.log(response)
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
                this.path = value.folder
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
    margin: 1em;
    display: flex;
    flex-direction: column;
    height: 100%;
}
.s3browser>div{
    margin-bottom: 1em;
}
.float-right{
    float: right;
    margin-right: 1em;
}
.file{
    text-align: center;
}
.file img{
    max-width: 120px;
    border: 1px solid gray;
    border-radius: 4px;
    padding: 6px;
    margin: 4px;
}
</style>