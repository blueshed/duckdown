<template>
    <div class="folders_files">
        <ul>
            <li
                v-for="(item, index) in _folders"
                :key="index"
                @click="$emit('selected', { folder: item.path })"
            >
                <icon name="folder" />
                {{ item.name }}
            </li>
            <li
                v-for="(item, index) in _files"
                :key="index"
                @click="$emit('selected', { file: item.path })"
            >
                <icon name="file" />
                {{ item.name }}
            </li>
        </ul>
    </div>
</template>

<script>
export default {
    props: ["files", "folders"],
    computed: {
        _files() {
            if (this.files) {
                return this.files.sort((a, b) => {
                    return a.name.localeCompare(b.name);
                });
            }
        },
        _folders() {
            if (this.folders) {
                return this.folders.sort((a, b) => {
                    return a.name.localeCompare(b.name);
                });
            }
        },
    },
};
</script>

<style lang="css" scoped>
.folders_files {
    height: 100%;
    overflow-y: scroll;
    overflow-x: hidden;
}
li {
    cursor: pointer;
    white-space: nowrap;
}
li:hover {
    background-color: var(--menu-hover);
}
li .icn {
    position: relative;
    top: 2px;
}
</style>