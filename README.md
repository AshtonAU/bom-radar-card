# BOM Radar Card

Home Assistant custom card for **native Australian Bureau of Meteorology radar and weather map layers**, built on BOM's current WMTS platform and using the same public map stack that powers [bom.gov.au](https://www.bom.gov.au).

This card exists as a modern replacement for older Home Assistant BOM radar cards that depended on the discontinued `api.weather.bom.gov.au` stack.

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)](https://github.com/hacs/integration)
[![Open your Home Assistant instance and open this repository in HACS.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=AshtonAU&repository=bom-radar-card&category=plugin)
[![GitHub Release](https://img.shields.io/github/v/release/AshtonAU/bom-radar-card)](https://github.com/AshtonAU/bom-radar-card/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub Sponsors](https://img.shields.io/badge/Sponsor-GitHub%20Sponsors-ea4aaa?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/AshtonAU)
[![Buy Me a Coffee](https://img.shields.io/badge/Support-Buy%20Me%20a%20Coffee-FFDD00?logo=buymeacoffee&logoColor=000000)](https://buymeacoffee.com/ashtonau)

Current release: **v1.6.4**

> [!IMPORTANT]
> If you previously installed another BOM radar card, remove its HACS entry and dashboard resource before adding this one. Home Assistant can keep multiple similarly named Lovelace resources loaded at the same time, which can cause broken or unpredictable behaviour. After switching cards, do a hard refresh / clear browser cache so the new resource is actually loaded.

## Feedback

- Use [GitHub Discussions](https://github.com/AshtonAU/bom-radar-card/discussions) for general feedback, setup questions, ideas, and screenshots.
- Use [GitHub Issues](https://github.com/AshtonAU/bom-radar-card/issues) for reproducible bugs and concrete feature requests.
- See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution/reporting guidance.
- See [SECURITY.md](SECURITY.md) before posting anything sensitive publicly.

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

The card uses BOM's WMTS time-series tile service and loads 256x256 PNG tiles as map overlays. It first tries BOM's published WMTS time dimension, then falls back to per-layer generated timestamps if the capabilities response is unavailable, stale, or slow. The basemap is split into base tiles underneath the weather overlay and labels above it so suburb and city names stay readable.

**Data flow:**
1. Try to read recent published timestamps from BOM's WMTS capabilities
2. Reject stale or stalled capability data and generate current layer timestamps when needed
3. Load PNG tiles for each selected timestamp at the current map view
4. Animate through frames using the built-in playback controls
5. Auto-refresh periodically so the card stays aligned with BOM updates

## Installation

### HACS (Recommended)

1. Open HACS in Home Assistant
2. Open the three dots menu and choose **Custom repositories**
3. Add `https://github.com/AshtonAU/bom-radar-card` with category **Dashboard**
4. Search for `BOM Radar Card` and install it
5. Hard refresh your browser after installation

### Manual

1. Download `bom-radar-card.js` from the [latest release](https://github.com/AshtonAU/bom-radar-card/releases) (`v1.6.4` at the time of writing)
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
| `zoom_level` | number | `7` | Map zoom level. Default range is 3–8, or 3–10 when `allow_overzoom` is enabled |
| `map_height` | number | `300` | Card height in pixels |
| `allow_overzoom` | boolean | `false` | Experimental closer-view mode. Allows display zoom up to 10 by scaling BOM's native z8 radar tiles |
| `basemap_provider` | string | `carto` | Basemap provider: `carto`, `stadia`, or `esri` |
| `basemap_style` | string | provider default | Basemap style for the selected provider |
| `basemap_api_key` | string | none | Optional provider API key. Not used for CARTO |
| `radar_opacity` | number | `0.7` | Weather overlay opacity (0.1–1.0) |
| `chrome_opacity` | number | `1.0` | Opacity of the card chrome: controls, playback bar, layer badge, and panels |
| `accent_color` | string | neutral UI default | Optional custom UI accent color for playback/progress/focus highlights |
| `location_color` | string | HA accent | Optional custom GPS/home marker color |
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
chrome_opacity: 0.9
show_marker: true
show_layer_switcher: true
square_style: false
```

### Optional Overzoom

If you want a closer local view without waiting for a separate local-radar mode, you can enable experimental overzoom:

```yaml
type: custom:bom-radar-card
layer: reflectivity
zoom_level: 10
allow_overzoom: true
```

This does **not** add extra native BOM radar detail. It simply allows the card to scale BOM's native `z8` radar tiles up to a display zoom of `10`, which can be useful for local inspection but may look softer than BOM's dedicated local `64 km / 128 km` radar products.

### Basemap Providers

- `carto`: default option, no API key required
- `stadia`: optional styles including smoother road/terrain maps and satellite imagery
- `esri`: optional imagery/topographic styles

`basemap_api_key` is optional in the config, but Stadia Maps and Esri may require a valid key depending on the selected style and the environment the card is hosted from.

Both Stadia Maps and Esri offer free-tier access, but the exact limits and which styles are included can vary by provider plan. CARTO remains the safest no-key default.

Important notes:

- `localhost` testing is not the same thing as a normal Home Assistant install on a LAN hostname or IP. A provider that appears keyless in local testing may still require a key for real users.
- Stadia Maps authentication requirements vary by host setup, and some styles may be plan-dependent.
- Esri also has an authenticated API-key path for their modern basemap services, even if some legacy tile endpoints appear to work anonymously.
- If Stadia styles fail with an auth or tile-loading error in Home Assistant, the first thing to try is adding a real key or configuring Stadia domain auth for your HA URL.

### Getting Basemap Provider Keys

`carto` does not need a key.

For `stadia` and `esri`, the card uses the single `basemap_api_key` field. Only the currently selected provider uses that key.

#### Stadia Maps

Use this if the Stadia styles error in Home Assistant, or if your card is being served from a LAN IP / hostname / domain instead of `localhost`.

1. Create a free Stadia Maps account.
2. Open the Stadia client dashboard and select the property/site you want to use.
3. Under authentication settings, either:
   - generate an API key, or
   - configure domain-based authentication for your Home Assistant URL
4. Paste the API key into `basemap_api_key` if you are using key auth.

Helpful links:

- [Authentication docs](https://docs.stadiamaps.com/authentication/)
- [Client dashboard](https://client.stadiamaps.com/)
- [Pricing](https://stadiamaps.com/pricing/)

#### Esri / ArcGIS

Use this if you want the Esri styles to work consistently with an authenticated setup.

1. Create an ArcGIS Location Platform or ArcGIS Online account.
2. Create API key credentials using Esri's current API key flow.
3. Generate an API key with basemap access.
4. Paste that API key into `basemap_api_key`.

Helpful links:

- [API keys and security](https://developers.arcgis.com/documentation/security-and-authentication/api-key-authentication/)
- [Create an API key tutorial](https://developers.arcgis.com/documentation/security-and-authentication/api-key-authentication/tutorials/create-an-api-key/online/)
- [Basemap Styles service](https://developers.arcgis.com/rest/basemap-styles/)

Note: Esri legacy API keys are being retired, so use the current API key credentials flow rather than older legacy-key docs.

### UI Polish And Accent Controls

- `chrome_opacity` lets you soften or strengthen the card chrome without affecting the weather overlay itself
- `accent_color` controls the UI highlight color for playback/progress/focus states
- `location_color` controls the GPS/home marker independently from the rest of the UI

By default, the card uses a neutral light UI accent and keeps the location marker tied to your Home Assistant accent color.

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

Observed radar layers animate backward through recent past timestamps. Forecast and daily layers start from the earliest available current/forward timestamp and advance through BOM's forecast horizon.

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
- **Max zoom**: Level 8 by default, or optional display zoom up to 10 with experimental overzoom enabled
- **Map library**: Leaflet.js 1.9.4 (loaded from CDN)
- **Basemap**: CARTO Dark Matter / Voyager split into base and labels layers
- **Update cycle**: 5 minutes
- **Bundle size**: ~60KB minified

## Credits

- Radar data: [Bureau of Meteorology](http://www.bom.gov.au) (Commonwealth of Australia)
- Basemap: [CARTO](https://carto.com/)
- Map library: [Leaflet.js](https://leafletjs.com/)

## License

MIT License — see [LICENSE](LICENSE) for details.

Radar data is provided by the Australian Bureau of Meteorology. Use is subject to BOM's [copyright notice](http://www.bom.gov.au/other/copyright.shtml).
