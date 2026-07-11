/* Wikipedia Geotag Atlas — client-side prototype (MapLibre GL + PMTiles).
   Reads a single .pmtiles vector-tile archive over HTTP range requests, so the
   browser only downloads tiles for the current viewport. Filtering by language /
   source / year is done entirely in the browser via MapLibre expressions. */

const TILES_URL = "tiles/world.pmtiles";       // 100k representative demo (rebuild with --sample to change size)
const STATS_URL = "tiles/world.stats.json";
const SOURCE_LAYER = "geotags";

const state = { lang: "", src: -1, ymin: 2001, ymax: 2026 };

// Register the pmtiles:// protocol so MapLibre can read tiles from the archive.
const protocol = new pmtiles.Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile);

const map = new maplibregl.Map({
  container: "map",
  attributionControl: { compact: true },
  style: {
    version: 8,
    sources: {
      carto: {
        type: "raster",
        tiles: [
          "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
          "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
          "https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
        ],
        tileSize: 256,
        attribution: "© CARTO © OpenStreetMap contributors",
      },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#f4f1ea" } },
      { id: "carto", type: "raster", source: "carto", paint: { "raster-opacity": 0.85 } },
    ],
  },
  center: [12, 28],
  zoom: 1.6,
  maxZoom: 18,
  minZoom: 1,
});

map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
window.__map = map;  // exposed for headless render tests

function currentFilter() {
  const clauses = [];
  if (state.lang) clauses.push(["==", ["get", "lang"], state.lang]);
  if (state.src >= 0) clauses.push(["==", ["get", "src"], state.src]);
  clauses.push([">=", ["get", "year"], state.ymin]);
  clauses.push(["<=", ["get", "year"], state.ymax]);
  return ["all", ...clauses];
}

