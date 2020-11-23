<template>
<span class="icn" v-html="iconSvg"></span>
</template>

<script>
import feather from "../assets/feather-sprite.svg"

export default
{
    props: ["name"],
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
</style>
