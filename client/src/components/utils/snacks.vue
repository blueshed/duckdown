<template>
    <div class="snacks">
        <div class="snack-column">
            <div
                :class="['snack', message.type]"
                v-for="message in messages"
                :key="message.id"
                @click="remove_message(message.id)"
            >
                <p>
                    <icon
                        :name="message.icon"
                        width="24px"
                        height="24px"
                        :color="message.icon_color"
                    />
                    {{ message.text }}
                </p>
            </div>
        </div>
    </div>
</template>

<script>
var ID = 1;

const ICONS = {
    note: "alert-triangle",
    warn: "x-octagon",
};
const ICON_COLORS = {
    note: "orange",
    warn: "#ff7a97",
};

export default {
    data() {
        return {
            messages: [],
        };
    },
    methods: {
        add_message(value, type) {
            let message_id = ID++;
            type = type ? type : "note";
            let message = {
                id: message_id,
                text: value,
                type: type,
                icon: ICONS[type],
                icon_color: ICON_COLORS[type],
            };
            this.messages.push(message);
            setTimeout(() => {
                this.remove_message(message.id);
            }, 2000);
            return message_id;
        },
        remove_message(message_id) {
            let message = this.messages.find((item) => {
                return item.id == message_id;
            });
            if (message) {
                this.messages.splice(this.messages.indexOf(message), 1);
            }
        },
    },
};
</script>

<style lang="css" scoped>
.snacks {
    z-index: 2;
    position: absolute;
    bottom: 0;
    right: 0;
}
.snack-column {
    display: flex;
    flex-direction: column-reverse;
}
.snack {
    border-radius: 4px;
    padding: 1em;
    margin: 0.5em;
    cursor: pointer;
}
.note {
    background-color: lightgoldenrodyellow;
}
.warn {
    background-color: lightsalmon;
}
.icn {
    stroke-width: 2;
    vertical-align: middle;
}
</style>