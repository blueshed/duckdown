<template>
    <div class="sidebar" v-if="show">
        <button @click="$emit('dismiss')" class="close"><icon name="x" /></button>
        <div class="content">
            <slot></slot>
        </div>
    </div>
</template>

<script>
export default {
    props:["show"]
}
</script>

<style lang="css" scoped>
.sidebar{
    height:100%;
    width: 35%;
    background-color:#fff;
    background-color:rgb(100%,100%,100%,0.85);
    position:fixed!important;
    border-left: 1px solid gray;
    right: 0;
    z-index:1;
    overflow:auto;
    box-shadow: -5px 0px 10px 1px #ddd;
}
.content{
    margin-right: 0.5em;
    margin-left: 1em;
}
.close{
    position: absolute;
    top: 1em;
    right: 0.5em;
    margin-top: 2px;
    padding-bottom: 0;
}
</style>