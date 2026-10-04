import { haversineDistanceKm } from "./utils";
import { EBIRD_API_KEY } from "./constants";
import { fetchJson } from "./http";

const distance = (a, b) => haversineDistanceKm(...a, ...b);
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2;
};
const centreOf = (points) => [0, 1].map((axis) => median(points.map((point) => point[axis])));
const coordinate = (value) => value !== "" && value != null && Number.isFinite(Number(value));
const pointKey = (point) => point.map((value) => Number(value).toFixed(6)).join(",");
const uniquePoints = (points) => [
  ...new Map(points.map((point) => [pointKey(point), point])).values(),
];

// Distance to segments also supports sparse routes with observations between GPS fixes.
function distanceToTrack(point, path) {
  return Math.min(
    ...path.slice(1).map((end, index) => {
      const start = path[index];
      const longitudeScale = Math.cos((point[0] * Math.PI) / 180);
      const dx = (end[1] - start[1]) * longitudeScale;
      const dy = end[0] - start[0];
      const fraction = Math.max(
        0,
        Math.min(
          1,
          ((point[1] - start[1]) * longitudeScale * dx + (point[0] - start[0]) * dy) /
            (dx * dx + dy * dy || 1),
        ),
      );
      return distance(point, [start[0] + fraction * dy, start[1] + fraction * (end[1] - start[1])]);
    }),
  );
}

// Equal-distance samples prevent a dense GPS recording interval from dominating a route.
function sampleTrack(path) {
  const lengths = [0];
  for (let index = 1; index < path.length; index++) {
    lengths.push(lengths[index - 1] + distance(path[index - 1], path[index]));
  }
  const total = lengths.at(-1);
  if (!total) return [path[0]];
  const points = [];
  let segment = 1;
  for (let index = 0; index <= 64; index++) {
    const target = (total * index) / 64;
    while (segment < path.length - 1 && lengths[segment] < target) segment++;
    const fraction =
      (target - lengths[segment - 1]) / (lengths[segment] - lengths[segment - 1] || 1);
    points.push(
      [0, 1].map(
        (axis) =>
          path[segment - 1][axis] + fraction * (path[segment][axis] - path[segment - 1][axis]),
      ),
    );
  }
  return points;
}

// Trim at most 5%; for fewer than 20 positions no point is removed.
function supportedPoints(points) {
  const centre = centreOf(points);
  return [...points]
    .sort((a, b) => distance(a, centre) - distance(b, centre))
    .slice(0, points.length - Math.floor(points.length * 0.05));
}

export function hotspotEvidence(form, sightings) {
  const observations = sightings.filter(
    (sighting) => coordinate(sighting.lat) && coordinate(sighting.lon),
  );
  const sightingPoints = uniquePoints(
    observations.map((sighting) => [Number(sighting.lat), Number(sighting.lon)]),
  );
  let path = (form.path || []).filter((point) => coordinate(point[0]) && coordinate(point[1]));
  // A route copied from another visit must not override the observation positions.
  // Compare with the route, not its centre: sightings around a lake remain supported.
  const trackSeparation =
    path.length > 1 && sightingPoints.length
      ? median(sightingPoints.map((point) => distanceToTrack(point, path)))
      : null;
  const trackRejected = trackSeparation != null && trackSeparation > 1;
  if (trackRejected) path = [];
  const trackPoints = uniquePoints(path);
  const source = path.length > 1 ? "track" : sightingPoints.length ? "sightings" : "location";
  const raw =
    source === "track"
      ? trackPoints
      : source === "sightings"
        ? sightingPoints
        : coordinate(form.lat) && coordinate(form.lon)
          ? [[Number(form.lat), Number(form.lon)]]
          : [];
  if (!raw.length) return { source, points: [], anchors: [], count: 0, start: null };
  const supported = supportedPoints(raw);
  // Filter isolated GPS spikes before resampling: a single long erroneous segment otherwise
  // creates many interpolated positions and ceases to look like an outlier.
  const retained = new Set(supported.map(pointKey));
  const steps = path
    .slice(1)
    .map((point, index) => distance(point, path[index]))
    .filter((step) => step > 0);
  const connection = steps.length ? Math.max(0.05, median(steps) * 10) : 0.05;
  // Preserve continuous route ends, including a legitimate parking/start position. Only
  // remove spatial extremes separated from both neighbours by unusually large GPS jumps.
  const route = path.filter(
    (point, index) =>
      retained.has(pointKey(point)) ||
      [path[index - 1], path[index + 1]].some(
        (other) => other && distance(point, other) <= connection,
      ),
  );
  const points = source === "track" ? sampleTrack(route) : supported;
  const centre = centreOf(points);
  let start = null;
  if (source === "track" && pointKey(route[0]) === pointKey(path[0])) start = path[0];
  if (source === "sightings" && observations.every((sighting) => sighting.date && sighting.time)) {
    const first = [...observations].sort((a, b) =>
      `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`),
    )[0];
    const earliest = observations.filter(
      (sighting) => sighting.date === first.date && sighting.time === first.time,
    );
    const starts = uniquePoints(
      earliest.map((sighting) => [Number(sighting.lat), Number(sighting.lon)]),
    );
    if (starts.length === 1 && retained.has(pointKey(starts[0]))) start = starts[0];
  }
  const radius = Math.max(...points.map((point) => distance(centre, point)));
  // Search the centre, start and three spread-out supported positions. API search radius is
  // candidate discovery only, not an acceptance cutoff.
  const anchors = uniquePoints([centre, ...(start ? [start] : [])]);
  for (let index = 0; index < 3; index++) {
    const farthest = [...points].sort(
      (a, b) =>
        Math.min(...anchors.map((anchor) => distance(b, anchor))) -
        Math.min(...anchors.map((anchor) => distance(a, anchor))),
    )[0];
    if (Math.min(...anchors.map((anchor) => distance(farthest, anchor))) > 5)
      anchors.push(farthest);
  }
  return {
    source,
    points,
    sightingPoints,
    centre,
    start,
    radius,
    count: raw.length,
    trimmed: raw.length - (source === "track" ? uniquePoints(route).length : retained.size),
    anchors,
    trackRejected,
    trackSeparation,
  };
}

