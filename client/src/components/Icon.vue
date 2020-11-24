<template>
<span :class="['icn',{icnSpinner:spin}]" v-html="iconSvg"></span>
</template>

<script>
import feather from "../assets/feather-sprite.svg"

export default
{
    props: ["name", "spin"],
    computed:
    {
        iconSvg: function()
        {
            return `<svg class="feather"><use href="${feather}#${this.name}"/></svg>`
        }
    }
}
</script>

<style lang="css">
.feather {
    width: 16px;
    height: 16px;
    stroke: currentColor;
    stroke-width: 1;
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
    stroke-width: 2;
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
