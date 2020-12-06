<template>
    <div class="editor" ref="jar"></div>
</template>

<script>
import { CodeJar } from "codejar";
import Prism from "prismjs";
import "/node_modules/prismjs/components/prism-markdown.js";
import "/node_modules/prismjs/components/prism-css.js";

export default {
    data: () => ({
        value: "",
        mode: "text/x-markdown",
    }),
    _editor: null,
    computed: {
        lang() {
            if (this.mode == "text/css") {
                return "css";
            } else if (this.mode == "text/x-markdown") {
                return "md";
            }
        },
    },
    methods: {
        setValue(value, mode) {
            this.value = value;
            this.mode = mode;
            if (this._editor) {
                this._editor.updateCode(this.value);
            }
        },
        getValue() {
            return this._editor.toString();
        },
    },
    mounted: function () {
        this._editor = CodeJar(this.$refs.jar, (elem) => {
            const code = elem.textContent;
            if (code && code.length > 0) {
                elem.innerHTML = Prism.highlight(
                    code,
                    Prism.languages[this.lang],
                    this.lang
                );
            } else {
                elem.innerHTML = "";
            }
        });
        this._editor.onUpdate((code) => {
            this.value = code;
            this.$emit("changes", code);
        });
    },
};
</script>

<style lang="css" scoped>
.editor {
    height: 100%;
    outline: none;
    resize: none;
    background-color: #eee;
    padding: 0.5em;
}
</style>