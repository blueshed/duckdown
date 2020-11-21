import s3_browser from "./browse_s3.js"

const ROOT_DIR = "/edit/pages/"
const PATH_SEP = "/"

const app = Vue.createApp({
    data() {
        return {
            message: null,
            path: "",
            folders: null,
            files: null,
            file: null,
            content: "",
            mdown: "",
            images: false
        }
    },
    computed: {
        path_items() {
            if (this.path && this.path.length > 0) {
                return this.path.split("/")
            }
        },
        can_save() {
            return this.file && this.file.length != 0
        },
    },
    methods: {
        update: _.debounce(function (e) {
            this.content = e.target.value;
        }, 600),
        async compiledMarkdown() {
            let response = await axios.put("/edit/mark/", this.content)
            this.mdown = response.data.content
        },
        async load(file) {
            this.file = file;
            let response = await axios.get(ROOT_DIR + file)
            this.content = response.data
        },
        back(index) {
            if (index == 0) {
                this.path = ""
            } else {
                let items = this.path_items.slice(0, index);
                this.path = items.join('/') + '/';
            }
        },
        list() {
            let path = `${ROOT_DIR}${this.path}`
            let stub = ""
            if (this.path && this.path.length > 0) {
                stub = this.path + "/"
            }
            axios.get(path).then(response => {
                let items = response.data.items.map(item => {
                    item.path = `${stub}${item.name}`
                    return item
                })
                this.folders = items.filter(item => {
                    return !item.file
                })
                this.files = items.filter(item => {
                    return item.file
                })
            }).catch(error => {
                console.log(error)
            })
        },
        save() {
            this.message = "saving..."
            let path = ROOT_DIR + this.file;
            let content = this.content;
            axios.put(path, content).then(response => {
                console.log(response)
                this.list();
                this.set_message("saved.")
            }).catch(error => {
                console.log(error)
                this.message = error
            })
        },
        remove() {
            let path = ROOT_DIR + this.file;
            axios.delete(path).then(response => {
                console.log(response)
                this.list();
                this.set_message("removed.")
            }).catch(error => {
                console.log(error)
                this.message = error
            })
        },
        reset() {
            this.file = ""
            this.content = "# hello"
            this.images = false
        },
        set_message(value) {
            this.message = value
            setTimeout(() => {
                this.message = null
            }, 2000)
        }
    },
    watch: {
        content(value) {
            this.compiledMarkdown()
        },
        path() {
            this.list()
        }
    },
    created() {
        this.list()
        this.reset()
    }
})

app.component("s3browser", s3_browser)
app.mount('#app')