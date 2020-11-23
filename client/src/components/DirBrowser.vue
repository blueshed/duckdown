<template>
    <div class="dirBrowser">
        <div>
            <ul class="breadcrumb">
                <li @click="back(0)">
                    <svg class="logo">
                        <use xlink:href="../assets/logo.svg#duck" /></svg>
                </li>
                <li v-for="(item, index) in path_items" :key="index" @click="back(index+1)">/{{ item }}</li>
            </ul>
        </div>
        <div>
            <ul>
                <li v-for="(item, index) in folders" :key="index" @click="path=item.path">
                    <icon name="folder"/>
                    {{ item.name }}
                </li>
                <li v-for="(item, index) in files" :key="index" @click="$emit('selected', item.path)">
                    <icon name="file"/>
                    {{ item.name }}
                </li>
            </ul>
        </div>
    </div>
</template>

<script>
import axios from 'axios'

const PATH_SEP = "/"
const root_path = "/edit/pages/"
const axios_config = {}

export default {
    props:["message"],
    data(){
        return {
            path: "",
            folders: null,
            files: null,
            file: null,
        }
    },
    computed: {
        path_items() {
            if (this.path && this.path.length > 0) {
                return this.path.split("/")
            }
        }
    },
    methods:{
        back(index) {
            if (index == 0) {
                this.path = ""
            } else {
                let items = this.path_items.slice(0, index);
                this.path = items.join('/') + '/';
            }
        },
        list() {
            let path = `${root_path}${this.path}`
            let stub = ""
            if (this.path && this.path.length > 0) {
                stub = this.path + "/"
            }
            axios.get(path, axios_config).then(response => {
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
            }).catch(error => {
                console.log(error)
            })
        },
    },
    watch: {
        path() {
            this.list()
        },
        message(value){
            if(value){
                this.list()
            }
        }
    },
    created() {
        this.list()
    }
}
</script>

<style lang="css" scoped>
.dirBrowser{
    margin: 1em;
    display: flex;
    flex-direction: column;
    height: 100%;
}
.dirBrowser>div{
    margin-bottom: 1em;
}
.feather {
  width: 16px;
  height: 16px;
  stroke: currentColor;
  stroke-width: 1;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
}
.logo {
    height: 20px;
    width: 20px;
    transform: scaleX(-1);
    vertical-align: bottom;
    margin-right: 0.25em;
    stroke: #ccc;
    stroke-width: 1;
    stroke-linecap: round;
    stroke-linejoin: round;
    fill: #3979F7;
}
.logo:hover {
    fill: #FF9300;
}
li{
    cursor: pointer;
}
li:hover{
    background-color: aliceblue;
}
.breadcrumb li{
    display: inline-block;
}
li>svg{
    position: relative;
    top: 2px;
}
</style>