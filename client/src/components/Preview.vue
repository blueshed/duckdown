<template>
    <div class="Preview">
        <div class="_preview_" v-html="mdown"></div>
    </div>
</template>

<script>
import { mapGetters } from "vuex";
import axios from "axios";
import debounce from "./utils/debounce.js";

const ROOT_PATH = "/edit/mark/";

export default {
    data() {
        return {
            mdown: "",
        };
    },
    computed: {
        ...mapGetters(["editor_content"]),
    },
    methods: {
        async compiledMarkdown() {
            let response = await axios.put(ROOT_PATH, this.editor_content);
            this.mdown = response.data.content;
        },
        update_md: debounce(function () {
            this.compiledMarkdown();
        }),
    },
    watch: {
        editor_content(value) {
            this.update_md();
        },
    },
    created() {
        this.update_md();
    },
};
</script>

<style lang="css">
.Preview {
    width: 100%;
    height: calc(100% - 4em);
    overflow-y: scroll;
    background-color: white;
}
._preview_ {
    margin: 0 1em;
}
._preview_ h1 {
    font-size: 1.5em;
    font-weight: bold;
    margin-bottom: 0.75em;
}
._preview_ h2 {
    font-size: 1.25em;
    font-weight: bold;
    margin-bottom: 0.5em;
}
._preview_ h3 {
    font-size: 1.125em;
    font-weight: bold;
    margin-bottom: 0.25em;
}
._preview_ img {
    max-width: 120px;
}
._preview_ ul ul,
._preview_ ul ol,
._preview_ ol ol,
._preview_ ol ul,
._preview_ dd {
    margin-left: 1em;
}
._preview_ p,
._preview_ pre,
._preview_ dl {
    margin-bottom: 0.75em;
}
._preview_ code {
    color: #f66;
}
._preview_ table {
    border-collapse: collapse;
    border: 1px solid lightgray;
    width: 100%;
    margin: 0.5em 0;
}
._preview_ th,
._preview_ td {
    border: 1px solid lightgray;
    padding: 2px;
}
._preview_ th {
    text-align: center;
    font-weight: bolder;
}
._preview_ .twemoji {
    width: 1em;
    height: 1em;
}

._preview_ sub,
._preview_ sup {
    /* Specified in % so that the sup/sup is the
     right size relative to the surrounding text */
    font-size: 75%;

    /* Zero out the line-height so that it doesn't
     interfere with the positioning that follows */
    line-height: 0;

    /* Where the magic happens: makes all browsers position
     the sup/sup properly, relative to the surrounding text */
    position: relative;

    /* Note that if you're using Eric Meyer's reset.css, this
     is already set and you can remove this rule */
    vertical-align: baseline;
}

._preview_ sup {
    /* Move the superscripted text up */
    top: -0.5em;
}

._preview_ sub {
    /* Move the subscripted text down, but only
     half as far down as the superscript moved up */
    bottom: -0.25em;
}
</style>
