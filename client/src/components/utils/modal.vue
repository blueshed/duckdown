<template>
    <div class="w3-modal" @click="close_modal()">
        <div class="w3-modal-content">
            <div class="w3-container">
                <p>
                    <icon name="message-circle" width="24px" height="24px" />
                    {{ message }}
                </p>
            </div>
            <div class="btns menu">
                <button @click="close_modal()">Cancel</button>
                <button @click="close_modal(true)">OK</button>
            </div>
        </div>
    </div>
</template>

<script>
export default {
    props: ["message", "func"],
    methods: {
        close_modal(perform) {
            if (perform && this.func) {
                this.func();
            }
            this.$emit("dismiss");
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