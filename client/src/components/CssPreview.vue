<template>
  <div class="CssPreview">
    <iframe ref="frame" class="css_frame"></iframe>
  </div>
</template>

<script>
import axios from "axios";
import debounce from "./utils/debounce.js";

function sample_html(style) {
  return (
    "data:text/html;charset=utf-8," +
    escape(`
<html>
<style type="text/css">${style}</style>
<body>
<h1>Willkommen</h1>
<h2>bienvenue</h2>
<h3>welcome!</h3>
<p>This is a sample page to display your css.</p>
</body>
</html>
`)
  );
}

export default {
  computed: {
    file_content() {
      return this.$store.getters.file_content;
    },
  },
  methods: {
    update_css: debounce(function (value) {
      this.$refs.frame.src = sample_html(value);
    }),
  },
  watch: {
    file_content(value) {
      this.update_css(value);
    },
  },
  mounted() {
    this.update_css(this.content);
  },
};
</script>

<style lang="css">
.CssPreview {
  width: 100%;
  height: calc(100% - 4em);
  overflow-y: auto;
  background-color: white;
}
.css_frame {
  width: 100%;
  height: 100%;
}
</style>
