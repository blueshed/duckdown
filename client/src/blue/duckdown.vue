<template>
    <DuckApp ref="duck_app">
        <template v-slot:tool>
            <div class="dropdown">
                <button>
                    <icon
                        name="sliders"
                        :class="{ success: connected }"
                        width="14px"
                        height="14px"
                    />
                    Blue
                </button>
                <div class="dropdown-content">
                    <ul>
                        <li @click.prevent.stop="$router.push('/settings')">
                            <a
                                @click.prevent.stop="$router.push('/settings')"
                                title="edit settings"
                            >
                                <icon
                                    name="settings"
                                    width="14px"
                                    height="14px"
                                    v-if="$root.with_icons"
                                />
                                Settings
                            </a>
                        </li>

                        <li @click="window.location = '/logout'">
                            <a title="sign out of blue">
                                <icon
                                    name="log-out"
                                    width="14px"
                                    height="14px"
                                    v-if="$root.with_icons"
                                />
                                Sign Out
                            </a>
                        </li>
                    </ul>
                </div>
            </div>
        </template>
    </DuckApp>
</template>

<script>
import { mapGetters } from "vuex";
import DuckApp from "../App.vue";
export default {
    components: {
        DuckApp,
    },
    computed: {
        ...mapGetters(["status"]),
        connected() {
            return this.status == "connected";
        },
    },
};
</script>

<style lang="css" scoped>
.success {
    color: darkgreen;
}
button:hover .icn {
    color: white;
    stroke-width: 2px;
}
.dropdown {
    position: relative;
    display: inline-block;
    float: right;
}

.dropdown-content {
    top: 24px;
    right: 0px;
    display: none;
    position: absolute;
    background-color: #f9f9f9;
    min-width: 120px;
    box-shadow: 0px 8px 16px 0px rgba(0, 0, 0, 0.2);
    border-radius: 3px;
    padding: 12px 16px;
    z-index: 1;
}

.dropdown:hover .dropdown-content {
    display: block;
}
li {
    margin-bottom: 6px;
}
li a {
    width: 100%;
    text-decoration: none;
    color: var(--txt-color);
}
li:hover {
    cursor: pointer;
    background-color: var(--menu-hover);
    color: var(--bg-color);
}
</style>
