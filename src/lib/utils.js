function normalizeName(value) {
  return (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-US");
}

export function mathMode(values) {
  const counts = new Map();

  values.forEach((value) => {
    counts.set(value, (counts.get(value) || 0) + 1);
  });

  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

export function mathRound(value, exponent) {
  if (value === null || value === undefined || value === "") {
    return value;
  }

  const factor = 10 ** exponent;
  return Math.round(Number(value) * factor) / factor;
}

export function formatDate(date, separator = "-") {
  if (!date) {
    return "";
  }

  const safeDate = new Date(`${date}T00:00:00`);
  const month = String(safeDate.getMonth() + 1).padStart(2, "0");
  const day = String(safeDate.getDate()).padStart(2, "0");
  return `${month}${separator}${day}${separator}${safeDate.getFullYear()}`;
}

export async function copyClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const toRadians = (value) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function distanceFromPath(path) {
  if (!Array.isArray(path) || path.length < 2) {
    return 0;
  }

  let distance = 0;
  for (let index = 1; index < path.length; index += 1) {
    distance += haversineDistanceKm(path[index - 1][0], path[index - 1][1], path[index][0], path[index][1]);
  }

  return mathRound(distance, 2);
}

export function protocol(form) {
  if (!form?.date || Number(form?.duration) >= 1440) {
    return {
      name: "Invalid",
      letter: "X",
      variant: "danger",
    };
  }

  if (!form.primary_purpose) {
    return {
      name: "Incidental",
      letter: "I",
      variant: "warning",
    };
  }

  if (
    form.time &&
    Number(form.distance) >= 0 &&
    Number(form.duration) > 0 &&
    Number(form.number_observer) > 0
  ) {
    return Number(form.distance) > 0
      ? { name: "Traveling", letter: "T", variant: "success" }
      : { name: "Stationary", letter: "S", variant: "success" };
  }

  return {
    name: "Historical",
    letter: "H",
    variant: "warning",
  };
}

export function speciesComment(speciesCommentTemplate, sightings) {
  if (!speciesCommentTemplate || !sightings?.length) {
    return "";
  }

  const template =
    sightings.length < Number(speciesCommentTemplate.limit || 5)
      ? speciesCommentTemplate.short
      : speciesCommentTemplate.long;
  const separator = sightings.length < Number(speciesCommentTemplate.limit || 5) ? "<br/>" : ", ";

  return sightings
    .map((sighting) => {
      return template
        .split("${")
        .map((chunk, index) => {
          if (index === 0) {
            return chunk;
          }

          const [expression, suffix = ""] = chunk.split("}");
          const context = { s: sighting };

          try {
            return (
              Function("context", `with (context) { return String(${expression}); }`)(context).replace(
                /(?:\r\n|\r|\n)/g,
                "<br>"
              ) + suffix
            );
          } catch {
            return suffix;
          }
        })
        .join("");
    })
    .join(separator);
}

export function checklistComment(form, sightings, importedWithText) {
  const comment = form.checklist_comment || "";
  return `${comment}${comment ? "<br/>" : ""}<small>${importedWithText}</small>`;
}

export function buildSpeciesCommentTemplate(website) {
  if (!website) {
    return {
      short: "",
      long: "",
      limit: 20,
    };
  }

  if (website.system === "ornitho") {
    return {
      short:
        '${ s.count_precision }${ s.count } ind. ${ s.time ? " - " + s.time : "" } - <a href="' +
        website.website +
        'index.php?m_id=54&id=${ s.id }">' +
        website.name +
        '</a>${ s.comment ? " - " + s.comment : "" }',
      long:
        '${ s.count_precision }${ s.count } - <a href="' +
        website.website +
        'index.php?m_id=54&id=${ s.id }">${ s.time }</a>${ s.comment ? " - " + s.comment : "" }',
      limit: 5,
    };
  }

  if (website.system === "birdlasser") {
    return {
      short:
        '${ s.count_precision }${ s.count } ind. - ${ s.time } - <a href="http://maps.google.com?q=${s.lat},${s.lon}&t=k">${ s.lat }, ${ s.lon }</a>${ s.comment ? " - " + s.comment : "" }',
      long:
        '${ s.count_precision }${ s.count } ind. - ${ s.time } - ${ s.lat }, ${ s.lon }${ s.comment ? " - " + s.comment : "" }',
      limit: 20,
    };
  }

  if (website.system === "observation") {
    return {
      short:
        '${ s.count_precision }${ s.count } ind. ${ s.time ? " - " + s.time : "" } - <a href="https://maps.google.com?q=${s.lat},${s.lon}&t=k">${ s.lat }, ${ s.lon }</a> - <a href="' +
        website.website +
        'observation/${ s.id }">' +
        website.name +
        '</a>${ s.comment ? " - " + s.comment : "" }',
      long:
        '${ s.count_precision }${ s.count } ind. ${ s.time ? " - " + s.time : "" } - ${ s.lat }, ${ s.lon }${ s.comment ? " - " + s.comment : "" }',
      limit: 20,
    };
  }

  return {
    short: "",
    long: "",
    limit: 20,
  };
}

export function buildChecklistPayloadFromSightings(sightings, options = {}) {
  if (!Array.isArray(sightings) || sightings.length === 0) {
    return null;
  }

  return {
    location_name: mathMode(sightings.map((sighting) => sighting.location_name)),
    date: sightings[0].date,
    time: sightings[0].time,
    lat: sightings.reduce((sum, sighting) => sum + sighting.lat, 0) / sightings.length,
    lon: sightings.reduce((sum, sighting) => sum + sighting.lon, 0) / sightings.length,
    species_comment_template: options.speciesCommentTemplate,
    primary_purpose: true,
    full_form: false,
  };
}

export function applyDefaultAutomaticAssignment({
  forms,
  sightings,
  autoAssignDuration,
  autoAssignDistance,
  defaultNumberObserver,
  speciesCommentTemplate,
}) {
  if (!Array.isArray(forms) || !Array.isArray(sightings) || !sightings.length) {
    return;
  }

  const unassigned = [...sightings]
    .filter((sighting) => sighting.form_id === 0)
    .sort((left, right) => {
      const leftTime = new Date(`${left.date}T${left.time || "00:00"}`).getTime();
      const rightTime = new Date(`${right.date}T${right.time || "00:00"}`).getTime();
      if (leftTime !== rightTime) {
        return leftTime - rightTime;
      }

      if (left.lat !== right.lat) {
        return left.lat - right.lat;
      }

      return left.lon - right.lon;
    });
  if (!unassigned.length) {
    return;
  }

  const assignDurationHours = Number(autoAssignDuration) || 1;
  const assignDistanceKm = Number(autoAssignDistance) || 3;
  const datetimes = unassigned.map((sighting) => {
    return sighting.time ? new Date(`${sighting.date}T${sighting.time}`) : new Date(`${sighting.date}T00:00:00`);
  });
  let nextFormId = Math.max(0, ...forms.map((form) => Number(form.id) || 0)) + 1;

  for (let index = 0; index < unassigned.length; index += 1) {
    for (let compare = index - 1; compare >= 0; compare -= 1) {
      const sameDay =
        datetimes[index].getFullYear() === datetimes[compare].getFullYear() &&
        datetimes[index].getMonth() === datetimes[compare].getMonth() &&
        datetimes[index].getDate() === datetimes[compare].getDate();

      if (
        sameDay &&
        Math.abs(datetimes[index] - datetimes[compare]) < assignDurationHours * 60 * 60 * 1000
      ) {
        const km = haversineDistanceKm(
          unassigned[compare].lat,
          unassigned[compare].lon,
          unassigned[index].lat,
          unassigned[index].lon
        );
        if (km < assignDistanceKm) {
          unassigned[index].form_id = unassigned[compare].form_id;
        }
      }
    }

    if (unassigned[index].form_id === 0) {
      unassigned[index].form_id = nextFormId;
      nextFormId += 1;
    }
  }

  for (
    let formId = Math.max(0, ...forms.map((form) => Number(form.id) || 0)) + 1;
    formId < nextFormId;
    formId += 1
  ) {
    const matchedSightings = sightings.filter((sighting) => sighting.form_id === formId);
    if (!matchedSightings.length) {
      continue;
    }

    const payload = buildChecklistPayloadFromSightings(matchedSightings, {
      speciesCommentTemplate,
    });

    forms.push(
      buildForm(payload, formId, {
        defaultNumberObserver,
      })
    );
  }
}

export function buildForm(form, id, options = {}) {
  const template = {
    short: form.species_comment_template?.short || "",
    long: form.species_comment_template?.long || "",
    limit: form.species_comment_template?.limit || 5,
  };

  const builtForm = {
    id,
    imported: Boolean(form.imported),
    exportable: form.exportable !== false,
    location_name: normalizeName(form.location_name || `Checklist ${id}`),
    lat: mathRound(form.lat, 6),
    lon: mathRound(form.lon, 6),
    date: form.date || "",
    time: form.time ? form.time.substring(0, 5) : "",
    duration: form.duration || "",
    distance: form.distance === 0 ? 0 : form.distance ?? "",
    number_observer: form.number_observer || options.defaultNumberObserver || 1,
    full_form: Boolean(form.full_form),
    primary_purpose: form.primary_purpose !== false,
    checklist_comment: form.checklist_comment || "",
    species_comment_template: template,
    path: form.path || null,
  };

  return builtForm;
}

export function createSighting(raw) {
  return {
    id: raw.id,
    form_id: raw.form_id,
    location_name: normalizeName(raw.location_name),
    lat: mathRound(raw.lat, 6),
    lon: mathRound(raw.lon, 6),
    date: raw.date,
    time: raw.time ? raw.time.substring(0, 5) : "",
    common_name: raw.common_name || "",
    scientific_name: raw.scientific_name || "",
    count: raw.count || null,
    count_precision: raw.count_precision || "",
    comment: raw.comment ? raw.comment.replace(/\r\n/g, "<br>") : "",
  };
}