function applyFilter() {
  const f = currentFilter();
  map.setFilter("pts-heat", f);
  map.setFilter("pts-circ", f);
  map.setFilter("pts-hit", f);
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function articleUrl(p) {
  return p.wp ? `https://${p.lang}.wikipedia.org/wiki/${p.wp}` : null;
}

function articleTitle(p) {
  let t = p.wp || p.lang;
  try { t = decodeURIComponent(p.wp); } catch (_) {}
  return t.replace(/_/g, " ");
}

async function init() {
  const loadingEl = document.getElementById("loading");

  const mapReady = new Promise((res) => {
    if (map.loaded()) res();
    else map.once("load", res);
  });
  map.on("error", (e) => console.error("MapLibre error:", e && e.error));

  // Sidecar stats drive the dropdown, totals and year range (tiles are a capped
  // sample, so the browser cannot count points itself).
  let stats;
  try {
    stats = await fetch(STATS_URL).then((r) => {
      if (!r.ok) throw new Error("stats " + r.status);
      return r.json();
    });
  } catch (err) {
    loadingEl.textContent = "Could not load stats: " + err.message;
    console.error(err);
    return;
  }

  // Language dropdown (already sorted by frequency in the sidecar).
  const sel = document.getElementById("lang");
  for (const { code, count } of stats.langs.slice(0, 120)) {
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = `${code}  (${count.toLocaleString()})`;
    sel.appendChild(opt);
  }
  // Hide the language control when the dataset is a single edition.
  if (stats.langs.length <= 1) {
    const ctrl = sel.closest(".ctrl");
    if (ctrl) ctrl.style.display = "none";
    if (stats.langs.length === 1) state.lang = stats.langs[0].code;
  }

  // Year sliders.
  const ymin = stats.year_min || 2001, ymax = stats.year_max || 2026;
  state.ymin = ymin; state.ymax = ymax;
  for (const id of ["ymin", "ymax"]) {
    const el = document.getElementById(id);
    el.min = ymin; el.max = ymax; el.step = 1;
    el.value = id === "ymin" ? ymin : ymax;
  }
  document.getElementById("yminv").textContent = "from " + ymin;
  document.getElementById("ymaxv").textContent = "to " + ymax;
  document.getElementById("total").textContent = stats.total.toLocaleString();

  await mapReady;

  map.addSource("pts", {
    type: "vector",
    url: "pmtiles://" + new URL(TILES_URL, location.href).href,
    attribution: "Data © Wikipedia / Wikidata contributors",
  });

  map.addLayer({
    id: "pts-heat",
    type: "heatmap",
    source: "pts",
    "source-layer": SOURCE_LAYER,
    maxzoom: 5,
    paint: {
      "heatmap-weight": ["interpolate", ["linear"], ["log10", ["+", 1, ["get", "v"]]],
        0, 0.15, 3, 0.5, 6, 1.0],
      "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 0.6, 5, 1.8],
      "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 2, 5, 16],
      "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 3.5, 0.85, 5, 0.35],
      "heatmap-color": [
        "interpolate", ["linear"], ["heatmap-density"],
        0, "rgba(255,255,255,0)",
        0.15, "#fff2b3",
        0.35, "#ffce54",
        0.55, "#f6a13c",
        0.75, "#e8703a",
        0.9, "#d1462a",
        1.0, "#b0311c",
      ],
    },
  });

  map.addLayer({
    id: "pts-circ",
    type: "circle",
    source: "pts",
    "source-layer": SOURCE_LAYER,
    minzoom: 3,
    paint: {
      // Radius scales with popularity (log of last-month views) and grows with zoom.
      "circle-radius": ["interpolate", ["linear"], ["zoom"],
        4, ["interpolate", ["linear"], ["log10", ["+", 1, ["get", "v"]]], 0, 1.4, 3, 2.6, 5, 4.5, 7, 7],
        12, ["interpolate", ["linear"], ["log10", ["+", 1, ["get", "v"]]], 0, 2.5, 3, 5, 5, 9, 7, 15]],
      // Color = "heat" (Turbo) scale on log10 of last-month views: cool = few reads,
      // hot = many. Size still encodes views too.
      "circle-color": ["interpolate", ["linear"], ["log10", ["+", 1, ["get", "v"]]],
        0, "#30123b",
        1, "#4675ed",
        2, "#1bcfd4",
        3, "#61fc6c",
        4, "#d1e935",
        5, "#fe9b2d",
        6, "#e14016",
        7, "#7a0403"],
      "circle-opacity": ["interpolate", ["linear"], ["zoom"], 3, 0.75, 8, 0.95],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-opacity": 0.9,
      "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 3, 0.5, 10, 1.4],
    },
  });

  // Highlight the point under the cursor so it's obvious what will open.
  map.addLayer({
    id: "pts-hl",
    type: "circle",
    source: "pts",
    "source-layer": SOURCE_LAYER,
    minzoom: 3,
    filter: ["==", ["get", "wp"], "\u0000"],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 6, 10, 11, 16, 16],
      "circle-color": "#ffcc00",
      "circle-opacity": 0.95,
      "circle-stroke-color": "#7a1908",
      "circle-stroke-width": 2.5,
    },
  });

  // Invisible, generously-sized hit target so points are easy to click.
  // Opacity 0 (not 0.01) so dense overlaps don't accumulate into dark blobs;
  // features are still returned by queryRenderedFeatures for click/hover.
  map.addLayer({
    id: "pts-hit",
    type: "circle",
    source: "pts",
    "source-layer": SOURCE_LAYER,
    minzoom: 3,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 8, 10, 12, 16, 16],
      "circle-color": "#000000",
      "circle-opacity": 0,
    },
  });

  applyFilter();

  // Click a point -> open its Wikipedia article directly in a new tab.
  map.on("click", "pts-hit", (e) => {
    const url = articleUrl(e.features[0].properties);
    if (url) window.open(url, "_blank", "noopener");
  });

  // Hover tooltip + highlight so points are discoverable and clearly clickable.
  const hover = new maplibregl.Popup({
    closeButton: false, closeOnClick: false, offset: 12, className: "hover-pop",
  });
  map.on("mousemove", "pts-hit", (e) => {
    map.getCanvas().style.cursor = "pointer";
    const p = e.features[0].properties;
    map.setFilter("pts-hl", ["all", currentFilter(), ["==", ["get", "wp"], p.wp || "\u0000"]]);
    const v = +p.v || 0;
    const viewsLine = `<br><span class="pop-views">${v.toLocaleString()} views · Jun 2026</span>`;
    hover.setLngLat(e.lngLat).setHTML(
      `<span class="pop-title">${esc(articleTitle(p))}</span>${viewsLine}<br>` +
      `<span class="pop-meta">${esc(p.lang)}${p.year > 0 ? " · " + p.year : ""} · ` +
      `<span class="pop-cta">click to open ↗</span></span>`
    ).addTo(map);
  });
  map.on("mouseleave", "pts-hit", () => {
    map.getCanvas().style.cursor = "";
    map.setFilter("pts-hl", ["==", ["get", "wp"], "\u0000"]);
    hover.remove();
  });

  loadingEl.style.display = "none";

  // Wire controls.
  sel.addEventListener("change", (e) => { state.lang = e.target.value; applyFilter(); });
  document.querySelectorAll("#src button").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll("#src button").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      state.src = +b.dataset.src;
      applyFilter();
    });
  });
  const yminEl = document.getElementById("ymin"), ymaxEl = document.getElementById("ymax");
  yminEl.addEventListener("input", () => {
    state.ymin = Math.min(+yminEl.value, +ymaxEl.value);
    yminEl.value = state.ymin;
    document.getElementById("yminv").textContent = "from " + state.ymin;
    applyFilter();
  });
  ymaxEl.addEventListener("input", () => {
    state.ymax = Math.max(+ymaxEl.value, +yminEl.value);
    ymaxEl.value = state.ymax;
    document.getElementById("ymaxv").textContent = "to " + state.ymax;
    applyFilter();
  });
}

init();
