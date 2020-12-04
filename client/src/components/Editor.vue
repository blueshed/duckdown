<template>
    <div class="Editor">
        <form @submit.prevent="save()" class="menu">
            <div class="input">
                <input type="text" v-model="path" placeholder="file path" />
            </div>
            <button
                type="submit"
                v-bind:disabled="!can_save"
                :class="{ dirty: dirty }"
                title="save page"
            >
                <icon
                    name="save"
                    width="14px"
                    height="14px"
                    v-if="$root.with_icons"
                />
                Save
            </button>
            <button
                @click.prevent.stop="remove"
                v-bind:disabled="!can_save"
                title="remove page"
            >
                <icon
                    name="folder-minus"
                    width="14px"
                    height="14px"
                    v-if="$root.with_icons"
                />
                Remove
            </button>
            <button @click.prevent.stop="reset" title="new page">
                <icon
                    name="file-plus"
                    width="14px"
                    height="14px"
                    v-if="$root.with_icons"
                />
                New
            </button>
        </form>
        <div class="entry">
            <codeJar ref="editor" @changes="codejar_changed($event)"></codeJar>
        </div>
        <modal
            v-if="show_modal"
            :message="show_modal.message"
            :func="show_modal.func"
            @dismiss="show_modal = null"
        />
    </div>
</template>

<script>
import { mapGetters } from "vuex";
import codeJar from "./utils/code_jar.vue";
import debounce from "./utils/debounce.js";

const ROOT_PATH = "/edit/pages/";

export default {
    data() {
        return {
            path: "",
            show_modal: null,
        };
    },
    components: {
        codeJar,
    },
    computed: {
        ...mapGetters(["file_path", "file_content", "editor_content"]),
        can_save() {
            return (
                this.path && this.path.length != 0 && !this.path.endsWith("/")
            );
        },
        dirty() {
            return this.editor_content != this.$store.getters.file_content;
        },
        mode() {
            if (this.file && this.file.endsWith(".css")) {
                return "text/css";
            }
            return "text/x-markdown";
        },
    },
    methods: {
        update_codejar() {
            if (this.$refs.editor) {
                this.$refs.editor.setValue(this.file_content, this.mode);
            }
        },
        codejar_changed(value) {
            this.$store.commit("set_editor_content", value);
        },
        save() {
            let value = {
                path: this.path,
                content: this.editor_content,
            };
            this.$store.dispatch("save_file", value).then(() => {
                this.$emit("updated", `Saved '${value.path}'.`);
            });
        },
        remove() {
            this.show_modal = {
                message: `Delete '${this.path}'?`,
                func: () => {
                    this.$store
                        .dispatch("remove_file", this.path)
                        .then((response) => {
                            this.$emit("deleted", `Deleted ${this.path}.`);
                        });
                },
            };
        },
        reset() {
            this.$store.commit("reset_content");
        },
    },
    watch: {
        file_content(value) {
            this.$store.commit("set_editor_content", value);
            this.update_codejar();
            console.debug("set content:", value);
        },
        file_path(value) {
            this.path = value;
            console.debug("set path:", value);
        },
    },
};
</script>

<style lang="css" scoped>
.Editor {
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    height: 100%;
}
.menu {
    margin-bottom: 1em;
    display: flex;
    flex-direction: row;
    flex-wrap: nowrap;
    justify-content: space-between;
}
.entry {
    height: calc(100% - 56px);
}
.input {
    flex-grow: 1;
    margin-right: 1em;
}
.input input {
    width: 100%;
}
.dirty {
    background-color: mediumseagreen;
    color: white;
}
</style>
