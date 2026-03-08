<script setup>
import { useI18n } from "vue-i18n";

defineProps({
  version: {
    type: String,
    required: true,
  },
});

const { t } = useI18n({ useScope: "global" });
const baseUrl = import.meta.env.BASE_URL;
const poweredByLogo = `${baseUrl}logo_w.svg`;

const supporters = [
  { id: "vogelwarte", name: "Vogelwarte", href: "https://www.ornitho.ch/", logo: `${baseUrl}logo_vowa.png` },
  {
    id: "ico",
    name: "Institut Català d'Ornitologia",
    href: "https://www.ornitho.cat/",
    logo: `${baseUrl}logo_ico.png`,
  },
  {
    id: "placeholder",
    name: "More partners coming soon",
    href: "#",
    logo: null,
  },
];
</script>

<template>
  <footer class="footer-shell px-4 py-3 text-white rounded shadow-sm mt-3 bg-secondary">
    <div class="support-strip">
      <div class="support-strip-label">{{ t("supportedBy") }}</div>
      <div class="support-strip-list">
        <a
          v-for="supporter in supporters"
          :key="supporter.id"
          :href="supporter.href"
          target="_blank"
          rel="noopener"
          class="support-card text-decoration-none"
          :aria-label="supporter.name"
          :class="{ 'support-card-placeholder': !supporter.logo }"
        >
          <img v-if="supporter.logo" :src="supporter.logo" :alt="supporter.name" class="support-card-logo" />
          <span v-else class="support-card-placeholder-mark" aria-hidden="true">
            <i class="bi bi-plus-lg"></i>
          </span>
          <span class="support-card-name">{{ supporter.name }}</span>
        </a>
      </div>
    </div>

    <div class="footer-meta d-flex flex-wrap justify-content-center align-items-center gap-2 small mt-3">
      <span>v{{ version }}</span>
      <span aria-hidden="true">•</span>
      <a
        href="https://github.com/Zoziologie/ornitho2ebird"
        target="_blank"
        rel="noopener"
        class="footer-brand text-decoration-none text-white"
      >
        <i class="bi bi-github" aria-hidden="true"></i>
        <span>GitHub</span>
      </a>
      <span aria-hidden="true">•</span>
      <span>{{ t("poweredBy") }}</span>
      <a
        class="footer-brand text-decoration-none text-white"
        href="https://zoziologie.raphaelnussbaumer.com/"
        target="_blank"
        rel="noopener"
      >
        <img :src="poweredByLogo" alt="Zoziologie" height="24" />
        <span>Zoziologie</span>
      </a>
    </div>
  </footer>
</template>
