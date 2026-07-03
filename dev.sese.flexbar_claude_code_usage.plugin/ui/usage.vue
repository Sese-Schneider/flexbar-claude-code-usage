<template>
    <v-container>
        <v-row>
            <v-col cols="6">
                <v-select
                    v-model="modelValue.data.metric"
                    :items="metricOptions"
                    :label="$t('Usage.UI.metric')"
                    item-title="title"
                    item-value="value"
                    hide-details
                    outlined
                    class="mx-2"
                ></v-select>
            </v-col>
        </v-row>
        <v-row>
            <v-col cols="6">
                <v-switch
                    v-model="modelValue.data.showResetTime"
                    :label="$t('Usage.UI.showResetTime')"
                    hide-details
                    class="mx-2"
                ></v-switch>
            </v-col>
            <v-col cols="6">
                <v-switch
                    v-model="modelValue.data.showRobot"
                    :label="$t('Usage.UI.showRobot')"
                    hide-details
                    class="mx-2"
                ></v-switch>
            </v-col>
        </v-row>
    </v-container>
</template>

<script>
export default {
    props: {
        modelValue: {
            type: Object,
            required: true,
        },
    },
    emits: ["update:modelValue"],
    computed: {
        metricOptions() {
            return [
                { title: this.$t("Usage.UI.metricSession"), value: "session" },
                { title: this.$t("Usage.UI.metricWeekly"), value: "weekly" },
                {
                    title: this.$t("Usage.UI.metricWeeklyModel"),
                    value: "weekly_model",
                },
            ];
        },
    },
    mounted() {
        if (this.modelValue.data.metric === undefined) {
            this.modelValue.data.metric = "session";
        }
        if (this.modelValue.data.showResetTime === undefined) {
            this.modelValue.data.showResetTime = true;
        }
        if (this.modelValue.data.showRobot === undefined) {
            this.modelValue.data.showRobot = false;
        }
    },
};
</script>

<style scoped></style>
