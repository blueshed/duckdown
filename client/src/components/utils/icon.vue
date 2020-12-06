<template>
    <span :class="['icn', { icnSpinner: spin }]" v-html="iconSvg"></span>
</template>

<script>
import feather from "../../assets/feather-sprite.svg";

export default {
    props: ["name", "spin", "width", "height", "color"],
    computed: {
        get_width() {
            return this.width ? this.width : "16px";
        },
        get_height() {
            return this.height ? this.height : "16px";
        },
        get_color() {
            return this.color ? this.color : "currentColor";
        },
        iconSvg() {
            return `<svg class="feather" width="${this.get_width}" height="${this.get_height}" stroke="${this.get_color}"><use href="${feather}#${this.name}"/></svg>`;
        },
    },
};
</script>

<style lang="css">
.feather {
    /* stroke-width: 1; */
    /* stroke: currentColor; */
    stroke-linecap: round;
    stroke-linejoin: round;
    fill: none;
}
.icnSpinner {
    position: relative;
    top: 4px;
    left: 4px;
    width: 16px;
    height: 16px;
    animation: spin-animation 1.2s infinite linear;
    display: inline-block;
}
@keyframes spin-animation {
    0% {
        transform: rotate(0deg);
    }

    100% {
        transform: rotate(359deg);
    }
}
</style>
