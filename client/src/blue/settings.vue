<template>
    <div class="Settings">
        <icon
            name="x-square"
            width="32px"
            height="32px"
            class="close"
            @click="$router.push('/')"
        />
        <h2>Settings</h2>
        <p>User: {{ profile }}</p>
        <p>
            <router-link to="/"
                ><icon name="arrow-left" />
                <svg class="logo orange">
                    <use xlink:href="../assets/logo.svg#duck" /></svg
                ><svg class="logo blue">
                    <use xlink:href="../assets/logo.svg#duck" /></svg
            ></router-link>
        </p>
    </div>
</template>

<script>
import { mapGetters } from "vuex";
export default {
    computed: {
        ...mapGetters(["profile"]),
    },
};
</script>

<style lang="css" scoped>
.Settings {
    padding: 4em;
}
h2 {
    font-weight: bold;
    font-size: 1.5em;
    margin-bottom: 1em;
}
p {
    margin-bottom: 1em;
}
.logo {
    height: 20px;
    width: 20px;
    vertical-align: bottom;
    margin-right: 0.25em;
    stroke: currentColor;
    stroke-width: 1;
    stroke-linecap: round;
    stroke-linejoin: round;
    fill: var(--primary-color);
}
.orange {
    fill: var(--contrast-color);
}
.orange:hover {
    fill: var(--primary-color);
    transform: scaleX(-1);
}
.blue {
    fill: var(--primary-color);
}
.blue:hover {
    fill: var(--contrast-color);
    transform: scaleX(-1);
}
.close {
    position: absolute;
    top: 10px;
    right: 10px;
}
.close:hover {
    stroke-width: 2px;
}
</style>