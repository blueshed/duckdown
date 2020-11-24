<template>
    <div class="editor">
        <div class="menu">
            <form @submit.prevent="save()">
                <input type="text" v-model="file" />
                <button @click="save()" v-bind:disabled="!can_save">Save</button>
                <button @click="remove()" v-bind:disabled="!can_save">Remove</button>
            </form>
        </div>
        <div class="entry">
            <textarea :value="content" @input="update"></textarea>
        </div>
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
            content: ""
        }
    },
    computed: {
        can_save() {
            return this.file && this.file.length != 0
        },
    },
    methods:{
        update: debounce(function(e) {
            this.content = e.target.value;
        }, 600),
        async load() {
            if(this.file){
                let response = await axios.get(ROOT_PATH + this.file)
                this.content = response.data
            } else {
                this.reset()
            }
        },
        save() {
            this.message = "saving..."
            let path = ROOT_PATH + this.file;
            let content = this.content;
            axios.put(path, content).then(response => {
                console.log(response)
                this.$emit("updated", "saved.")
            }).catch(error => {
                console.log(error)
                this.message = error
            })
        },
        remove() {
            let path = ROOT_PATH + this.file;
            axios.delete(path).then(response => {
                console.log(response)
                this.$emit("updated", "removed.")
            }).catch(error => {
                console.log(error)
                this.message = error
            })
        },
        reset(){
            this.content = "# hello"
        }
    },
    created() {
        setTimeout(()=>{
            this.load()
        }, 500)
    },
    watch:{
        file(value){
            this.load();
        },
        content(value){
            this.$emit("changed", value)
        }
    }
}
</script>

<style lang="css" scoped>
.editor{
    margin-top: 1em;
    margin-bottom: 1em;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    height: calc(100% - 21px);
}
.editor>div{
    margin-bottom: 1em;
}
.entry{
    height: calc(100% - 4em);
}
textarea {
    width: 100%;
    height: 100%;
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