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
    id: "ebird",
    name: "eBird",
    href: "https://ebird.org/",
    logo: `${baseUrl}logo_ebird.svg`,
  },
];
</script>

<template>
  <footer class="footer-shell px-4 py-3 text-white rounded shadow-sm mt-3 bg-secondary">
    <div class="support-strip">
      <div class="support-strip-label">{{ t("supportedBy") }}</div>
      <div class="support-strip-list">
        <component
          v-for="supporter in supporters"
          :key="supporter.id"
          :is="supporter.href ? 'a' : 'div'"
          :href="supporter.href || undefined"
          :target="supporter.href ? '_blank' : undefined"
          :rel="supporter.href ? 'noopener' : undefined"
          class="support-card text-decoration-none"
          :aria-label="supporter.href ? supporter.name : undefined"
          :class="{ 'support-card-placeholder': !supporter.logo }"
        >
          <img v-if="supporter.logo" :src="supporter.logo" :alt="supporter.name" class="support-card-logo" />
          <span v-else class="support-card-placeholder-mark" aria-hidden="true">
            <i class="bi bi-plus-lg"></i>
          </span>
          <span class="support-card-name">{{ supporter.name }}</span>
        </component>
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
      <a
        href="https://github.com/Zoziologie/ornitho2ebird/wiki/FAQ"
        target="_blank"
        rel="noopener"
        class="footer-brand text-decoration-none text-white"
      >
        <i class="bi bi-question-circle" aria-hidden="true"></i>
        <span>FAQ</span>
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
