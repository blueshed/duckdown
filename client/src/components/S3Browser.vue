<template>
    <div class="s3browser">
        <div>
            <ul class="breadcrumb">
                <li @click="back(0)">
                    <svg class="logo">
                        <use xlink:href="../assets/logo.svg#duck" /></svg>
                </li>
                <li v-for="(item, index) in path_items" :key="item" @click="back(index+1)">/{{ item }}</li>
            </ul>
        </div>
        <div>
            <form enctype="multipart/form-data" @submit.prevent="uploadFiles">
                <input type="file" ref="file" multiple="multiple">
                <input type="submit" value="Upload Image" name="submit">
                <span class="icn-spinner" v-if="loading">
                    <icon name="loader"/>
                </span>
            </form>
        </div>
        <div v-if="error">{{! error }}</div>
        <div>
            <ul>
                <li v-for="(item, index) in folders" :key="index"  @click="path=item.Prefix">
                    <icon name="folder"/>
                    {{ item.name }}
                </li>
                <li v-for="(item, index) in files" :key="index" @click="file=item.Key">
                    <icon name="image"/>
                    {{ item.name }}
                </li>
            </ul>
        </div>
        <div class="file" v-if="filepath">
            <button @click="copytoclipboard" class="float-right">
                <svg class="feather">
                    <use xlink:href="../assets/feather-sprite.svg#clipboard" />
                </svg>
            </button>
            <img :src="filepath" />
        </div>
    </div>
</template>

<script>
import axios from 'axios'

const root_path = "/"
const axios_config = {}

export default {
    data() {
        return {
            path: "",
            folders: [],
            files: [],
            file: null,
            loading: false,
            error: null,
            img_path: "//s3-eu-west-1.amazonaws.com/vashti.blueshed.info/images/"
        }
    },
    computed: {
        path_items() {
            if (this.path.length > 0) {
                return this.path.split("/")
            }
        },
        filepath() {
            if (this.file) {
                return `${this.img_path}${this.file}`
            }
        }
    },
    methods: {
        back(index) {
            if (index == 0) {
                this.path = ""
            } else {
                let items = this.path_items.slice(0, index);
                this.path = items.join('/') + '/';
            }
        },
        load_img_path(){
            axios.put(`${root_path}browse/`, axios_config).then(response => {
                this.img_path = response.data["img_path"]
            })
        },
        load() {
            this.file = null
            let path = `${root_path}browse/${this.path}`
            axios.get(path, axios_config).then(response => {
                let files = response.data.Contents ? response.data.Contents : []
                files.map(item => {
                    let elems = item.Key.split("/")
                    item.name = elems[elems.length - 1]
                })
                this.files = files
                let folders = response.data.CommonPrefixes ? response.data.CommonPrefixes : []
                folders.map(item => {
                    let elems = item.Prefix.split("/")
                    item.name = elems[elems.length - 2]
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
            axios.post(`${root_path}${this.path}`, formData, {
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
.icn-spinner {
    position: relative;
    top: 4px;
    left: 4px;
    width: 16px;
    height: 16px;
    animation: spin-animation 1s infinite linear;
    display: inline-block;
    stroke-width: 2;
}
@keyframes spin-animation {
    0% {
        transform: rotate(0deg);
    }

    100% {
        transform: rotate(359deg);
    }
}
</style>