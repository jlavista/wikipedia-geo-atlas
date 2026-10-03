# Wikipedia Geotag Atlas

**Live map: https://jlavista.github.io/wikipedia-geo-atlas/**

An interactive map of geotagged **English Wikipedia** articles. Each dot is an
article, sized and coloured by how many people read it in June 2026; click a dot to
open the article. It is a static site — no server, build step, or API key — hosted on
GitHub Pages.

- **Coverage:** English Wikipedia has 1,463,869 geotagged articles in the source data,
  and **1,406,067 (96%) are on the map.** Where points are densest, each tile keeps only
  its 4,000 most-read articles at the deepest zoom level (8), so 57,802 rarely read
  articles are not drawn.
- **Filters:** coordinate source (article wikitext or Wikidata) and creation year.
- **Data:** the full dataset — 21.3 million geotagged articles from 355 language
  editions, with June 2026 pageviews — is on Hugging Face:
  [jlavista/wikipedia-geo-atlas](https://huggingface.co/datasets/jlavista/wikipedia-geo-atlas).
- **Background:** built for a study of the Global North/South imbalance in Wikipedia
  geotags (manuscript in preparation).

## How it works

[MapLibre GL JS](https://maplibre.org) draws the map in the browser. The points come
from a single [PMTiles](https://github.com/protomaps/PMTiles) vector-tile archive
(`tiles/world.pmtiles`, 90 MB) read with HTTP range requests, so the browser downloads
only the tiles in view.

- **Basemap:** the free, keyless [OpenFreeMap](https://openfreemap.org) Positron style
  (`BASEMAP_STYLE` in `app.js`). CARTO basemaps were used originally, but they now
  require an API key.
- **Layers:** a heatmap up to zoom 5; from zoom 3, individual dots coloured with the
  Turbo palette by log pageviews and sized by pageviews.
- **Tile properties:** `lang`, `src` (0 = wikitext, 1 = Wikidata), `year` (creation
  year), `wp` (article path; the link is `https://{lang}.wikipedia.org/wiki/{wp}`) and
  `v` (June 2026 human pageviews). `app.js` also accepts `url` + `title` instead of `wp`.

```
index.html               page, controls and legend
app.js                   map, layers, filters, popups
serve_range.py           local preview server with HTTP Range support
tiles/world.pmtiles      vector tiles, zoom 0–8
tiles/world.stats.json   totals and year range shown in the panel
vendor/                  MapLibre GL JS 4.7.1 and pmtiles.js 4.5.0 (no CDN dependency)
```

## Preview locally

PMTiles needs HTTP range requests, which Python's built-in `http.server` doesn't
support. Use the bundled server:

```powershell
python serve_range.py 8000
```

Then open http://localhost:8000 (not `file://`). GitHub Pages supports range requests,
so production needs nothing special.

## How the tiles were built

The tiles were built from the cleaned corpus behind the Hugging Face dataset with
`build_pmtiles_py.py` from the companion analysis code (pure Python, no tippecanoe;
not yet public):

```powershell
python build_pmtiles_py.py --only en --views results\pageviews_202606.tsv --maxzoom 8 --cap 4000 --out web\tiles\world.pmtiles
```

- `--only en`: English Wikipedia only.
- `--views`: June 2026 pageviews per article; when a tile is full, the most-read
  articles are kept.
- `--maxzoom 8 --cap 4000`: deepest zoom level and maximum points per tile.

GitHub Pages rejects files over 100 MB. Storing each article's path (`wp`) keeps the
archive at about 90 MB; storing the full URL and title instead makes it about 139 MB.

## License

Code and data in this repository are released under [CC BY-SA 4.0](LICENSE), except
the third-party libraries in `vendor/`, which keep their own BSD-3-Clause licenses
(`vendor/LICENSE-maplibre.txt`, `vendor/LICENSE-pmtiles.txt`).

Article titles, links and coordinates come from Wikipedia (© Wikipedia contributors,
CC BY-SA 4.0) and Wikidata (CC0); pageviews come from Wikimedia's public pageview
statistics. Basemap © OpenFreeMap, OpenMapTiles and OpenStreetMap contributors.
