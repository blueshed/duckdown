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
        <icon name="save" width="14px" height="14px" v-if="$root.with_icons" />
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
      <codeJar ref="editor" @changes="update"></codeJar>
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
import axios from "axios";
import codeJar from "./utils/code_jar.vue";
import debounce from "./utils/debounce.js";

const ROOT_PATH = "/edit/pages/";

export default {
  data() {
    return {
      path: "",
      content: "",
      show_modal: null,
    };
  },
  created() {
    this.path = this.file_path;
    this.content = this.previous_content;
  },
  components: {
    codeJar,
  },
  computed: {
    can_save() {
      return this.path && this.path.length != 0 && !this.path.endsWith("/");
    },
    dirty() {
      return this.content != this.$store.getters.previous_content;
    },
    mode() {
      if (this.file && this.file.endsWith(".css")) {
        return "text/css";
      }
      return "text/x-markdown";
    },
    file_path() {
      return this.$store.getters.file_path;
    },
    previous_content() {
      return this.$store.getters.previous_content;
    },
  },
  methods: {
    update: debounce(function (e) {
      this.$store.commit("set_file_content", e);
    }, 600),
    save() {
      this.message = "saving...";
      this.$store
        .dispatch("save_file", this.path, this.content)
        .then((path) => {
          this.$emit("updated", `Saved '${this.path}'.`);
        });
    },
    remove() {
      this.show_modal = {
        message: `Delete '${this.path}'?`,
        func: () => {
          this.$store.dispatch("remove_file", this.path).then((response) => {
            this.$emit("deleted", `Deleted ${this.path}.`);
          });
        },
      };
    },
    reset() {
      this.$store.commit("reset_content");
      this.update_editor();
    },
    update_editor() {
      if (this.$refs.editor) {
        this.$refs.editor.setValue(this.content, this.mode);
      }
    },
  },
  watch: {
    previous_content(value) {
      this.content = value;
      this.update_editor();
      console.log("set content:", value);
    },
    file_path(value) {
      this.path = value;
      console.log("set path:", value);
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
  padding: 2px 2px 3px 2px;
}
.dirty {
  background-color: mediumseagreen;
  color: white;
}
</style>
