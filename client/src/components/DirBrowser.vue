<template>
    <div class="dirBrowser">
        <breadcrumbs :folder="folder" @changed="$emit('folder_change', $event)" />
        <folders-files :folders="folders" :files="files" @selected="folders_files_selected" />
    </div>
</template>

<script>
import axios from 'axios'

const PATH_SEP = "/"
const FOLDER_PATH = "pages/"
const ROOT_PATH = "/edit/" + FOLDER_PATH

function clean_file_folder(path, root){
    if(path.startsWith(root)){
        path = path.substring(root.length)
    }
    return path
}

export default {
    props:["file", "folder"],
    data(){
        return {
            folders: null,
            files: null
        }
    },
    methods:{
        list() {
            let path = `${ROOT_PATH}${this.folder}`
            let stub = ""
            if (this.folder && this.folder.length > 0) {
                stub = this.folder + PATH_SEP
            }
            axios.get(path).then(response => {
                this.folders = response.data.folders.map(item =>{
                    item.path = clean_file_folder(item.path, FOLDER_PATH)
                    return item
                })
                this.files = response.data.files.map(item =>{
                    item.path = clean_file_folder(item.path, FOLDER_PATH)
                    return item
                })
            }).catch(error => {
                console.log(error)
            })
        },
        folders_files_selected(value){
            if(value.file){
                this.$emit('file_change', value.file)
            } else {
                this.$emit('folder_change', value.folder)
            }
        }
    },
    watch: {
        folder() {
            this.list()
        }
    },
    created() {
        this.list()
    }
}
</script>

<style lang="css" scoped>
.dirBrowser{
    margin: 0 1em;
    display: flex;
    flex-direction: column;
    height: 100%;
}
</style>