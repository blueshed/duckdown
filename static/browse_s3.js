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
                this.files = response.data.Contents ? response.data.Contents : []
                this.folders = response.data.CommonPrefixes ? response.data.CommonPrefixes : []
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