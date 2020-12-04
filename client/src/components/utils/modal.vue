<template>
    <div class="w3-modal" @click="close_modal()">
        <div class="w3-modal-content">
            <div class="w3-container">
                <p>
                    <icon :name="icon_name" width="24px" height="24px" />
                    {{ message }}
                </p>
            </div>
            <slot></slot>
            <div class="btns menu">
                <button @click.stop="close_modal()">{{ cancel_txt }}</button>
                <button @click.stop="close_modal(true)">{{ ok_txt }}</button>
            </div>
        </div>
    </div>
</template>

<script>
export default {
    props: ["message", "func", "ok", "cancel", "icon"],
    computed: {
        ok_txt() {
            return this.ok ? this.ok : "OK";
        },
        cancel_txt() {
            return this.cancel ? this.cancel : "Cancel";
        },
        icon_name() {
            return this.icon ? this.icon : "message-circle";
        },
    },
    methods: {
        close_modal(perform) {
            if (perform && this.func) {
                this.func();
            }
            this.$emit("dismiss", perform);
        },
    },
};
</script>

<style lang="css" scoped>
.btns {
    border-top: 1px solid var(--txt-color);
    text-align: right;
    padding: 1em;
}
.w3-modal {
    z-index: 3;
    padding-top: 100px;
    position: fixed;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    overflow: auto;
    background-color: rgb(0, 0, 0);
    background-color: rgba(0, 0, 0, 0.4);
}
.w3-modal-content {
    border-radius: 4px;
    margin: auto;
    background-color: var(--bg-color);
    position: relative;
    padding: 0;
    outline: 0;
    width: 600px;
}
.w3-container {
    padding: 2em;
}
.icn {
    position: relative;
    top: 4px;
    transform: rotateX(-180deg);
}
</style>