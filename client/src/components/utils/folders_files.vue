<template>
    <div class="folders_files">
        <ul>
            <li v-for="(item, index) in folders" :key="index" @click="$emit('selected', {folder: item.path})">
                <icon name="folder"/>
                {{ item.name }}
            </li>
            <li v-for="(item, index) in files" :key="index" @click="$emit('selected', {file: item.path})">
                <icon name="file"/>
                {{ item.name }}
            </li>
        </ul>
    </div>
</template>

<script>
export default {
    props:["files", "folders"],
}
</script>

<style lang="css" scoped>
li{
    cursor: pointer;
}
li:hover{
    background-color: aliceblue;
}
li>svg{
    position: relative;
    top: 2px;
}
</style>