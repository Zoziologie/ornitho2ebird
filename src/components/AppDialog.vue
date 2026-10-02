<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { closeDialog, dialogQueue } from "../lib/dialog";

const { t } = useI18n();
const okButton = ref(null);
const dialog = computed(() => dialogQueue[0] || null);

function cancel() {
  closeDialog(dialog.value?.type === "confirm" ? false : undefined);
}

function confirm() {
  closeDialog(dialog.value?.type === "confirm" ? true : undefined);
}

function onKeydown(event) {
  if (dialog.value && event.key === "Escape") {
    cancel();
  }
}

watch(dialog, async (value) => {
  if (value) {
    await nextTick();
    okButton.value?.focus();
  }
});

onMounted(() => document.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => document.removeEventListener("keydown", onKeydown));
</script>

<template>
  <div
    v-if="dialog"
    class="modal-backdrop d-grid p-3 overflow-x-hidden app-dialog-backdrop"
    @click.self="cancel"
  >
    <section
      class="modal-panel app-dialog-panel card border-0 shadow"
      role="alertdialog"
      aria-modal="true"
      aria-describedby="app-dialog-message"
    >
      <div class="card-body p-4">
        <p id="app-dialog-message" class="mb-4 app-dialog-message">{{ dialog.message }}</p>
        <div class="d-flex justify-content-end gap-2">
          <button
            v-if="dialog.type === 'confirm'"
            class="btn btn-outline-secondary"
            type="button"
            @click="cancel"
          >
            {{ t("cancel") }}
          </button>
          <button ref="okButton" class="btn btn-primary" type="button" @click="confirm">
            {{ t("ok") }}
          </button>
        </div>
      </div>
    </section>
  </div>
</template>
