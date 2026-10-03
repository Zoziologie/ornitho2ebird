import { markRaw, reactive, readonly, toRaw } from "vue";
import { applyDefaultAutomaticAssignment, buildForm, distanceFromPath, mathRound } from "./utils";

// The imported data: checklists (`forms`), casual sightings (`sightings`, assigned to a checklist
// through `form_id`, 0 when unassigned) and the sightings of imported checklists
// (`formsSightings[form.id - 1]`). Components read `state`, which is read-only, and change the
// data only through the actions below.
export function createStore() {
  const data = reactive({ forms: [], sightings: [], formsSightings: [] });

  function findForm(formId) {
    return data.forms.find((form) => form.id === formId) || null;
  }

  // Remove the forms for which `predicate` is true, in place.
  function removeForms(predicate) {
    for (let index = data.forms.length - 1; index >= 0; index -= 1) {
      if (predicate(data.forms[index])) {
        data.forms.splice(index, 1);
      }
    }
  }

  // Replace everything with a new import (see assembleImport).
  function loadImport({ forms = [], sightings = [], formsSightings = [] }) {
    data.sightings = sightings;
    data.forms = forms;
    data.formsSightings = formsSightings;
  }

  function clear() {
    loadImport({});
  }

  // Sightings are matched by identity: imported ids are not always unique. Components pass the
  // read-only objects from `state`, hence toRaw.
  function assignSightings(sightings, formId) {
    const targets = new Set(sightings.map((sighting) => toRaw(sighting)));
    data.sightings.forEach((sighting) => {
      if (targets.has(toRaw(sighting))) {
        sighting.form_id = formId;
      }
    });
  }

  // A new, empty checklist made by the user. Returns its id.
  function createForm(payload, { defaultNumberObserver, speciesCommentTemplate } = {}) {
    const id = Math.max(0, ...data.forms.map((form) => form.id)) + 1;
    data.forms.push(
      buildForm(
        {
          ...payload,
          imported: false,
          exportable: true,
          species_comment_template: {
            short: speciesCommentTemplate?.short || "",
            long: speciesCommentTemplate?.long || "",
            limit: Number(speciesCommentTemplate?.limit) || 5,
          },
          primary_purpose: false,
          full_form: false,
        },
        id,
        { defaultNumberObserver },
      ),
    );
    return id;
  }

  // Sightings still pointing to the form are left as they are: the editor only offers this for a
  // checklist without sightings. Returns the index the form had, or -1.
  function deleteForm(formId) {
    const index = data.forms.findIndex((form) => form.id === formId);
    if (index >= 0) {
      data.forms.splice(index, 1);
    }
    return index;
  }

  // Remove the checklists made in the app that no sighting is assigned to.
  function deleteUnusedForms() {
    const usedFormIds = new Set(
      data.sightings.map((sighting) => sighting.form_id).filter((id) => id > 0),
    );
    removeForms((form) => !form.imported && !usedFormIds.has(form.id));
  }

  // Unassign every sighting and remove the checklists made in the app.
  function resetAssignment() {
    data.sightings.forEach((sighting) => {
      sighting.form_id = 0;
    });
    removeForms((form) => !form.imported);
  }

  // Group the unassigned sightings into new checklists (see applyDefaultAutomaticAssignment).
  function autoAssign(options) {
    applyDefaultAutomaticAssignment({ ...options, forms: data.forms, sightings: data.sightings });
  }

  // Rounded like the coordinates of imported checklists and sightings (buildForm, createSighting).
  function moveForm(formId, lat, lon) {
    updateForm(formId, { lat: mathRound(lat, 6), lon: mathRound(lon, 6) });
  }

  function updateForm(formId, changes) {
    const form = findForm(formId);
    if (form) {
      Object.assign(form, changes);
    }
  }

  // Traces can be large and are only ever replaced as a whole, so they are not made reactive.
  function setFormPath(formId, path) {
    updateForm(formId, { path: markRaw(path), distance: distanceFromPath(path) });
  }

  // Checklists without a number of observers take the new default.
  function fillNumberObserver(value) {
    data.forms.forEach((form) => {
      if (!form.number_observer) {
        form.number_observer = value;
      }
    });
  }

  return {
    state: readonly(data),
    loadImport,
    clear,
    assignSightings,
    createForm,
    deleteForm,
    deleteUnusedForms,
    resetAssignment,
    autoAssign,
    moveForm,
    updateForm,
    setFormPath,
    fillNumberObserver,
  };
}

export const store = createStore();
