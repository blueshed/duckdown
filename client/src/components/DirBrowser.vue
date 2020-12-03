<template>
  <div class="dirBrowser">
    <breadcrumbs
      :folder="folder_path"
      @selected="breadcrumb_selected($event)"
    />
    <folders-files
      :folders="folders"
      :files="files"
      @selected="folder_files_selected($event)"
    />
  </div>
</template>

<script>
import { mapState } from "vuex";

export default {
  computed: mapState({
    files: (state) => state.files,
    folders: (state) => state.folders,
    folder_path: (state) => state.folder_path,
  }),
  methods: {
    breadcrumb_selected(event) {
      this.$store.dispatch("load_files_folders", event);
    },
    folder_files_selected(event) {
      if (event.file) {
        this.$store.dispatch("load_file", event.file);
      } else {
        this.$store.dispatch("load_files_folders", event.folder);
      }
    },
  },
};
</script>

<style lang="css" scoped>
.dirBrowser {
  margin: 0 1em;
  display: flex;
  flex-direction: column;
  height: 100%;
}
</style>