export function rankHotspots(evidence, hotspots) {
  if (!evidence.points.length) return { status: "insufficient", margin: 0, candidates: [] };
  const quality = evidence.source === "location" ? 0.35 : Math.min(1, 0.6 + evidence.count * 0.08);
  const candidates = [...new Map(hotspots.map((hotspot) => [hotspot.locId, hotspot])).values()]
    .map((hotspot) => {
      const position = [hotspot.lat, hotspot.lng];
      const distances = evidence.points
        .map((point) => distance(position, point))
        .sort((a, b) => a - b);
      const centreDistance = distance(position, evidence.centre);
      const startDistance = evidence.start ? distance(position, evidence.start) : null;
      const medianDistance = median(distances);
      const upperDistance = distances[Math.ceil(distances.length * 0.95) - 1];
      const scale = 0.2 + evidence.radius * 0.35;
      const interpretations = {
        centre: Math.exp(-centreDistance / scale),
        start: startDistance == null ? 0 : Math.exp(-startDistance / 0.2),
        observations: 0.75 * Math.exp(-distances[Math.floor((distances.length - 1) * 0.2)] / 0.2),
      };
      const interpretation = Object.keys(interpretations).sort(
        (a, b) => interpretations[b] - interpretations[a],
      )[0];
      const routeSupport =
        (Math.exp(-medianDistance / (0.4 + evidence.radius)) +
          Math.exp(-upperDistance / (0.6 + evidence.radius * 2))) /
        2;
      const sightingMedianDistance = evidence.sightingPoints.length
        ? median(evidence.sightingPoints.map((point) => distance(position, point)))
        : null;
      const support =
        evidence.source === "track" && sightingMedianDistance != null
          ? 0.9 * routeSupport + 0.1 * Math.exp(-sightingMedianDistance / (0.4 + evidence.radius))
          : routeSupport;
      const score = 100 * quality * (0.65 * interpretations[interpretation] + 0.35 * support);
      return {
        hotspot,
        score,
        interpretation,
        centreDistance,
        startDistance,
        medianDistance,
        upperDistance,
        sightingMedianDistance,
        support,
        quality,
      };
    })
    .sort((a, b) => b.score - a.score || a.hotspot.locId.localeCompare(b.hotspot.locId));
  const margin = candidates.length > 1 ? candidates[0].score - candidates[1].score : null;
  // Calibrated abstention: a candidate must fit and clearly beat the alternatives.
  // Sightings locate birds; an early observation alone cannot establish a route start.
  const status = !candidates.length
    ? "none"
    : evidence.source === "location" ||
        (evidence.count < 3 && (candidates[0].score < 25 || evidence.radius > 1))
      ? "insufficient"
      : candidates[0].score < 25
        ? "weak"
        : (evidence.source === "sightings" && candidates[0].interpretation === "start") ||
            (margin != null && margin / candidates[0].score < 0.4)
          ? "ambiguous"
          : "clear";
  return { status, margin, candidates };
}

// Cache promises across checklists; failed requests can be retried. Round the actual search
// centre too, so every cache key refers to precisely the same search circle.
export function createHotspotLoader(request = fetchJson) {
  const cache = new Map();
  return async (evidence) => {
    const hotspots = new Map();
    for (const point of evidence.anchors) {
      const [lat, lng] = point.map((value) => Number(value.toFixed(2)));
      const key = `${lat},${lng}`;
      if (!cache.has(key)) {
        cache.set(
          key,
          request(
            `https://api.ebird.org/v2/ref/hotspot/geo?lat=${lat}&lng=${lng}&dist=10&fmt=json&key=${EBIRD_API_KEY}`,
          ).catch((error) => {
            cache.delete(key);
            throw error;
          }),
        );
      }
      for (const hotspot of await cache.get(key)) hotspots.set(hotspot.locId, hotspot);
    }
    return [...hotspots.values()];
  };
}

export const loadHotspots = createHotspotLoader();
