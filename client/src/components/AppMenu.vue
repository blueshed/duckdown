<template>
    <div class="AppMenu">
        <div class="menu">
            <a
                href="https://www.markdownguide.org/cheat-sheet/"
                target="duckdown-help"
                title="cheat-sheet"
            >
                <button>
                    <icon
                        name="help-circle"
                        width="14px"
                        height="14px"
                        v-if="$root.with_icons"
                    />
                    Help
                </button>
            </a>
            <slot></slot>
            <button
                @click.prevent.stop="$emit('toggle-sidebar')"
                :class="{ active: sidebar }"
                title="show images selector"
            >
                <icon
                    name="image"
                    width="14px"
                    height="14px"
                    v-if="$root.with_icons"
                />
                Images
            </button>
            <button @click.prevent.stop="$emit('view-page')" title="view page">
                <icon
                    name="external-link"
                    width="14px"
                    height="14px"
                    v-if="$root.with_icons"
                />
                View
            </button>
            <!-- icon id="box" name="box" width="14px" height="14px"  @click="with_icons=!with_icons"/-->
        </div>
    </div>
</template>

<script>
export default {
    props: ["sidebar"],
};
</script>

<style lang="css" scoped>
.AppMenu {
    width: 100%;
}
.menu {
    margin-right: 0.5em;
}
.menu > button,
.menu > a {
    float: right;
}
#box {
    float: left;
    top: 4px;
}
</style>
