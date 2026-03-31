# BOM Radar Card

A Home Assistant custom card that displays **native Australian Bureau of Meteorology rain radar** — the same data that powers [bom.gov.au](https://www.bom.gov.au).

This is the **first and only** HA card that uses BOM's new WMTS API (launched with the redesigned bom.gov.au in 2025). All previous BOM radar cards relied on the old `api.weather.bom.gov.au` API which has been discontinued.

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)](https://github.com/hacs/integration)
[![GitHub Release](https://img.shields.io/github/v/release/AshtonAU/bom-radar-card)](https://github.com/AshtonAU/bom-radar-card/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub Sponsors](https://img.shields.io/badge/Sponsor-GitHub%20Sponsors-ea4aaa?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/AshtonAU)
[![Buy Me a Coffee](https://img.shields.io/badge/Support-Buy%20Me%20a%20Coffee-FFDD00?logo=buymeacoffee&logoColor=000000)](https://buymeacoffee.com/ashtonau)

Current release: **v1.4.0**

> [!IMPORTANT]
> If you previously installed another BOM radar card, remove its HACS entry and dashboard resource before adding this one. Home Assistant can keep multiple similarly named Lovelace resources loaded at the same time, which can cause broken or unpredictable behaviour. After switching cards, do a hard refresh / clear browser cache so the new resource is actually loaded.

## Feedback

- Use [GitHub Discussions](https://github.com/AshtonAU/bom-radar-card/discussions) for general feedback, setup questions, ideas, and screenshots.
- Use [GitHub Issues](https://github.com/AshtonAU/bom-radar-card/issues) for reproducible bugs and concrete feature requests.

## Support The Project

If the card saves you time and you want to support ongoing maintenance, you can use [GitHub Sponsors](https://github.com/sponsors/AshtonAU) or [Buy Me a Coffee](https://buymeacoffee.com/ashtonau).

## Features

- **Native BOM data** — Direct from `api.bom.gov.au` WMTS tiles, not RainViewer or any third-party reprocessing
- **1km resolution** radar imagery at max zoom
- **Interactive map** — Zoom, pan, powered by Leaflet.js
- **Animated timeline** — Up to 9 frames (45 minutes) of radar history with play/pause and scrubbing
- **Multiple radar layers** — Rain rate, reflectivity, 1hr/24hr accumulation
- **Optional in-card layer switcher** — Let users change radar layers directly from the map
- **Radar legend** — BOM-style colour legend for rain rate and reflectivity layers
- **Toggleable chrome** — Show or hide the playback bar, legend, zoom, recenter button, layer switcher, badge, marker, and attribution
- **Dark theme** — CartoDB Dark Matter basemap with labels rendered above radar for readability
- **Pulsing home marker** — Shows your location on the map
- **GUI editor** — Full visual configuration with toggle switches
- **Auto-refresh** — Updates every 5 minutes matching BOM's update cycle
- **No API key required** — Uses BOM's publicly accessible WMTS endpoint
- **Configurable opacity** — Adjust radar overlay transparency

## How It Works

The card reads BOM's published WMTS time dimension and loads 256x256 PNG radar tiles as overlays on an interactive dark map. The basemap is split into layers — base tiles below radar, labels above — so place names are always readable through the radar overlay.

**Data flow:**
1. Read the latest published timestamps from BOM's WMTS capabilities
2. Load PNG radar tiles for each timestamp at the current map view
3. Animate through frames with frosted-glass timeline controls
4. Auto-refresh every 5 minutes

## Installation

### HACS (Recommended)

1. Open HACS in Home Assistant
2. Click the three dots menu → **Custom repositories**
3. Add `https://github.com/AshtonAU/bom-radar-card` with category **Dashboard**
4. Search for "BOM Radar Card" and install
5. Clear browser cache / hard refresh

### Manual

1. Download `bom-radar-card.js` from the [latest release](https://github.com/AshtonAU/bom-radar-card/releases) (`v1.4.0` at the time of writing)
2. Copy to `/config/www/bom-radar-card/bom-radar-card.js`
3. Add resource: **Settings → Dashboards → Resources → Add** `/local/bom-radar-card/bom-radar-card.js` (JavaScript Module)

## Configuration

Add the card to your dashboard:

```yaml
type: custom:bom-radar-card
```

That's it — it will use your Home Assistant location as the default center.

### Full Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `layer` | string | `rain_rate` | Radar layer (see table below) |
| `center_latitude` | number | HA config | Map center latitude |
| `center_longitude` | number | HA config | Map center longitude |
| `zoom_level` | number | `6` | Map zoom level (3–12). Levels 9–12 overzoom native radar for a closer city view |
| `map_height` | number | `300` | Card height in pixels |
| `radar_opacity` | number | `0.7` | Radar overlay opacity (0.1–1.0) |
| `frame_count` | number | `9` | Number of animation frames (1–9) |
| `frame_delay` | number | `500` | Animation speed in milliseconds |
| `restart_delay` | number | `1500` | Pause at end of loop in milliseconds |
| `show_marker` | boolean | `true` | Show home location marker |
| `marker_latitude` | number | center | Marker latitude |
| `marker_longitude` | number | center | Marker longitude |
| `show_zoom` | boolean | `true` | Show zoom controls |
| `show_recenter` | boolean | `true` | Show recenter button for home location |
| `show_layer_switcher` | boolean | `true` | Show in-card layer switcher button |
| `show_playback` | boolean | `true` | Show timeline controls |
| `show_legend` | boolean | `true` | Show BOM-style legend for rain rate and reflectivity layers |
| `square_style` | boolean | `false` | Use square corners for the card chrome and controls |
| `show_layer_label` | boolean | `false` | Show layer name badge |
| `show_attribution` | boolean | `true` | Show map attribution |
| `dark_basemap` | boolean | `true` | Use dark map theme |

### Example

```yaml
type: custom:bom-radar-card
center_latitude: -33.87
center_longitude: 151.21
zoom_level: 7
layer: rain_rate
map_height: 350
frame_delay: 400
radar_opacity: 0.7
dark_basemap: true
show_marker: true
show_layer_switcher: true
square_style: false
```

## Available Radar Layers

| Layer ID | Description | Update Frequency |
|----------|-------------|-----------------|
| `rain_rate` | Rain rate in mm/h (default) | Every 5 minutes |
| `accumulation_1hr` | Estimated 1-hour rainfall accumulation | Every 5 minutes |
| `accumulation_24hr` | 24-hour rainfall accumulation | Daily |
| `reflectivity` | Raw radar reflectivity in dBZ | Every 5 minutes |

`show_legend` currently applies to the rain rate and reflectivity layers, where BOM exposes a qualitative rain-intensity legend. Accumulation layers continue to render without a legend for now. All of the map chrome is optional, so you can build a very minimal card by turning off the controls you do not want, including the layer switcher, layer badge, zoom controls, recenter button, playback bar, and attribution.

## Why Not RainViewer?

The popular `weather-radar-card` uses RainViewer, which reprocesses BOM data with lower fidelity and additional latency. This card fetches **directly from BOM's own tile server** — the same source that powers bom.gov.au — giving you:

- **Higher resolution** (1km native vs RainViewer's interpolated data)
- **Lower latency** (direct from BOM, no third-party processing delay)
- **More data layers** (reflectivity, accumulation — not just rain rate)
- **Australian-optimized** (correct map bounds, coverage, and tile grid)

## Technical Details

- **Data source**: BOM WMTS at `api.bom.gov.au`
- **Tile format**: 256×256 PNG with transparency
- **Projection**: Custom Australian-extent TileMatrixSet based on EPSG:3857
- **Max zoom**: Level 12 display, with native radar imagery through level 8 and overzoom above that
- **Map library**: Leaflet.js 1.9.4 (loaded from CDN)
- **Basemap**: CartoDB Dark Matter / Voyager (split labels-over-radar)
- **Update cycle**: 5 minutes (matching BOM's data refresh)
- **Bundle size**: ~25KB minified

## Credits

- Radar data: [Bureau of Meteorology](http://www.bom.gov.au) (Commonwealth of Australia)
- Basemap: [CARTO](https://carto.com/)
- Map library: [Leaflet.js](https://leafletjs.com/)

## License

MIT License — see [LICENSE](LICENSE) for details.

Radar data is provided by the Australian Bureau of Meteorology. Use is subject to BOM's [copyright notice](http://www.bom.gov.au/other/copyright.shtml).
