<script setup>
import { useI18n } from "vue-i18n";
import { UI_LANGUAGES } from "../lib/constants";

defineProps({
  uiLanguage: {
    type: String,
    required: true,
  },
});
const emit = defineEmits(["open-info", "open-settings", "update:ui-language"]);
const { t } = useI18n();
</script>

<template>
  <header
    class="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 p-3 my-3 text-white rounded shadow-sm bg-secondary"
  >
    <div>
      <h1 class="mb-0">{{ t("appTitle") }}</h1>
      <p class="mb-0 mt-1">{{ t("appSubtitle") }}</p>
    </div>
    <div class="d-flex align-items-center gap-2">
      <select
        :value="uiLanguage"
        class="form-select form-select-sm w-auto"
        :aria-label="t('appLanguage')"
        @change="emit('update:ui-language', $event.target.value)"
      >
        <option v-for="languageOption in UI_LANGUAGES" :key="languageOption.value" :value="languageOption.value">
          {{ languageOption.label }}
        </option>
      </select>
      <button
        class="btn btn-light btn-sm d-inline-flex align-items-center gap-2"
        type="button"
        @click="emit('open-info')"
      >
        <i class="bi bi-journal-text" aria-hidden="true"></i>
        {{ t("info") }}
      </button>
      <button
        class="btn btn-light btn-sm d-inline-flex align-items-center gap-2"
        type="button"
        @click="emit('open-settings')"
      >
        <i class="bi bi-gear-fill" aria-hidden="true"></i>
        {{ t("settings") }}
      </button>
    </div>
  </header>
</template>
