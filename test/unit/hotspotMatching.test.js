import { describe, expect, it, vi } from "vitest";
import { createHotspotLoader, hotspotEvidence, rankHotspots } from "../../src/lib/hotspotMatching";

const point = (x, y = 0) => [46 + y / 111.195, 7 + x / (111.195 * Math.cos((46 * Math.PI) / 180))];
const hotspot = (id, x, y = 0) => ({
  locId: id,
  locName: id,
  lat: point(x, y)[0],
  lng: point(x, y)[1],
});
const sightings = (points) => points.map(([lat, lon]) => ({ lat, lon, count: 1 }));
const form = { lat: 46, lon: 7 };

describe("hotspot scoring scenarios", () => {
  it("supports a parking hotspot at the start of a long track", () => {
    const path = Array.from({ length: 31 }, (_, i) => point(i / 10));
    const evidence = hotspotEvidence({ ...form, path }, []);
    const ranking = rankHotspots(evidence, [hotspot("parking", 0), hotspot("elsewhere", 0, 3)]);
    expect(ranking.candidates[0].hotspot.locId).toBe("parking");
    expect(ranking.candidates[0].interpretation).toBe("start");
    expect(ranking.status).toBe("clear");
  });

  it("prefers the centre of a lake even when the route never reaches it", () => {
    const path = Array.from({ length: 65 }, (_, i) =>
      point(Math.cos((i * Math.PI) / 32), Math.sin((i * Math.PI) / 32)),
    );
    const ranking = rankHotspots(hotspotEvidence({ ...form, path }, []), [
      hotspot("lake", 0),
      hotspot("outside", 3),
    ]);
    expect(ranking.candidates[0].hotspot.locId).toBe("lake");
    expect(ranking.candidates[0].interpretation).toBe("centre");
    expect(ranking.status).toBe("clear");
  });

  it("ignores one distant bird but follows a substantial distant group", () => {
    const local = Array.from({ length: 20 }, (_, i) => point(i / 1000));
    const candidates = [hotspot("local", 0), hotspot("distant", 3)];
    const isolated = hotspotEvidence(form, sightings([...local, point(3)]));
    expect(isolated.trimmed).toBe(1);
    expect(rankHotspots(isolated, candidates).candidates[0].hotspot.locId).toBe("local");
    const majority = hotspotEvidence(
      form,
      sightings([...local.slice(0, 4), ...local.map(([lat, lon]) => [lat, lon + point(3)[1] - 7])]),
    );
    expect(rankHotspots(majority, candidates).candidates[0].hotspot.locId).toBe("distant");
  });

  it("does not give repeated species positions or large bird counts extra weight", () => {
    const records = sightings([point(0), point(0.01), point(0.02), point(0.03)]);
    const evidence = hotspotEvidence(form, records);
    const duplicate = hotspotEvidence(form, [
      ...records,
      ...Array(100).fill({ ...records[0], count: 500 }),
    ]);
    expect(rankHotspots(duplicate, [hotspot("local", 0)])).toEqual(
      rankHotspots(evidence, [hotspot("local", 0)]),
    );
    expect(duplicate.start).toBeNull();
  });

  it("keeps small samples and reports limited evidence instead of confident matching", () => {
    const evidence = hotspotEvidence(form, sightings([point(0), point(3)]));
    expect(evidence.points).toHaveLength(2);
    expect(rankHotspots(evidence, [hotspot("local", 0)]).status).toBe("insufficient");
  });

  it("marks competing candidates as ambiguous and distant lone candidates as weak", () => {
    const evidence = hotspotEvidence(
      form,
      sightings([point(0), point(0.01), point(0.02), point(0.03)]),
    );
    expect(rankHotspots(evidence, [hotspot("a", 0), hotspot("b", 0.01)]).status).toBe("ambiguous");
    expect(rankHotspots(evidence, [hotspot("far", 5)]).status).toBe("weak");
    expect(rankHotspots(evidence, []).status).toBe("none");
  });

  it("resamples uneven tracks and filters an isolated GPS spike before interpolation", () => {
    const regular = Array.from({ length: 21 }, (_, i) => point(i / 20));
    const dense = [regular[0], ...Array(200).fill(regular[0]), ...regular.slice(1)];
    const a = hotspotEvidence({ ...form, path: regular }, []);
    const b = hotspotEvidence({ ...form, path: dense }, []);
    expect(b.points).toEqual(a.points);
    const spiked = hotspotEvidence({ ...form, path: [...regular, point(50)] }, []);
    expect(spiked.trimmed).toBe(1);
    expect(spiked.radius).toBeLessThan(1);
    expect(spiked.start).toEqual(regular[0]);
  });

  it("uses a sighting start only with unambiguous timestamps and keeps location-only fallback uncertain", () => {
    const records = sightings([point(0), point(0.1), point(0.2)]).map((sighting, i) => ({
      ...sighting,
      date: "2026-01-01",
      time: `08:0${i}`,
    }));
    expect(hotspotEvidence(form, records).start).toEqual(point(0));
    expect(
      hotspotEvidence(
        form,
        records.map((sighting) => ({ ...sighting, time: "08:00" })),
      ).start,
    ).toBeNull();
    expect(rankHotspots(hotspotEvidence(form, []), [hotspot("local", 0)]).status).toBe(
      "insufficient",
    );
  });
});

describe("hotspot discovery", () => {
  it("searches spread-out evidence, deduplicates IDs and reuses requests across checklists", async () => {
    const evidence = hotspotEvidence(
      { ...form, path: Array.from({ length: 101 }, (_, i) => point(i / 2)) },
      [],
    );
    expect(evidence.anchors.length).toBeGreaterThan(2);
    const request = vi.fn().mockResolvedValue([hotspot("same", 0)]);
    const load = createHotspotLoader(request);
    expect(await load(evidence)).toHaveLength(1);
    const calls = request.mock.calls.length;
    expect(calls).toBeGreaterThan(2);
    await load(evidence);
    expect(request).toHaveBeenCalledTimes(calls);
  });

  it("retries failed requests rather than caching an empty success", async () => {
    const request = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue([]);
    const load = createHotspotLoader(request);
    const evidence = hotspotEvidence(form, []);
    await expect(load(evidence)).rejects.toThrow("offline");
    expect(await load(evidence)).toEqual([]);
    expect(request).toHaveBeenCalledTimes(2);
  });
});
