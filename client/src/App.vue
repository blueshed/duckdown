<template>
    <div class="App">
        <div class="soap" v-if="message">{{ message }}</div>
        <div class="container">
            <div class="directory">
                <DirBrowser :message="message" :file="file" :folder="folder" 
                    @folder_change="set_folder($event)"
                    @file_change="set_file($event)"/>
            </div>
            <div class="editing">
                <Editor
                    ref="editor"
                    :file.sync="file" 
                    @updated="set_message($event)" 
                    @changed="content=$event"/>
            </div>
            <div class="resource">
                <div class="menu">
                    <a href="https://www.markdownguide.org/cheat-sheet/" target="duckdown-help">
                        <button>Help</button>
                    </a>
                    <button @click="view">View</button>
                    <button @click="reset">Reset</button>
                    <button @click="images=true" :class="{active:images}">
                        Images
                    </button>
                    <button @click="images=false" :class="{active:!images}">
                        Preview
                    </button>
                </div>
                <S3Browser v-show="images"/>
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
          message: null,
          images: false
      }
  },
  methods:{
        set_message(value) {
            this.message = value
            setTimeout(() => {
                this.message = null
            }, 2000)
        },
        reset(){
            this.$refs.editor.reset()
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
}
.editing{
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
}
.soap{
    position: absolute;
    top: 20px;
    left: 20%;
    right: 20%;
    border: 1px solid gray;
    border-radius: 6px;
    padding: 2em;
    font-weight: bold;
    background-color: white;
}
.menu{
    margin: 1em;
    min-height: 21px;
}
.menu > button, .menu > a {
    float: right;
    margin-left: 2px;
}
.menu button {
    font-size: 14px;
    background-color: white;
    color: black;
    border-radius: 3px;
    border: 1px solid darkgray;
    margin-left: 4px;
    padding: 2px 6px 3px 6px;
}

.menu button.active {
    background-color: #3979F7;
    border-color: #3979F7;
    color: white;
}

.menu button:disabled {
    background-color: lightgray;
    border-color: darkgray;
    color: darkgray;
}

.menu button:hover {
    background-color: #93B3F2;
    border-color: #93B3F2;
    color: white;
}

.menu button.active:hover {
    background-color: #3979F7;
    border-color: #3979F7;
    color: white;
}
</style>