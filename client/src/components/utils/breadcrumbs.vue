<template>
    <div class="breadcrumb menu">
        <ul>
            <li @click="back(0)">
                <svg class="logo">
                    <use xlink:href="../../assets/logo.svg#duck" /></svg>
            </li>
            <li v-for="(item, index) in path_items" :key="index" @click="back(index+1)">/{{ item }}</li>
        </ul>
    </div>
</template>

<script>
const PATH_SEP = "/"

export default {
    props:["folder"],
    computed: {
        path_items() {
            if (this.folder && this.folder.length > 0) {
                let folder = this.folder
                if(folder.endsWith(PATH_SEP)){
                    folder = folder.substring(0, folder.length-1)
                }
                return folder.split(PATH_SEP)
            }
        }
    },
    methods:{
        back(index) {
            if (index == 0) {
                this.$emit('changed', "")
            } else {
                let items = this.path_items.slice(0, index);
                let path = items.join('/')
                this.$emit('changed', path)
            }
        }
    }
}
</script>

<style lang="css" scoped>
.logo {
    height: 20px;
    width: 20px;
    transform: scaleX(-1);
    vertical-align: bottom;
    margin-right: 0.25em;
    stroke: currentColor;
    stroke-width: 1;
    stroke-linecap: round;
    stroke-linejoin: round;
    fill:var(--primary-color);
}
.logo:hover {
    fill:var(--contrast-color);
}
li{
    cursor: pointer;
    display: inline-block;
}
</style>