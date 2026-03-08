import L from "leaflet";
import { protocol } from "./utils";

export function createBaseLayers() {
  return {
    "OpenStreetMap": L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }),
    "Satellite": L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        attribution: "Tiles &copy; Esri",
        maxZoom: 19,
      },
    ),
    "SwissTopo": L.tileLayer(
      "https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg",
      {
        attribution: "&copy; swisstopo",
        maxZoom: 18,
        detectRetina: true,
      },
    ),
    "France (IGN)": L.tileLayer(
      "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/png&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
      {
        attribution: "&copy; IGN/Geoportail",
        maxZoom: 19,
        tileSize: 256,
        detectRetina: true,
      },
    ),
    "Germany (BKG)": L.tileLayer(
      "https://sgx.geodatenzentrum.de/wmts_basemapde/tile/1.0.0/de_basemapde_web_raster_farbe/default/GLOBAL_WEBMERCATOR/{z}/{y}/{x}.png",
      {
        attribution: "&copy; basemap.de / BKG",
        maxZoom: 18,
      },
    ),
  };
}

export function addBaseLayerControl(map) {
  const baseLayers = createBaseLayers();
  baseLayers.OpenStreetMap.addTo(map);
  L.control.layers(baseLayers, null, { position: "topleft" }).addTo(map);
}

export function protocolBadgeClass(form) {
  const state = protocol(form);
  return (
    {
      danger: "bg-danger",
      warning: "bg-warning text-dark",
      success: "bg-success",
    }[state.variant] || "bg-secondary"
  );
}

export function protocolCode(form) {
  return protocol(form)?.letter || "?";
}

export function checklistColor(formId, checklistColors, unassignedColor) {
  if (Number(formId) === 0) {
    return unassignedColor;
  }

  return checklistColors[
    (((Number(formId) - 1) % checklistColors.length) + checklistColors.length) %
      checklistColors.length
  ];
}

export function checklistMarkerHtml(formId, checklistColors, unassignedColor) {
  const color = checklistColor(formId, checklistColors, unassignedColor);
  const textColor = color === "#ffff33" ? "#212529" : "#ffffff";
  return `<span style="background:${color};color:${textColor};border-color:${color}">${formId}</span>`;
}

export function buildAssignmentOptions(forms, t, checklistColors, unassignedColor) {
  return [
    {
      value: 0,
      label: t("nonAssigned"),
      color: checklistColor(0, checklistColors, unassignedColor),
      protocolCode: null,
      protocolClass: "",
    },
    ...forms.map((form) => ({
      value: form.id,
      label: `${form.id}. ${form.location_name}`,
      color: checklistColor(form.id, checklistColors, unassignedColor),
      protocolCode: protocolCode(form),
      protocolClass: protocolBadgeClass(form),
    })),
  ];
}

export function buildReviewOptions(forms, checklistColors, unassignedColor) {
  return forms.map((form) => ({
    value: form.id,
    label: `${form.id}. ${form.location_name}`,
    color: checklistColor(form.id, checklistColors, unassignedColor),
    protocolCode: protocolCode(form),
    protocolClass: protocolBadgeClass(form),
  }));
}

export function requiredStateClass(value) {
  return String(value || "").trim() ? "is-valid" : "is-invalid";
}

export function requiredNumberStateClass(value, min, max) {
  if (value === "" || value === null || value === undefined) {
    return "is-invalid";
  }

  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? "is-valid" : "is-invalid";
}

export function requiredTimeStateClass(value) {
  return /^\d{2}:\d{2}$/.test(value) ? "is-valid" : "is-invalid";
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatSightingPopup(sighting, t) {
  const datetime = [sighting.date, sighting.time].filter(Boolean).join(" ").trim() || "—";
  const speciesParts = [sighting.common_name, sighting.scientific_name].filter(Boolean);
  const species = speciesParts.length ? speciesParts.join(" / ") : t("records");
  const count =
    [sighting.count_precision, sighting.count]
      .filter((value) => value !== null && value !== "")
      .join(" ") || "—";
  const comment = sighting.comment || "—";
  const permalink = sighting.permalink
    ? `<a href="${escapeHtml(sighting.permalink)}" target="_blank" rel="noopener">${escapeHtml(String(sighting.id))}</a>`
    : escapeHtml(String(sighting.id ?? "—"));

  return `
    <div class="map-popup">
      <div><strong>${escapeHtml(t("popupDatetime"))}:</strong> ${escapeHtml(datetime)}</div>
      <div><strong>${escapeHtml(t("popupSpecies"))}:</strong> ${escapeHtml(species)}</div>
      <div><strong>${escapeHtml(t("popupCount"))}:</strong> ${escapeHtml(count)}</div>
      <div><strong>${escapeHtml(t("popupComment"))}:</strong> ${comment}</div>
      <div><strong>${escapeHtml(t("popupPermalink"))}:</strong> ${permalink}</div>
    </div>
  `;
}
