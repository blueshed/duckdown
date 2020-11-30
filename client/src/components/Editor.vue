<template>
    <div class="Editor">
        <form @submit.prevent="save()" class="menu">
            <div class="input">
                <input type="text" v-model="path" placeholder="file path"/>
            </div>
            <button type="submit" v-bind:disabled="!can_save" :class="{dirty: dirty}" title="save page">
                <icon name="save"  width="14px" height="14px" v-if="$root.with_icons" /> Save
            </button>
            <button @click.prevent.stop="remove" v-bind:disabled="!can_save" title="remove page">
                <icon name="folder-minus"  width="14px" height="14px" v-if="$root.with_icons"/> Remove
            </button>
            <button @click.prevent.stop="reset" title="new page">
                <icon name="file-plus"  width="14px" height="14px" v-if="$root.with_icons"/> New
            </button>
        </form>
        <div class="entry">
            <codeJar ref="editor" @changes="content=$event"></codeJar>
        </div>
        <modal v-if="show_modal" 
            :message="show_modal.message" 
            :func="show_modal.func" 
            @dismiss="show_modal=null" />
    </div>
</template>

<script>
import axios from "axios"
import codeJar from "./utils/code_jar.vue"
import debounce from "./utils/debounce.js"

const ROOT_PATH = "/edit/pages/"

export default {
    props:["file"],
    
    data(){
        return {
            message: "",
            content: "",
            previous: "",
            path: "",
            show_modal: null
        }
    },
    components:{
        codeJar
    },
    computed: {
        can_save() {
            return this.path && this.path.length != 0 && !this.path.endsWith("/")
        },
        dirty(){
            return this.content != this.previous
        },
        mode(){
            if(this.file && this.file.endsWith(".css")){
                return "text/css"
            }
            return "text/x-markdown"
        }
    },
    methods:{
        update: debounce(function(e) {
            this.$emit("changed", e)
        }, 600),
        async load(path) {
            this.path = path
            this.$emit("changed", "")
            if(this.path){
                let response = await axios.get(ROOT_PATH + this.path)
                this.content = response.data
                this.previous = this.content
                this.update_editor()
            }
        },
        save() {
            this.message = "saving..."
            let path = ROOT_PATH + this.path;
            let content = this.content;
            axios.put(path, content).then(response => {
                this.$emit("updated", `Saved '${this.path}'.`)
            }).catch(error => {
                console.log(error)
                this.message = error
            })
        },
        remove() {
            let path = ROOT_PATH + this.path;
            this.show_modal = { 
                message: `Delete '${this.path}'?`, 
                func: () => {
                    this.do_remove(path)
                }
            }
        },
        do_remove(path){
            axios.delete(path).then(response => {
                this.$emit("deleted", `Deleted ${this.path}.`)
                this.reset()
            }).catch(error => {
                console.log(error)
                this.message = error
            })
        },
        reset(){
            this.path = ""
            this.content = "# hello"
            this.previous = this.content
            this.update_editor();
        },
        update_editor(){
            if(this.$refs.editor){
                this.$refs.editor.setValue(this.content, this.mode)
            }
        }
    },
    watch:{
        file(value){
            this.load(value)
        },
        content(value){
            this.update(value)
        }
    }
}
</script>

<style lang="css" scoped>
.Editor{
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    height: 100%;
}
.menu{
    margin-bottom: 1em;
    display: flex;
    flex-direction: row;
    flex-wrap: nowrap;
    justify-content: space-between;
}
.entry{
    height: calc(100% - 56px);
}
.input{
    flex-grow: 1;
    margin-right: 1em;
}
.input input{
    width: 100%;
    padding: 2px 2px 3px 2px;
}
.dirty{
    background-color: mediumseagreen;
    color: white;
}
</style>