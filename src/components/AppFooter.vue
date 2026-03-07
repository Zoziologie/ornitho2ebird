<script setup>
import logo from "/logo_w.svg";

defineProps({
  version: {
    type: String,
    required: true,
  },
});
</script>

<template>
  <footer class="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-2 px-4 py-3 text-white rounded shadow-sm mt-3 bg-secondary">
    <a
      href="https://github.com/Zoziologie/ornitho2ebird"
      target="_blank"
      rel="noopener"
      class="text-decoration-none text-white"
    >
      ornitho2ebird v{{ version }}
    </a>
    <a class="footer-brand text-decoration-none text-white" href="https://zoziologie.raphaelnussbaumer.com/" target="_blank" rel="noopener">
      <img :src="logo" alt="Zoziologie" height="24" />
      <span>Zoziologie</span>
    </a>
  </footer>
</template>
