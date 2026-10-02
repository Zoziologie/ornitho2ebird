import { shallowReactive } from "vue";

// In-app replacement for window.confirm / window.alert, rendered by AppDialog.vue.
// Requests are queued so a second dialog waits for the first one to close.
export const dialogQueue = shallowReactive([]);

function openDialog(type, message) {
  return new Promise((resolve) => {
    dialogQueue.push({ type, message, resolve });
  });
}

export function closeDialog(result) {
  const dialog = dialogQueue.shift();
  dialog?.resolve(result);
}

export function confirmDialog(message) {
  return openDialog("confirm", message);
}

export function alertDialog(message) {
  return openDialog("alert", message);
}
