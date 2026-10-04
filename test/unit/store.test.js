import { describe, expect, it } from "vitest";
import { isReactive, isReadonly } from "vue";
import { createStore } from "../../src/lib/store";
import { buildForm, createSighting, uniqueDistanceFromPath } from "../../src/lib/utils";

const template = { short: "s", long: "l", limit: 4 };

const sighting = (id, formId, lat = 46.5, lon = 7.5, time = "08:00") =>
  createSighting({ id, form_id: formId, lat, lon, date: "2026-05-01", time });

// One imported checklist (id 1) and one made in the app (id 2), with sightings 1 and 2 assigned
// to it and sighting 3 unassigned.
function loadedStore() {
  const store = createStore();
  store.loadImport({
    forms: [
      buildForm({ imported: true, location_name: "Imported", lat: 46, lon: 7 }, 1),
      buildForm({ location_name: "Made", lat: 46.5, lon: 7.5 }, 2),
    ],
    sightings: [sighting(1, 2), sighting(2, 2), sighting(3, 0)],
    formsSightings: [[sighting(10, 1)]],
  });
  return store;
}

const formIds = (store) => store.state.forms.map((form) => form.id);
const formIdsOfSightings = (store) => store.state.sightings.map((s) => s.form_id);

describe("store", () => {
  it("starts empty and exposes read-only state", () => {
    const store = createStore();
    expect(store.state.forms).toEqual([]);
    expect(store.state.sightings).toEqual([]);
    expect(store.state.formsSightings).toEqual([]);
    expect(isReadonly(store.state)).toBe(true);
    expect(isReadonly(loadedStore().state.forms[0])).toBe(true);
  });

  it("loadImport replaces the data and clear empties it", () => {
    const store = loadedStore();
    expect(formIds(store)).toEqual([1, 2]);
    expect(store.state.sightings).toHaveLength(3);
    expect(store.state.formsSightings[0][0].id).toBe(10);

    store.clear();
    expect(store.state.forms).toEqual([]);
    expect(store.state.sightings).toEqual([]);
    expect(store.state.formsSightings).toEqual([]);
  });

  describe("assignSightings", () => {
    it("assigns the given sightings, taken from the read-only state", () => {
      const store = loadedStore();
      store.assignSightings([store.state.sightings[0], store.state.sightings[2]], 0);
      expect(formIdsOfSightings(store)).toEqual([0, 2, 0]);
    });

    it("matches sightings by identity, not by id", () => {
      const store = createStore();
      store.loadImport({ sightings: [sighting(1, 0), sighting(1, 0)] });
      store.assignSightings([store.state.sightings[1]], 5);
      expect(formIdsOfSightings(store)).toEqual([0, 5]);
    });
  });

  describe("createForm", () => {
    it("adds an exportable checklist with the next id and returns the id", () => {
      const store = loadedStore();
      const id = store.createForm(
        { location_name: "New", lat: 46.1234567, lon: 7.7654321, date: "2026-05-01" },
        { defaultNumberObserver: 2, speciesCommentTemplate: template },
      );
      expect(id).toBe(3);
      expect(formIds(store)).toEqual([1, 2, 3]);
      expect(store.state.forms[2]).toMatchObject({
        id: 3,
        imported: false,
        exportable: true,
        location_name: "New",
        lat: 46.123457,
        lon: 7.765432,
        number_observer: 2,
        primary_purpose: false,
        full_form: false,
        species_comment_template: template,
      });
    });

    it("copies the species comment template", () => {
      const store = createStore();
      const speciesCommentTemplate = { ...template };
      store.createForm({ lat: 46, lon: 7 }, { speciesCommentTemplate });
      speciesCommentTemplate.short = "changed";
      expect(store.state.forms[0].species_comment_template.short).toBe("s");
      expect(store.state.forms[0].location_name).toBe("Checklist 1");
    });
  });

  it("deleteForm removes the checklist and returns its index", () => {
    const store = loadedStore();
    expect(store.deleteForm(1)).toBe(0);
    expect(formIds(store)).toEqual([2]);
    expect(store.deleteForm(9)).toBe(-1);
    expect(formIds(store)).toEqual([2]);
    // Sightings are not touched.
    expect(formIdsOfSightings(store)).toEqual([2, 2, 0]);
  });

  it("deleteUnusedForms removes the checklists made in the app without sightings", () => {
    const store = loadedStore();
    store.createForm({ lat: 46, lon: 7 });
    store.deleteUnusedForms();
    expect(formIds(store)).toEqual([1, 2]);

    store.assignSightings(store.state.sightings, 0);
    store.deleteUnusedForms();
    // Imported checklists stay even without casual sightings.
    expect(formIds(store)).toEqual([1]);
  });

  it("resetAssignment unassigns every sighting and keeps the imported checklists", () => {
    const store = loadedStore();
    store.resetAssignment();
    expect(formIdsOfSightings(store)).toEqual([0, 0, 0]);
    expect(formIds(store)).toEqual([1]);
  });

  it("autoAssign groups the unassigned sightings into new checklists", () => {
    const store = loadedStore();
    store.loadImport({
      forms: store.state.forms.slice(0, 1).map((form) => buildForm(form, form.id)),
      sightings: [sighting(1, 0, 46.5, 7.5, "08:00"), sighting(2, 0, 46.5, 7.5, "08:30")],
    });
    store.autoAssign({
      autoAssignDuration: 1,
      autoAssignDistance: 3,
      defaultNumberObserver: 4,
      speciesCommentTemplate: template,
    });
    expect(formIdsOfSightings(store)).toEqual([2, 2]);
    expect(formIds(store)).toEqual([1, 2]);
    expect(store.state.forms[1]).toMatchObject({ imported: false, number_observer: 4 });
  });

  it("moveForm rounds the coordinates to 6 decimals", () => {
    const store = loadedStore();
    store.moveForm(2, 46.12345678, 7.98765432);
    expect(store.state.forms[1]).toMatchObject({ lat: 46.123457, lon: 7.987654 });
  });

  it("keeps a selected hotspot through effort edits and rebuilding, but clears it when moved", () => {
    const store = loadedStore();
    store.updateForm(2, {
      hotspot_id: "L5860421",
      location_name: "Rochers de Clé",
      lat: 46.4159672,
      lon: 7.2082329,
    });
    store.updateForm(2, { duration: 30 });
    expect(buildForm(store.state.forms[1], 2)).toMatchObject({
      hotspot_id: "L5860421",
      lat: 46.4159672,
      lon: 7.2082329,
    });
    store.moveForm(2, 46.4, 7.2);
    expect(store.state.forms[1]).toMatchObject({ hotspot_id: "", lat: 46.4, lon: 7.2 });
  });

  it("can undo hotspot choices without changing sightings or effort", () => {
    const store = loadedStore();
    const previous = { ...store.state.forms[1] };
    const assignments = formIdsOfSightings(store);
    store.selectHotspot(2, { locId: "L1", locName: "First", lat: 46.1234567, lng: 7.1234567 });
    store.selectHotspot(2, { locId: "L2", locName: "Second", lat: 46.2, lng: 7.2 });
    expect(store.state.forms[1].location_before_hotspot.location_name).toBe(previous.location_name);
    store.updateForm(2, { duration: 30 });
    store.restoreLocation(2);
    expect(store.state.forms[1]).toMatchObject({
      location_name: previous.location_name,
      lat: previous.lat,
      lon: previous.lon,
      hotspot_id: previous.hotspot_id,
      location_before_hotspot: null,
      duration: 30,
    });
    expect(formIdsOfSightings(store)).toEqual(assignments);
  });

  it("updateForm changes the given fields of one checklist", () => {
    const store = loadedStore();
    store.updateForm(2, { location_name: "Renamed", exportable: false });
    expect(store.state.forms[1]).toMatchObject({ location_name: "Renamed", exportable: false });
    expect(store.state.forms[0]).toMatchObject({ location_name: "Imported", exportable: true });
    // An unknown id changes nothing.
    store.updateForm(9, { location_name: "x" });
    expect(store.state.forms.map((form) => form.location_name)).toEqual(["Imported", "Renamed"]);
  });

  it("setFormPath stores the path, not reactive, and its distance", () => {
    const store = loadedStore();
    const path = [
      [46.5, 7.5],
      [46.51, 7.5],
    ];
    store.setFormPath(2, path);
    expect(store.state.forms[1].path).toBe(path);
    expect(isReactive(store.state.forms[1].path)).toBe(false);
    expect(store.state.forms[1].distance).toBe(uniqueDistanceFromPath(path));
  });

  it("fillNumberObserver sets only the missing numbers of observers", () => {
    const store = loadedStore();
    store.updateForm(1, { number_observer: "" });
    store.updateForm(2, { number_observer: 3 });
    store.fillNumberObserver(5);
    expect(store.state.forms.map((form) => form.number_observer)).toEqual([5, 3]);
  });
});
