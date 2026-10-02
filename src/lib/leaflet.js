import L from "leaflet";

// leaflet-draw and leaflet.markercluster are plain scripts that extend a global `L`. Import this
// module before them so that global exists: the bundler does not guarantee Leaflet's own
// `window.L` assignment runs first (it does not with Vite 8 / Rolldown).
window.L = L;

export default L;
