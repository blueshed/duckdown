<template>
  <div class="s3browser">
    <breadcrumbs :folder="path" @selected="breadcrumb_selected($event)" />
    <div class="upload menu">
      <form enctype="multipart/form-data" @submit.prevent.stop="uploadFiles">
        <input type="file" ref="file" multiple="multiple" />
        <icon name="loader" :spin="loading" v-if="loading" />
        <button type="submit" id="submit" :disabled="disable_upload">
          <icon
            name="upload-cloud"
            width="14px"
            height="14px"
            v-if="$root.with_icons"
          />
          Upload
        </button>
        <button @click.prevent.stop="add_folder">
          <span v-if="$root.with_icons"
            ><icon name="folder-plus" width="14px" height="14px" /> Add</span
          >
          <span v-else>Add Folder</span>
        </button>
      </form>
    </div>
    <div class="files">
      <folders-files
        :folders="folders"
        :files="files"
        @selected="folders_files_selected($event)"
      />
    </div>
    <div class="file" v-if="image_url">
      <button @click="copytoclipboard" class="copytoclipboard">
        <icon name="clipboard" />
      </button>
      <img :src="image_url" />
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      local_path: null,
    };
  },
  computed: {
    disable_upload() {
      return (
        this.$refs.file &&
        this.$refs.file.files &&
        this.$refs.file.files.length == 0
      );
    },
    path() {
      return this.local_path != null ? this.local_path : this.image_path;
    },
    image_path() {
      return this.$store.getters.image_path;
    },
    files() {
      return this.$store.getters.image_files;
    },
    folders() {
      return this.$store.getters.image_folders;
    },
    image_url() {
      return this.$store.getters.image_url;
    },
    img_path() {
      return this.$store.getters.img_path;
    },
    loading() {
      return this.$store.getters.loading_images;
    },
  },
  methods: {
    copytoclipboard() {
      const el = document.createElement("textarea");
      el.value = `![Alt text](/static/images/${this.file} "Optional title")`;
      el.setAttribute("readonly", "");
      el.style.position = "absolute";
      el.style.left = "-9999px";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    },
    uploadFiles() {
      let formData = new FormData();
      for (var i = 0; i < this.$refs.file.files.length; i++) {
        let file = this.$refs.file.files[i];
        formData.append("files[" + i + "]", file);
      }
      this.$store.dispatch("upload_images", formData, this.path);
      return false;
    },
    folders_files_selected(value) {
      if (value.file) {
        this.$store.commit("set_image_url", value.file);
      } else {
        this.$store.dispatch("load_image_files_folders", value.folder);
      }
    },
    breadcrumb_selected(value) {
      let folder = value;
      if (!folder.endsWith("/")) {
        folder = folder + "/";
      }
      if (folder.startsWith("/")) {
        folder = folder.substring(1, folder.length);
      }
      this.$store.dispatch("load_image_files_folders", folder);
    },
    add_folder() {
      let folder = prompt("New folder path", "/foo/bar");
      if (folder) {
        this.local_path = folder;
      }
    },
  },
  watch: {
    image_path() {
      this.local_path = null;
    },
  },
};
</script>

<style lang="css" scoped>
.s3browser {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.copytoclipboard {
  float: right;
}
.upload,
.file {
  margin-bottom: 1em;
}
.file {
  margin-top: 1em;
  text-align: center;
}
.file img {
  max-width: 120px;
  border: 1px solid gray;
  border-radius: 4px;
  padding: 6px;
  margin: 4px;
}
.menu > button,
.menu > a {
  float: right;
}
.files {
  max-height: 50%;
}
</style>
