<template>
    <div class="App">
        <snacks ref="snacks" />
        <sidebar :show="sidebar" @dismiss="sidebar = false">
            <S3Browser
                v-show="sidebar"
                @uploaded="s3browser_uploaded($event)"
            />
        </sidebar>
        <div class="container">
            <div class="directory">
                <DirBrowser ref="dirbrowser" />
            </div>
            <div class="editing">
                <Editor
                    ref="editor"
                    @confirm="show_modal($event.message, $event.func)"
                    @updated="editor_updated($event)"
                    @deleted="editor_deleted($event)"
                />
            </div>
            <div class="resource">
                <AppMenu
                    :sidebar="sidebar"
                    @toggle-sidebar="sidebar = !sidebar"
                    @view-page="view"
                >
                    <slot name="tool">
                        <a
                            id="logout"
                            href="/logout"
                            title="sign out of duckdown"
                        >
                            <button>
                                <icon
                                    name="log-out"
                                    width="14px"
                                    height="14px"
                                    v-if="$root.with_icons"
                                />
                                Sign Out
                            </button>
                        </a>
                    </slot>
                </AppMenu>
                <Preview v-if="mime == 'text/markdown'" />
                <CssPreview v-else />
            </div>
        </div>
    </div>
</template>

<script>
import { mapGetters } from "vuex";
import DirBrowser from "./components/DirBrowser.vue";
import S3Browser from "./components/S3Browser.vue";
import Editor from "./components/Editor.vue";
import Preview from "./components/Preview.vue";
import CssPreview from "./components/CssPreview.vue";
import AppMenu from "./components/AppMenu.vue";

const PATH_SEP = "/";

function change_ext(path, ext, to_ext) {
    // change the extension on path from ext ro to_ext
    if (path.endsWith(ext)) {
        path = path.substring(0, path.length - ext.length) + to_ext;
    }
    return path;
}

export default {
    name: "App",
    components: {
        AppMenu,
        DirBrowser,
        S3Browser,
        Editor,
        Preview,
        CssPreview,
    },
    data() {
        return {
            folder: "",
            sidebar: false,
        };
    },
    computed: {
        ...mapGetters(["file_path", "folder_path", "with_icons"]),
        mime() {
            return this.file_path && this.file_path.endsWith(".css")
                ? "text/css"
                : "text/markdown";
        },
    },
    methods: {
        show_snack(value, type) {
            this.$refs.snacks.add_message(value, type);
        },
        view() {
            let location = PATH_SEP;
            if (this.file_path) {
                if (this.file_path.endsWith(".css")) {
                    location = this.folder + "/index.html";
                } else {
                    location = change_ext(this.file_path, ".md", ".html");
                }
            } else if (this.folder) {
                location = this.folder;
            }
            window.open(location, "duckdown-site");
        },
        editor_updated(event) {
            this.show_snack(event);
            this.$store.dispatch("load_files_folders", this.folder_path);
        },
        editor_deleted(event) {
            this.show_snack(event, "warn");
            this.$store.dispatch("load_files_folders", this.folder_path);
        },
        s3browser_uploaded(event) {
            this.show_snack(event);
        },
    },
    mounted() {
        let urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has("path")) {
            let path = urlParams.get("path");
            if (path.indexOf(PATH_SEP) != -1) {
                this.folder = path.substring(0, path.lastIndexOf(PATH_SEP));
            }
            this.$store.dispatch("load_file", change_ext(path, ".html", ".md"));
        } else {
            this.$store.commit("reset_content");
        }
    },
};
</script>

<style lang="css" scoped>
.App {
    width: 100%;
    height: 100%;
}
.container {
    display: flex;
    flex-direction: row;
    flex-wrap: nowrap;
    justify-content: space-between;
    height: 100%;
}
.directory {
    height: 100%;
    flex-grow: 1;
    flex-shrink: 1;
    flex-basis: 0;
    width: 0;
    padding: 0;
}
.editing {
    padding: 0;
    height: 100%;
    flex-grow: 2;
    flex-shrink: 2;
    flex-basis: 0;
    width: 0;
}
.resource {
    height: 100%;
    flex-grow: 2;
    flex-shrink: 2;
    flex-basis: 0;
    width: 0;
    padding: 0;
}
#box {
    float: left;
    top: 4px;
}
#logout {
    float: right;
}
</style>
