<template>
    <div class="BlueApp">
        <router-view v-slot="{ Component }">
            <keep-alive>
                <component :is="Component" />
            </keep-alive>
        </router-view>
    </div>
</template>

<script>
import { mapGetters } from "vuex";
export default {
    name: "BlueApp",
    computed: {
        ...mapGetters(["with_icons"]),
    },
};
</script>

<style lang="css" scoped>
.BlueApp {
    width: 100%;
    height: 100%;
}
</style>
