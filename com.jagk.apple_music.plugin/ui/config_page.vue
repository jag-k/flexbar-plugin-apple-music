<template>
  <v-container>
    <v-card prepend-icon="mdi-pencil" :title="$t('PluginName')">
      <v-card-text>
        <v-row>
          <v-col cols="12">
            <v-slider
              v-model="modelValue.config.updateRate"
              :max="60000"
              :min="500"
              :step="500"
              :label="$t('config.updateRate.name')"
              class="align-center"
              hide-details
            >
              <template v-slot:append>
                <v-text-field
                  v-model="modelValue.config.updateRate"
                  density="compact"
                  style="width: 120px"
                  type="number"
                  suffix="ms"
                  hide-details
                  single-line
                ></v-text-field>
              </template>
            </v-slider>
            <div class="text-caption">{{ $t("config.updateRate.description") }}</div>
          </v-col>
        </v-row>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn variant="text" icon @click="saveConfig">
          <v-icon>mdi-check-circle-outline</v-icon>
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-container>
</template>

<script>
export default {
  props: {
    /**
     * {
     *    "uuid": "<Your Plugin UUID>",
     *    "cid": "<Your Plugin UUID>.<Config Page Name>",
     *    "manifest": <Your Plugin Manifest>,
     *    "config": {}, // Config loaded from a local file
     * }
     */
    modelValue: {
      type: Object,
      required: true,
    },
  },
  methods: {
    saveConfig() {
      const updateRate = parseInt(this.modelValue.config.updateRate)
      // Check if update rate is valid number
      if (isNaN(updateRate) || updateRate < 1000 || updateRate > 60000) {
        this.$fd.showSnackbarMessage("error", "Update rate must be between 1000 and 60000")
        return
      }
      // Save as a number
      this.modelValue.config.updateRate = updateRate
      this.$fd.setConfig(this.modelValue.config)
      this.$fd.showSnackbarMessage("success", "Config updated!")
    },
  },
}
</script>

<style scoped></style>
