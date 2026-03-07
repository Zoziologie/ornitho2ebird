<script setup>
import { useI18n } from "vue-i18n";
import { UI_LANGUAGES } from "../lib/constants";

defineProps({
  uiLanguage: {
    type: String,
    required: true,
  },
});
const emit = defineEmits(["open-info", "open-settings"]);
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
      <button class="btn btn-light btn-sm d-inline-flex align-items-center gap-2" type="button" @click="emit('open-info')">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16m.93-11.412-1 4.705c-.07.34-.029.533.304.533.194 0 .487-.07.686-.246l-.088.416c-.287.346-.92.598-1.465.598-.703 0-1.002-.422-.808-1.319l1-4.705c.07-.34.029-.533-.304-.533-.194 0-.487.07-.686.246l.088-.416c.287-.346.92-.598 1.465-.598.703 0 1.002.422.808 1.319M8 3.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2"/>
        </svg>
        {{ t("info") }}
      </button>
      <button class="btn btn-light btn-sm" type="button" @click="emit('open-settings')">
        <svg class="me-1" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M9.405 1.05c-.413-1.4-2.397-1.4-2.81 0l-.1.34a1.46 1.46 0 0 1-2.105.872l-.31-.17c-1.28-.7-2.686.71-1.984 1.984l.169.311a1.46 1.46 0 0 1-.872 2.105l-.34.1c-1.4.413-1.4 2.397 0 2.81l.34.1a1.46 1.46 0 0 1 .872 2.105l-.17.31c-.7 1.28.71 2.686 1.984 1.984l.311-.169a1.46 1.46 0 0 1 2.105.872l.1.34c.413 1.4 2.397 1.4 2.81 0l.1-.34a1.46 1.46 0 0 1 2.105-.872l.31.17c1.28.7 2.686-.71 1.984-1.984l-.169-.311a1.46 1.46 0 0 1 .872-2.105l.34-.1c1.4-.413 1.4-2.397 0-2.81l-.34-.1a1.46 1.46 0 0 1-.872-2.105l.17-.31c.7-1.28-.71-2.686-1.984-1.984l-.311.169a1.46 1.46 0 0 1-2.105-.872zM8 10.93a2.93 2.93 0 1 1 0-5.86 2.93 2.93 0 0 1 0 5.86"/>
        </svg>
        {{ t("settings") }}
      </button>
    </div>
  </header>
</template>
