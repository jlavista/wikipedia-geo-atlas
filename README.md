# Wikipedia Geotag Atlas — web visualizer

A client-side, static-hostable map of geotagged Wikipedia articles. All rendering
and filtering run in the browser (MapLibre GL JS) reading a single **PMTiles**
vector-tile archive over HTTP range requests — so the browser only downloads the
tiles for the current viewport. No server, build step, or API key required.

## What's here

```
web/
  index.html          UI shell (editorial dark theme)
  app.js              MapLibre map, heatmap + point layers, filters, pmtiles:// source
  serve_range.py      local static server WITH HTTP Range support (for preview)
  vendor/
    maplibre-gl.js/.css   MapLibre GL JS (vendored — no CDN dependency)
    pmtiles.js            PMTiles protocol for MapLibre (vendored)
  tiles/
    world.pmtiles         the vector-tile archive (built by ../build_pmtiles_py.py)
    world.stats.json      sidecar: total count, year range, per-language counts
```

The only remaining external dependency at runtime is the basemap: the free, keyless
[OpenFreeMap](https://openfreemap.org) Positron vector style (`BASEMAP_STYLE` in
`app.js`). CARTO basemaps were used originally but now require an API key (keyless
requests return "API KEY REQUIRED" tiles).

## Preview locally

PMTiles needs HTTP **range requests**. Python's `http.server` does **not** support
them, so use the bundled range-capable server:

```powershell
cd web
python serve_range.py 8000
```

Open http://localhost:8000  (do not open index.html via file:// — `fetch` and range
requests need http). GitHub Pages supports range requests natively, so no special
server is needed in production.

Filters: language edition, coordinate source (wikitext / Wikidata), and creation-year
range. Low zoom shows an inferno-style density heatmap; zoom past level 4 shows
individual points; click a point for its language, source, and year.

## Build / resize the tiles

Tiles are built in **pure Python** (no tippecanoe / Node / Docker) by
`../build_pmtiles_py.py`, which streams `results/geo_all_languages_clean.jsonl`,
bins points into web-mercator tiles per zoom with a per-tile cap (level-of-detail),
and packs a single `.pmtiles` plus a `.stats.json` sidecar.

```powershell
cd ..
# 100k representative demo (reservoir-sampled across the whole corpus):
python build_pmtiles_py.py --sample 100000 --maxzoom 8 --cap 4000 --out web\tiles\world.pmtiles

# full corpus (all 21.3M records):
python build_pmtiles_py.py --maxzoom 8 --cap 4000 --out web\tiles\world.pmtiles

# quick English-only smoke test (first N lines, no full scan):
python build_pmtiles_py.py --limit 300000 --maxzoom 6 --out web\tiles\world.pmtiles
```

Key flags:

- `--sample N` — uniform reservoir sample of N points across the whole file (one
  streaming pass; representative of all languages/regions). Omit to use every point.
- `--maxzoom` — deepest zoom level tiled. Higher = more points visible when zoomed
  in, larger file. `8` is a good world-overview default.
- `--cap` — max points kept per tile (level-of-detail). Low-zoom tiles hold a
  representative subsample; detail fills in as tiles subdivide.

The client reads `tiles/world.pmtiles` + `tiles/world.stats.json` by default (see the
`TILES_URL` / `STATS_URL` constants at the top of `app.js`).

## Sizing / hosting on GitHub Pages

| build | file size | fits Pages (<100 MB/file)? |
|-------|-----------|-----------------------------|
| `--sample 100000 --maxzoom 8` | ~6 MB | yes |
| `--sample 1000000 --maxzoom 8` | ~84 MB | yes (tight) |
| full corpus `--maxzoom 8` | exceeds 100 MB | needs Release/R2 |

> Each point carries its exact article URL path (`wp` property) so popups link to
> the real Wikipedia article. Those strings dominate the file size — roughly 3× vs
> geometry-only — so the point budget for a single Pages-hosted file is ~1.1M.

Deploy:

1. Commit the `web/` folder (including `tiles/world.pmtiles`).
2. Repo **Settings → Pages**, point at the `web/` folder on your default branch (or a
   `gh-pages` branch containing the contents of `web/`).
3. If a higher-zoom full build exceeds the 100 MB per-file limit, host
   `world.pmtiles` as a **GitHub Release asset** (2 GB, supports range requests) or on
   **Cloudflare R2** (set CORS to allow your Pages origin), and change `TILES_URL` in
   `app.js` to that absolute URL (`pmtiles://https://YOUR_HOST/world.pmtiles`).

## Notes

- `world.stats.json` drives the language dropdown, totals, and year sliders because a
  capped tileset is a sample — the browser can't count the true totals itself.
- To go bigger than the 100k demo, just re-run `build_pmtiles_py.py` with a larger
  `--sample` (or no `--sample` for the full corpus) and, if needed, a higher
  `--maxzoom`; the client needs no changes.
