<template>
  <v-container>
    <v-row>
      <v-col cols="12">
        <v-card>
          <v-card-title>{{ $t("TrackInfo.Title") }}</v-card-title>
          <v-card-subtitle>{{ $t("TrackInfo.Tip") }}</v-card-subtitle>
          <v-card-text>
            <v-checkbox :label="$t('TrackInfo.UI.ShowArtwork.Label')" v-model="modelValue.data.showArtwork">
              <template v-slot:append>
                <span class="opacity-50">
                  {{ $t("TrackInfo.UI.ShowArtwork.Tip") }}
                </span>
              </template>
            </v-checkbox>
          </v-card-text>
        </v-card>
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
  data() {
    return {}
  },
  methods: {},
}
</script>
