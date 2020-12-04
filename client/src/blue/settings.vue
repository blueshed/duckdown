<template>
    <div class="Settings">
        <icon
            name="x-square"
            width="32px"
            height="32px"
            class="close"
            @click="$router.push('/')"
        />
        <h2>
            Settings 
            <router-link to="/"
                ><icon name="arrow-left" />
                <svg class="logo orange">
                    <use xlink:href="../assets/logo.svg#duck" /></svg
                ><svg class="logo blue">
                    <use xlink:href="../assets/logo.svg#duck" /></svg
            ></router-link>
        </h2>
        <div class="container">
            <div class="profile">
                <h3>User</h3>
                <p>
                    <pre>{{ JSON.stringify(profile, null, 4) }}</pre>
                </p>
            </div>
            <div class="sites selectable">
                <table>
                    <thead>
                        <tr>
                            <th>
                                Sites
                            </th>
                            <th width="32px" class="actionable">
                                <icon name="folder-plus" height="16px" width="16px" title="add site" />
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr
                            v-for="item in sites"
                            :key="item.id"
                            @click="site_selected(item)"
                            :class="{selected:site && site.id==item.id}"
                        >
                            <td colspan="2">{{ item.name }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div class="site">
                <table v-if="site">
                    <thead>
                        <tr>
                            <th>email</th>
                            <th>permission</th>
                            <th width="32px" class="actionable">
                                <icon name="user-plus" height="16px" width="16px" title="add user" />
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="item in site.accl" :key="item.email">
                            <td>{{ item.email }}</td>
                            <td>{{ item.permission }}</td>
                            <td></td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</template>

<script>
import { mapGetters, mapActions } from "vuex";
export default {
    computed: {
        ...mapGetters(["profile", "sites", "site"]),
    },
    methods: {
        ...mapActions(["get_site"]),
        site_selected(site) {
            if (this.site && site && this.site.id == site.id) {
                this.$store.commit("set_site", null);
            } else {
                this.get_site(site);
            }
        },
    },
};
</script>

<style lang="css" scoped>
.Settings {
    --bd-color: lightgray;
    padding: 4em;
}
.container {
    display: flex;
    justify-content: flex-start;
}
.container > div {
    margin-right: 4em;
}
h2 {
    font-weight: bold;
    font-size: 1.5em;
    margin-bottom: 1em;
}
h3 {
    font-size: 1.4em;
    margin-bottom: 0.5em;
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

table {
    min-width: 240px;
    margin-bottom: 1em;
    border-collapse: separate;
}
.selectable tbody tr:hover {
    background-color: var(--menu-hover);
    cursor: pointer;
}
.selectable tbody tr.selected {
    background-color: var(--menu-selected);
}
th,
td {
    padding: 6px;
}
th,
td {
    font-weight: 300;
    border: 1px solid var(--bd-color);
    border-right: none;
}
td:last-child,
th:last-child {
    border-right: 1px solid var(--bd-color);
}
th {
    font-weight: 500;
    border-bottom: none;
}
th:first-of-type {
    border-top-left-radius: 4px;
}
th:last-of-type {
    border-top-right-radius: 4px;
}
tr:last-of-type td:first-of-type {
    border-bottom-left-radius: 4px;
}
tr:last-of-type td:last-of-type {
    border-bottom-right-radius: 4px;
}
.actionable:hover {
    background-color: var(--hover-color);
    color: var(--bg-color);
}
</style>