import markerColors from "/data/marker_color.json";
import { protocol } from "./utils";

export const UNASSIGNED_COLOR = "#6c757d";
export const CHECKLIST_COLORS = markerColors
  .slice(1)
  .filter((color) => color.toLowerCase() !== "#999999");

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
  const commonName = sighting.common_name ? escapeHtml(sighting.common_name) : "";
  const scientificName = sighting.scientific_name ? escapeHtml(sighting.scientific_name) : "";
  const species =
    commonName || scientificName
      ? `${commonName}${commonName && scientificName ? " " : ""}${
          scientificName
            ? `<span class="map-popup-species-scientific">${scientificName}</span>`
            : ""
        }`
      : escapeHtml(t("records"));
  const countParts = [sighting.count_precision, sighting.count].filter(
    (value) => value !== null && value !== "",
  );
  const count = countParts.length ? countParts.join("") : "—";
  const comment = sighting.comment || escapeHtml(t("popupNoComment"));
  const permalink = sighting.permalink
    ? `<a href="${escapeHtml(sighting.permalink)}" target="_blank" rel="noopener">${escapeHtml(String(sighting.id))}</a>`
    : escapeHtml(String(sighting.id ?? "—"));

  return `
    <div class="map-popup map-popup-sighting">
      <div class="map-popup-heading">${species}</div>
      <div class="map-popup-stack">
        <div class="map-popup-data-row">
          <span class="map-popup-data-label">${escapeHtml(t("popupDatetime"))}</span>
          <span class="map-popup-data-value">${escapeHtml(datetime)}</span>
        </div>
        <div class="map-popup-data-row">
          <span class="map-popup-data-label">${escapeHtml(t("popupCount"))}</span>
          <span class="map-popup-data-value">${escapeHtml(count)}</span>
        </div>
        <div class="map-popup-data-row">
          <span class="map-popup-data-label">${escapeHtml(t("popupComment"))}</span>
          <span class="map-popup-data-value">${comment}</span>
        </div>
        <div class="map-popup-data-row">
          <span class="map-popup-data-label">${escapeHtml(t("popupPermalink"))}</span>
          <span class="map-popup-data-value">${permalink}</span>
        </div>
      </div>
    </div>
  `;
}

// The observations of one place as a list, under `title`. With `assign` ({ options, onChange }),
// each has a select to move it to another checklist.
export function sightingListPopupContent(sightings, title, t, assign = null) {
  const content = document.createElement("div");
  content.className = "map-popup map-popup-cluster";

  const heading = document.createElement("div");
  heading.className = "map-popup-heading";
  heading.textContent = title;
  content.appendChild(heading);

  const list = document.createElement("div");
  list.className = "map-popup-stack";

  sightings.forEach((sighting) => {
    const row = document.createElement("div");
    row.className = "map-popup-card";

    const details = document.createElement("div");
    details.className = "map-popup-card-body";

    const species = document.createElement("div");
    species.className = "map-popup-card-title";
    if (sighting.common_name || sighting.scientific_name) {
      if (sighting.common_name) {
        species.appendChild(document.createTextNode(sighting.common_name));
      }
      if (sighting.scientific_name) {
        if (sighting.common_name) {
          species.appendChild(document.createTextNode(" "));
        }
        const scientificName = document.createElement("span");
        scientificName.className = "map-popup-species-scientific";
        scientificName.textContent = sighting.scientific_name;
        species.appendChild(scientificName);
      }
    } else {
      species.textContent = t("records");
    }
    details.appendChild(species);

    const meta = document.createElement("div");
    meta.className = "map-popup-compact-meta";

    const datetimeValue = document.createElement("span");
    datetimeValue.className = "map-popup-compact-item";
    datetimeValue.textContent = [sighting.date, sighting.time].filter(Boolean).join(" ") || "—";
    meta.appendChild(datetimeValue);

    const countValue = document.createElement("span");
    countValue.className = "map-popup-compact-item";
    const countParts = [sighting.count_precision, sighting.count].filter(
      (value) => value !== null && value !== "",
    );
    countValue.textContent = countParts.length ? countParts.join("") : "—";
    meta.appendChild(countValue);

    const permalinkValue = document.createElement("span");
    permalinkValue.className = "map-popup-compact-item";
    if (sighting.permalink) {
      const permalink = document.createElement("a");
      permalink.href = sighting.permalink;
      permalink.target = "_blank";
      permalink.rel = "noopener";
      permalink.textContent = String(sighting.id ?? "—");
      permalinkValue.appendChild(permalink);
    } else {
      permalinkValue.textContent = String(sighting.id ?? "—");
    }
    meta.appendChild(permalinkValue);

    details.appendChild(meta);

    if (assign) {
      details.appendChild(assignSelect(sighting, assign));
    }

    row.appendChild(details);
    list.appendChild(row);
  });

  content.appendChild(list);
  return content;
}

function assignSelect(sighting, { options, onChange }) {
  const select = document.createElement("select");
  select.className = "form-select form-select-sm map-popup-select";
  options.forEach((option) => {
    const optionElement = document.createElement("option");
    optionElement.value = String(option.value);
    optionElement.textContent = option.label;
    optionElement.selected = Number(option.value) === Number(sighting.form_id);
    select.appendChild(optionElement);
  });
  select.addEventListener("change", (event) => onChange(sighting, Number(event.target.value)));
  return select;
}
