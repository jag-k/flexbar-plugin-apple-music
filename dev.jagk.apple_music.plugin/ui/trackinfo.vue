<template>
  <v-container>
    <v-row>
      <v-col cols="12">
        <v-card>
          <v-card-title>Apple Music Plugin</v-card-title>
          <v-card-text>
            <div v-if="modelValue.cid === 'dev.jagk.apple_music.trackinfo'">
            </div>
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
  emits: ['update:modelValue'],
  data() {
    return {
    };
  },
  methods: {
    updateShowArtwork(value) {
      this.modelValue.data.showArtwork = value ? 'true' : 'false';
      this.$emit('update:modelValue', this.modelValue);
    },
    updateArtworkPosition(value) {
      this.modelValue.data.artworkPosition = value;
      this.$emit('update:modelValue', this.modelValue);
    },
    updateTextAlignment(value) {
      this.modelValue.data.textAlignment = value;
      this.$emit('update:modelValue', this.modelValue);
    }
  },
  mounted() {
    // Установка значений по умолчанию, если они не заданы

    this.$fd.info("Hello from Apple Music Plugin");
  }
};
</script>

<style scoped></style>
