var protocol = document.location.protocol == "https:" ? "wss://" : "ws://";
var ws_url = protocol + document.domain + ":" + document.location.port;

class RpcClient {
    constructor(store, path) {
        this.store = store
        this._url = ws_url + path
        this._promises = []
        this._id = 1
        this._buffer = []
        this.connect()
    }
    connect() {
        this.store.commit("set_status", "connecting")
        var ws = new WebSocket(this._url)
        ws.onopen = () => {
            this.store.commit("set_status", "connected")
            if (this._buffer) {
                this._buffer.map((item) => {
                    this._ws.send(item)
                })
                this._buffer = null
            }
        }
        ws.onerror = () => {
            this.store.commit("set_status", "failed")
        }
        ws.onmessage = (evt) => {
            let action = JSON.parse(evt.data)
            if (action['id']) {
                if (action.error) {
                    var error_obj = new Error(action.error.message)
                    error_obj.status_code = action.error.code
                    error_obj["original_payload"] = action.error
                    this._promises[action.id].reject(error_obj)
                } else {
                    this._promises[action.id].resolve(action.result)
                }
                delete this._promises[action.id]
            } else {
                this.store.commit("set_broadcast", action)
                if (this.store._actions[action.action]) {
                    this.store.dispatch(action.action, action)
                }
            }
        }
        this._ws = ws
    }
    call(method, params) {
        this._id++
        return new Promise((resolve, reject) => {
            let msg = JSON.stringify({
                "jsonrpc": "2.0",
                "id": this._id,
                "method": method,
                "params": params
            })
            if (this._buffer !== null) {
                this._buffer.push(msg)
            } else {
                this._ws.send(msg)
            }
            this._promises[this._id] = {
                reject: reject,
                resolve: resolve
            }
        })
    }
    install(Vue) {
        Vue.prototype.$rpc = this
    }
}

export default function(url) {
    console.log("ws", url)
    return store => {
        store.$rpc = new RpcClient(store, url)
    }
}