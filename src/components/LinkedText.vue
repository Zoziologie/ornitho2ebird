<script setup>
import { computed } from "vue";

// Renders a translated text in which each "[bracketed words]" links to the next URL in
// `links`, so translators can place the link anywhere in the sentence. Links to "#..." (the
// help) stay in the app; the others open in a new tab.
const props = defineProps({
  text: {
    type: String,
    required: true,
  },
  links: {
    type: Array,
    default: () => [],
  },
});

const parts = computed(() =>
  props.text.split(/\[([^\]]+)\]/).map((value, index) => ({
    value,
    href: index % 2 === 1 ? props.links[(index - 1) / 2] : "",
  })),
);
</script>

<template>
  <template v-for="(part, index) in parts" :key="index">
    <a v-if="part.href?.startsWith('#')" :href="part.href">{{ part.value }}</a>
    <a v-else-if="part.href" :href="part.href" target="_blank" rel="noopener">{{ part.value }}</a>
    <template v-else>{{ part.value }}</template>
  </template>
</template>
