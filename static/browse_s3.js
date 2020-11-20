export default {
    template: "#s3_browser",
    data() {
        return {
            path: "",
            folders: [],
            files: [],
            file: null
        }
    },
    computed: {
        path_items() {
            if (this.path.length > 0) {
                return this.path.split("/")
            }
        },
        filepath() {
            if (this.file) {
                return `https://s3-eu-west-1.amazonaws.com/vashti.blueshed.info/${this.file}`
            }
        }
    },
    methods: {
        back(index) {
            if (index == 0) {
                this.path = ""
            } else {
                let items = this.path_items.slice(0, index);
                this.path = items.join('/') + '/';
            }
        },
        load() {
            this.file = null
            let path = `/browse/${this.path}`
            axios.get(path).then(response => {
                let files = response.data.Contents ? response.data.Contents : []
                files.map(item => {
                    let elems = item.Key.split("/")
                    item.name = elems[elems.length - 1]
                })
                this.files = files
                let folders = response.data.CommonPrefixes ? response.data.CommonPrefixes : []
                folders.map(item => {
                    let elems = item.Prefix.split("/")
                    item.name = elems[elems.length - 2]
                })
                this.folders = folders
            }).catch(error => {
                console.log(error)
            })
        },
        copytoclipboard() {
            const el = document.createElement('textarea');
            el.value = `![Alt text](/static/${this.file} "Optional title")`;
            el.setAttribute('readonly', '');
            el.style.position = 'absolute';
            el.style.left = '-9999px';
            document.body.appendChild(el);
            el.select();
            document.execCommand('copy');
            document.body.removeChild(el);
        },
        uploadFiles() {
            let formData = new FormData()
            for (var i = 0; i < this.$refs.file.files.length; i++) {
                let file = this.$refs.file.files[i];
                formData.append('files[' + i + ']', file);
            }
            axios.post(`/browse/${this.path}`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            }).then(response => {
                console.log(response)
                this.load()
            }).catch(error => {
                console.error(error)
            })
            return false;
        }
    },
    watch: {
        path() {
            this.load()
        }
    },
    created() {
        this.load()
    }
}