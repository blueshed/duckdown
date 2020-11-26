<template>
    <div class="App">
        <snacks ref="snacks" />
        <sidebar :show="sidebar" @dismiss="sidebar=false">
            <S3Browser v-show="sidebar"/>
        </sidebar>
        <div class="container">
            <div class="directory">
                <DirBrowser ref="dirbrowser" :file="file" :folder="folder" 
                    @folder_change="set_folder($event)"
                    @file_change="set_file($event)"/>
            </div>
            <div class="editing">
                <Editor
                    ref="editor"
                    :file.sync="file"
                    @confirm="show_modal($event.message, $event.func)"
                    @updated="show_snack($event);$refs.dirbrowser.list()"
                    @deleted="show_snack($event, 'warn');$refs.dirbrowser.list()" 
                    @changed="content=$event"/>
            </div>
            <div class="resource">
                <div class="menu">
                    <a href="https://www.markdownguide.org/cheat-sheet/" target="duckdown-help">
                        <button>Help</button>
                    </a>
                    <button @click="sidebar=!sidebar" :class="{active:sidebar}">
                        Images
                    </button>
                    <button @click="view">View</button>
                </div>
                <Preview :content="content" v-show="!images"/>
            </div>            
        </div>
    </div>
</template>

<script>
import DirBrowser from './components/DirBrowser.vue'
import S3Browser from './components/S3Browser.vue'
import Editor from './components/Editor.vue'
import Preview from "./components/Preview.vue"

const PATH_SEP = "/"

function change_ext(path, ext, to_ext){
    // change the extension on path from ext ro to_ext
    if(path.endsWith(ext)){
        path = path.substring(0, path.length-ext.length) + to_ext
    }
    return path
}

export default {
  name: 'App',
  components: {
    DirBrowser,
    S3Browser,
    Editor,
    Preview
  },
  data(){
      return {
          file: "",
          folder: "",
          content: null,
          sidebar: false
      }
  },
  methods:{
        show_snack(value, type) {
            this.$refs.snacks.add_message(value, type)
        },
        view(){
            let location = PATH_SEP
            if(this.file){
                location = change_ext(this.file, ".md", ".html")
            } else if(this.folder){
                location = this.folder
            }
            document.location = location
        },
        set_file(value){
            this.file = value
        },
        set_folder(value){
            this.folder = value
        }
    },
    created(){
        let urlParams = new URLSearchParams(window.location.search);
        if(urlParams.has("path")){
            let path = urlParams.get("path")
            if(path.indexOf(PATH_SEP) != -1){
                this.folder = path.substring(0, path.lastIndexOf(PATH_SEP))
            }
            this.file = change_ext(path, ".html", ".md")
        }
    }
}
</script>

<style lang="css" scoped>
.App{
    width: 100%;
    height: 100%;
}
.container{
    display: flex;
    flex-direction: row;
    flex-wrap: nowrap;
    justify-content: space-between;
    height: 100%;
}
.directory{
    height: 100%;
    flex-grow: 1;
    flex-shrink: 1;
    flex-basis: 0;
    width: 0;
    padding: 0 6px;
}
.editing{
    padding: 0 4px;
    height: 100%;
    flex-grow: 2;
    flex-shrink: 2;
    flex-basis: 0;
    width: 0;
}
.resource{
    height: 100%;
    flex-grow: 2;
    flex-shrink: 2;
    flex-basis: 0;
    width: 0;
    padding: 0 6px;
}
.menu > button, .menu > a {
    float: right;
}
</style>