<template>
    <div class="dirBrowser">
        <breadcrumbs :folder="folder" @changed="$emit('folder_change', $event)" />
        <folders-files :folders="folders" :files="files" @selected="folders_files_selected" />
    </div>
</template>

<script>
import axios from 'axios'

const PATH_SEP = "/"
const ROOT_PATH = "/edit/pages/"

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
                if(response.data.items["folders"])  {
                    this.folders = response.data.items.folders
                    this.files = response.data.items.files
                } else {
                    let items = response.data.items.map(item => {
                        item.path = `${stub}${item.name}`
                        return item
                    })
                    this.folders = items.filter(item => {
                        return !item.file
                    })
                    this.files = items.filter(item => {
                        return item.file
                    })
                }
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