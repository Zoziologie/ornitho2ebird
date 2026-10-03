// The basemaps of the two maps. Plain data, so settings.js can check saved ids without loading
// MapLibre.
//
// `id` is saved in settings: never change one (the first five are the names of the Leaflet
// basemaps). `region`: the country of a national map, "" for a worldwide one. `kind`: "map",
// "topo" or "aerial". A basemap has either a vector `style` URL or a `raster` source. `retina`:
// on a high-density screen, use the tiles of the next zoom level at half size, so the labels stay
// small and sharp.
export const BASEMAPS = [
  {
    id: "OpenStreetMap",
    region: "",
    provider: "OpenStreetMap",
    kind: "map",
    style: "https://tiles.openfreemap.org/styles/liberty",
  },
  {
    id: "OpenTopoMap",
    region: "",
    provider: "OpenTopoMap",
    kind: "topo",
    raster: {
      tiles: ["https://tile.opentopomap.org/{z}/{x}/{y}.png"],
      maxzoom: 17,
      attribution:
        "&copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap (CC-BY-SA)",
    },
  },
  {
    id: "Satellite",
    region: "",
    provider: "Esri",
    kind: "aerial",
    raster: {
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      maxzoom: 19,
      attribution: "Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community",
    },
  },
  {
    id: "Swiss (swisstopo)",
    region: "CH",
    provider: "swisstopo",
    kind: "topo",
    retina: true,
    raster: {
      tiles: [
        "https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg",
      ],
      maxzoom: 19,
      attribution: "&copy; swisstopo",
    },
  },
  {
    id: "swisstopo-aerial",
    region: "CH",
    provider: "swisstopo",
    kind: "aerial",
    raster: {
      tiles: [
        "https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/{z}/{x}/{y}.jpeg",
      ],
      maxzoom: 20,
      attribution: "&copy; swisstopo",
    },
  },
  {
    id: "France (IGN)",
    region: "FR",
    provider: "IGN",
    kind: "map",
    style: "https://data.geopf.fr/annexes/ressources/vectorTiles/styles/PLAN.IGN/standard.json",
  },
  {
    id: "ign-aerial",
    region: "FR",
    provider: "IGN",
    kind: "aerial",
    raster: {
      tiles: [
        "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/jpeg&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
      ],
      maxzoom: 19,
      attribution: "&copy; IGN",
    },
  },
  {
    id: "Germany (BKG)",
    region: "DE",
    provider: "basemap.de",
    kind: "map",
    style: "https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_top.json",
  },
  {
    id: "topplusopen",
    region: "DE",
    provider: "TopPlusOpen",
    kind: "topo",
    raster: {
      tiles: [
        "https://sgx.geodatenzentrum.de/wmts_topplus_open/tile/1.0.0/web/default/WEBMERCATOR/{z}/{y}/{x}.png",
      ],
      maxzoom: 18,
      attribution: "&copy; BKG (dl-de/by-2-0)",
    },
  },
  {
    id: "basemap-at",
    region: "AT",
    provider: "basemap.at",
    kind: "map",
    raster: {
      tiles: [
        "https://mapsneu.wien.gv.at/basemap/geolandbasemap/normal/google3857/{z}/{y}/{x}.png",
      ],
      maxzoom: 19,
      attribution: "&copy; basemap.at",
    },
  },
  {
    id: "basemap-at-aerial",
    region: "AT",
    provider: "basemap.at",
    kind: "aerial",
    raster: {
      tiles: [
        "https://mapsneu.wien.gv.at/basemap/bmaporthofoto30cm/normal/google3857/{z}/{y}/{x}.jpeg",
      ],
      maxzoom: 19,
      attribution: "&copy; basemap.at",
    },
  },
  {
    id: "icgc-topo",
    region: "ES",
    provider: "ICGC (Catalunya)",
    kind: "topo",
    raster: {
      tiles: [
        "https://geoserveis.icgc.cat/servei/catalunya/mapa-base/wmts/topografic/MON3857NW/{z}/{x}/{y}.png",
      ],
      maxzoom: 20,
      attribution: "&copy; ICGC",
    },
  },
  {
    id: "ign-es-topo",
    region: "ES",
    provider: "IGN España",
    kind: "topo",
    raster: {
      tiles: [
        "https://www.ign.es/wmts/mapa-raster?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=MTN&STYLE=default&TILEMATRIXSET=GoogleMapsCompatible&FORMAT=image/jpeg&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
      ],
      maxzoom: 20,
      attribution: "&copy; Instituto Geográfico Nacional",
    },
  },
  {
    id: "geoportail-lu-topo",
    region: "LU",
    provider: "geoportail.lu",
    kind: "topo",
    raster: {
      tiles: [
        "https://wmts3.geoportail.lu/opendata/wmts/topo_20k/GLOBAL_WEBMERCATOR_4_V3/{z}/{x}/{y}.png",
      ],
      maxzoom: 19,
      attribution: "&copy; ACT Luxembourg",
    },
  },
  {
    id: "pdok",
    region: "NL",
    provider: "PDOK",
    kind: "map",
    style:
      "https://api.pdok.nl/kadaster/brt-achtergrondkaart/ogc/v1/styles/standaard__webmercatorquad?f=mapbox",
  },
  {
    id: "ngi-topo",
    region: "BE",
    provider: "NGI",
    kind: "topo",
    raster: {
      tiles: ["https://cartoweb.wmts.ngi.be/1.0.0/topo/default/3857/{z}/{y}/{x}.png"],
      maxzoom: 17,
      attribution: "&copy; NGI",
    },
  },
];

export const DEFAULT_BASEMAP = "OpenStreetMap";

// The national map shown when the user has not chosen one (the setting is "").
const BASEMAP_BY_WEBSITE = {
  "ornitho.ch": "Swiss (swisstopo)",
  "faune-france.org": "France (IGN)",
  "ornitho.de": "Germany (BKG)",
  "ornitho.at": "basemap-at",
  "ornitho.cat": "icgc-topo",
  "ornitho.eus": "ign-es-topo",
  "ornitho.lu": "geoportail-lu-topo",
  "waarneming.nl": "pdok",
  "waarnemingen.be": "ngi-topo",
};

export function isBasemapId(id) {
  return BASEMAPS.some((basemap) => basemap.id === id);
}

// The basemap to show: the saved choice, or else the national map of the source website.
export function resolveBasemap(id, websiteName) {
  if (isBasemapId(id)) {
    return id;
  }
  return BASEMAP_BY_WEBSITE[websiteName] || DEFAULT_BASEMAP;
}

export function findBasemap(id) {
  return BASEMAPS.find((basemap) => basemap.id === id) || findBasemap(DEFAULT_BASEMAP);
}

// The basemaps by region, worldwide ones first, as [{ label, options: [{ value, label }] }].
// `t` gives the translated labels and `language` the language of the country names.
export function basemapGroups(t, language) {
  const regionNames = new Intl.DisplayNames([language, "en"], { type: "region" });
  const kindLabels = {
    map: t("basemapKindMap"),
    topo: t("basemapKindTopo"),
    aerial: t("basemapKindAerial"),
  };
  const groups = [];
  BASEMAPS.forEach((basemap) => {
    const label = basemap.region ? regionNames.of(basemap.region) : t("basemapWorld");
    let group = groups.find((candidate) => candidate.label === label);
    if (!group) {
      group = { label, options: [] };
      groups.push(group);
    }
    group.options.push({
      value: basemap.id,
      label: `${basemap.provider} · ${kindLabels[basemap.kind]}`,
    });
  });
  return groups;
}
