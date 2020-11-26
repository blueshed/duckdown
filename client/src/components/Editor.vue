<template>
    <div class="Editor">
        <div class="menu">
            <form @submit.prevent="save()">
                <input type="text" v-model="path" />
                <button type="submit" v-bind:disabled="!can_save">Save</button>
                <button @click.prevent.stop="remove()" v-bind:disabled="!can_save">Remove</button>
                <button @click.prevent.stop="reset()">New</button>
            </form>
        </div>
        <div class="entry">
            <textarea v-model="content"></textarea>
        </div>
        <modal v-if="show_modal" 
            :message="show_modal.message" 
            :func="show_modal.func" 
            @dismiss="show_modal=null" />
    </div>
</template>

<script>
import axios from 'axios'

const ROOT_PATH = "/edit/pages/"

function debounce(func, wait, immediate) {
	var timeout;
	return function() {
		var context = this, args = arguments;
		var later = function() {
			timeout = null;
			if (!immediate) func.apply(context, args);
		};
		var callNow = immediate && !timeout;
		clearTimeout(timeout);
		timeout = setTimeout(later, wait);
		if (callNow) func.apply(context, args);
	};
};

export default {
    props:["file"],
    data(){
        return {
            message: "",
            content: "",
            path: "",
            show_modal: null
        }
    },
    computed: {
        can_save() {
            return this.path && this.path.length != 0 && !this.path.endsWith("/")
        },
    },
    methods:{
        update: debounce(function(e) {
            this.$emit("changed", e)
        }, 600),
        async load(path) {
            this.path = path
            if(this.path){
                let response = await axios.get(ROOT_PATH + this.path)
                this.content = response.data
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
            console.log("reset")
        },
    },
    created() {
        setTimeout(()=>{
            this.reset()
        }, 200)
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
    height: calc(100% - 1em);
}
.editor>div{
    margin-bottom: 1em;
}
.entry{
    height: 100%;
}
textarea {
    padding: 4px;
    width: calc(100% - 8px);
    height: calc(100% - 8px);
    vertical-align: top;
    border: none;
    resize: none;
    outline: none;
    background-color: #f6f6f6;
    font-size: 14px;
    font-family: "Monaco", courier, monospace;
    overflow-y: scroll;
}
form > button{
    float: right;
    margin-left: 2px;
}
</style>