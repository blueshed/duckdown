<template>
    <div class="sidebar" v-if="show">
        <span @click="$emit('dismiss')" class="close">
            <icon name="x-square" width="24px" height="24px" />
        </span>
        <div class="content">
            <slot></slot>
        </div>
    </div>
</template>

<script>
export default {
    props: ["show"],
};
</script>

<style lang="css" scoped>
.sidebar {
    height: 100%;
    width: 35%;
    background-color: #fff;
    background-color: rgb(100%, 100%, 100%, 0.85);
    position: fixed !important;
    border-left: 1px solid gray;
    right: 0;
    z-index: 1;
    overflow: auto;
    box-shadow: -5px 0px 10px 1px #ddd;
}
.content {
    margin: 0;
    padding: 0;
    height: 100%;
}
.close {
    position: absolute;
    top: 10px;
    right: 10px;
}
.close:hover {
    stroke-width: 2px;
}
</style>