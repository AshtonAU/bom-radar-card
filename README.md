# BOM Radar Card

Home Assistant custom card for **native Australian Bureau of Meteorology radar and weather map layers**, built on BOM's current WMTS platform and using the same public map stack that powers [bom.gov.au](https://www.bom.gov.au).

This card exists as a modern replacement for older Home Assistant BOM radar cards that depended on the discontinued `api.weather.bom.gov.au` stack.

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)](https://github.com/hacs/integration)
[![Open your Home Assistant instance and open this repository in HACS.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=AshtonAU&repository=bom-radar-card&category=plugin)
[![GitHub Release](https://img.shields.io/github/v/release/AshtonAU/bom-radar-card)](https://github.com/AshtonAU/bom-radar-card/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub Sponsors](https://img.shields.io/badge/Sponsor-GitHub%20Sponsors-ea4aaa?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/AshtonAU)
[![Buy Me a Coffee](https://img.shields.io/badge/Support-Buy%20Me%20a%20Coffee-FFDD00?logo=buymeacoffee&logoColor=000000)](https://buymeacoffee.com/ashtonau)

Current release: **v1.6.0**

> [!IMPORTANT]
> If you previously installed another BOM radar card, remove its HACS entry and dashboard resource before adding this one. Home Assistant can keep multiple similarly named Lovelace resources loaded at the same time, which can cause broken or unpredictable behaviour. After switching cards, do a hard refresh / clear browser cache so the new resource is actually loaded.

## Feedback

- Use [GitHub Discussions](https://github.com/AshtonAU/bom-radar-card/discussions) for general feedback, setup questions, ideas, and screenshots.
- Use [GitHub Issues](https://github.com/AshtonAU/bom-radar-card/issues) for reproducible bugs and concrete feature requests.

## Support The Project

If the card saves you time and you want to support ongoing maintenance, you can use [GitHub Sponsors](https://github.com/sponsors/AshtonAU) or [Buy Me a Coffee](https://buymeacoffee.com/ashtonau).

## Highlights

- **Native BOM WMTS tiles** from `api.bom.gov.au`, with no API key required
- **Interactive map and animation** with zoom, pan, play/pause, scrubbing, and automatic refresh
- **Broad BOM layer support** including observed rain, forecast rain, wind, waves, temperature, humidity, UV, thunderstorms, and fog
- **In-card layer switcher** so people can move between available layers without reconfiguring the card
- **Built-in radar legend** for rain rate and reflectivity layers
- **Configurable presentation** with toggles for playback, legend, zoom, recenter, layer switcher, marker, attribution, and more
- **Readable split-label basemap** so suburb and city names stay visible through the weather overlays
- **Visual editor support** for normal day-to-day configuration in Home Assistant

## How It Works

The card reads BOM's published WMTS time dimension and loads 256x256 PNG tiles as map overlays. The basemap is split into base tiles underneath the weather overlay and labels above it so suburb and city names stay readable.

**Data flow:**
1. Read the latest published timestamps from BOM's WMTS capabilities
2. Load PNG tiles for each timestamp at the current map view
3. Animate through frames using the built-in playback controls
4. Auto-refresh periodically so the card stays aligned with BOM updates

## Installation

### HACS (Recommended)

1. Open HACS in Home Assistant
2. Open the three dots menu and choose **Custom repositories**
3. Add `https://github.com/AshtonAU/bom-radar-card` with category **Dashboard**
4. Search for `BOM Radar Card` and install it
5. Hard refresh your browser after installation

### Manual

1. Download `bom-radar-card.js` from the [latest release](https://github.com/AshtonAU/bom-radar-card/releases) (`v1.6.0` at the time of writing)
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
| `layer` | string | `reflectivity` | BOM layer (see table below) |
| `center_latitude` | number | HA config | Map center latitude |
| `center_longitude` | number | HA config | Map center longitude |
| `zoom_level` | number | `7` | Map zoom level (3–8). Capped to BOM's native WMTS zoom range for cleaner layer alignment |
| `map_height` | number | `300` | Card height in pixels |
| `basemap_provider` | string | `carto` | Basemap provider: `carto`, `stadia`, or `esri` |
| `basemap_style` | string | provider default | Basemap style for the selected provider |
| `basemap_api_key` | string | none | Optional provider API key. Not used for CARTO |
| `radar_opacity` | number | `0.7` | Weather overlay opacity (0.1–1.0) |
| `frame_count` | number | `9` | Number of animation frames (1–9) |
| `frame_delay` | number | `500` | Animation speed in milliseconds |
| `restart_delay` | number | `1500` | Pause at end of loop in milliseconds |
| `enabled_layers` | list | all layers | Restrict which BOM layers appear in the in-card layer switcher |
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
| `dark_basemap` | boolean | `true` | Legacy fallback for dark/light defaults. Still supported |

### Example

```yaml
type: custom:bom-radar-card
center_latitude: -33.87
center_longitude: 151.21
zoom_level: 7
layer: reflectivity
map_height: 350
basemap_provider: carto
basemap_style: dark
frame_delay: 400
radar_opacity: 0.7
show_marker: true
show_layer_switcher: true
square_style: false
```

### Basemap Providers

- `carto`: default option, no API key required
- `stadia`: optional styles including smoother road/terrain maps and satellite imagery
- `esri`: optional imagery/topographic styles

`basemap_api_key` is optional in the config, but Stadia Maps and Esri may require a valid key depending on the selected style and the environment the card is hosted from.

Both Stadia Maps and Esri offer free-tier access, but the exact limits and which styles are included can vary by provider plan. CARTO remains the safest no-key default.

### Limiting The Layer Switcher

If you want the in-card layer switcher to show only a smaller curated set, use `enabled_layers`:

```yaml
type: custom:bom-radar-card
layer: reflectivity
enabled_layers:
  - reflectivity
  - rain_rate
  - accumulation_1hr
  - wind_speed_kmh
  - air_temperature
```

## Available BOM Layers

| Layer ID | Category | Description |
|----------|----------|-------------|
| `rain_rate` | Rain / observed | Rain rate in mm/h |
| `accumulation_1hr` | Rain / observed | Estimated 1-hour rainfall accumulation |
| `accumulation_24hr` | Rain / observed | Accumulated 24-hour rainfall total |
| `reflectivity` | Rain / observed | Raw radar reflectivity in dBZ (default) |
| `forecast_rain_50pct_3hr` | Rain / forecast | 50% chance forecast rain amount, 3-hourly |
| `forecast_rain_50pct_daily` | Rain / forecast | 50% chance forecast rain amount, daily |
| `forecast_rain_25pct_3hr` | Rain / forecast | 25% chance forecast rain amount, 3-hourly |
| `forecast_rain_25pct_daily` | Rain / forecast | 25% chance forecast rain amount, daily |
| `forecast_rain_10pct_3hr` | Rain / forecast | 10% chance forecast rain amount, 3-hourly |
| `forecast_rain_10pct_daily` | Rain / forecast | 10% chance forecast rain amount, daily |
| `forecast_rain_chance_3hr` | Rain / forecast | Chance of at least 0.2 mm, 3-hourly |
| `forecast_rain_chance_daily` | Rain / forecast | Chance of at least 0.2 mm, daily |
| `wind_speed_kmh` | Wind | Wind speed in km/h |
| `wind_speed_kt` | Wind | Wind speed in knots |
| `wind_direction` | Wind | Wind direction |
| `wave_total_height` | Waves | Total wave height |
| `swell_1_height` | Waves | Swell 1 height |
| `swell_1_direction` | Waves | Swell 1 direction |
| `swell_2_height` | Waves | Swell 2 height |
| `swell_2_direction` | Waves | Swell 2 direction |
| `wind_wave_height` | Waves | Wind wave height |
| `air_temperature` | Temperature | Air temperature |
| `feels_like` | Temperature | Feels like temperature |
| `temperature_max_daily` | Temperature | Daytime maximum temperature |
| `temperature_min_daily` | Temperature | Overnight minimum temperature |
| `heatwave_severity` | Temperature | Heatwave severity |
| `relative_humidity` | Humidity & UV | Relative humidity |
| `dew_point` | Humidity & UV | Dew point temperature |
| `uv_index` | Humidity & UV | UV Index |
| `thunderstorms` | Significant weather | Thunderstorm overlay |
| `fog` | Significant weather | Fog overlay |

`show_legend` currently applies to the rain rate and reflectivity layers, where BOM exposes a qualitative rain-intensity legend. Forecast, accumulation, wind, waves, temperature, humidity, UV, and significant-weather layers still render without an inline legend for now.

Observed radar layers animate backward through the latest published past timestamps. Forecast and daily layers start from the earliest available current/forward timestamp and advance through BOM's published forecast horizon.

All of the card chrome is optional, so you can keep the full interactive layout or strip it back to a much cleaner map by disabling things like the layer switcher, layer badge, zoom controls, recenter button, playback bar, and attribution.

## Why Not RainViewer?

The popular `weather-radar-card` uses RainViewer, which reprocesses BOM data and adds another layer between Home Assistant and the original source. This card pulls **directly from BOM's own tile service** instead, which means:

- **Higher fidelity radar imagery**
- **Less delay between BOM updates and what you see**
- **More BOM-native layers**, including reflectivity, observed rainfall, forecast rain, wind, waves, temperature, humidity, and UV
- **Australian-specific bounds and tile handling** instead of a generic global weather view

## Technical Details

- **Data source**: BOM WMTS at `api.bom.gov.au`
- **Tile format**: 256×256 PNG with transparency
- **Projection**: BOM's Australian-extent WMTS TileMatrixSets based on EPSG:3857
- **Max zoom**: Level 8 display, matching BOM's native WMTS tile matrix range
- **Map library**: Leaflet.js 1.9.4 (loaded from CDN)
- **Basemap**: CARTO Dark Matter / Voyager split into base and labels layers
- **Update cycle**: 5 minutes
- **Bundle size**: ~25KB minified

## Credits

- Radar data: [Bureau of Meteorology](http://www.bom.gov.au) (Commonwealth of Australia)
- Basemap: [CARTO](https://carto.com/)
- Map library: [Leaflet.js](https://leafletjs.com/)

## License

MIT License — see [LICENSE](LICENSE) for details.

Radar data is provided by the Australian Bureau of Meteorology. Use is subject to BOM's [copyright notice](http://www.bom.gov.au/other/copyright.shtml).
