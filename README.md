# BOM Radar Card

<div align="center">

Native Australian Bureau of Meteorology radar and weather layers for Home Assistant.

[![HACS Custom](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)](https://github.com/hacs/integration)
[![Open in HACS](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=AshtonAU&repository=bom-radar-card&category=plugin)
[![GitHub Release](https://img.shields.io/github/v/release/AshtonAU/bom-radar-card)](https://github.com/AshtonAU/bom-radar-card/releases/latest)
[![CI](https://github.com/AshtonAU/bom-radar-card/actions/workflows/ci.yml/badge.svg)](https://github.com/AshtonAU/bom-radar-card/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Current release: v1.11.0**

</div>

BOM Radar Card is a modern replacement for older Home Assistant radar cards that depended on the discontinued `api.weather.bom.gov.au` stack. It uses BOM's current public WMTS and MapServer services, with an interactive Leaflet map, animation, forecast layers, optional lightning, and a visual editor.

> [!NOTE]
> **v1.11.0 is a reliability and maintenance release.** It keeps existing frame limits and configuration compatible while fixing BOM publication-window edge frames, bundling Leaflet locally, hardening reconnect and lightning lifecycles, and adding an optional radar-coverage overlay. See the [changelog](CHANGELOG.md) for details.

## At a glance

- Native BOM weather tiles from `api.bom.gov.au`
- 34 observed and forecast layers covering rain, wind, waves, temperature, humidity, UV, and significant weather
- Pan, zoom, playback, timeline scrubbing, recentering, and five-minute refreshes
- Built-in layer switcher and rain/reflectivity legend
- BOM-native automatic day/night basemap by default
- Optional BOM reference overlays, CARTO, Stadia Maps, and Esri basemaps
- Optional live lightning from the Home Assistant Blitzortung integration
- Visual editor plus full YAML configuration
- No API key required for BOM data or the BOM and CARTO basemaps

## Contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Common recipes](#common-recipes)
- [Available BOM layers](#available-bom-layers)
- [Basemap providers](#basemap-providers)
- [Layout and sizing](#layout-and-sizing)
- [How it works](#how-it-works)
- [Troubleshooting](#troubleshooting)
- [Support and contributing](#support-and-contributing)

## Installation

### HACS

Use the **Open in HACS** button above, or add the repository manually:

1. Open **HACS** in Home Assistant.
2. Open the three-dot menu and choose **Custom repositories**.
3. Add `https://github.com/AshtonAU/bom-radar-card` as a **Dashboard** repository.
4. Find **BOM Radar Card** and select **Download**.
5. Refresh the Home Assistant page. Use a hard refresh if the old card version remains cached.

### Manual installation

1. Download [bom-radar-card.js](https://github.com/AshtonAU/bom-radar-card/releases/latest/download/bom-radar-card.js) from the latest release.
2. Copy it to `/config/www/bom-radar-card/bom-radar-card.js`.
3. Open **Settings → Dashboards → Resources → Add resource**.
4. Add `/local/bom-radar-card/bom-radar-card.js` as a **JavaScript module**.
5. Refresh the Home Assistant page.

> [!IMPORTANT]
> If you are replacing another BOM radar card, remove its HACS entry and dashboard resource first. Home Assistant can load similarly named Lovelace resources at the same time, which may leave the wrong custom element registered. Hard-refresh the browser after changing resources.

## Quick start

Add the card to a dashboard using the visual editor, or paste this YAML:

```yaml
type: custom:bom-radar-card
```

The minimal YAML card uses your Home Assistant location, BOM's automatic day/night basemap, rain rate, up to nine animation frames, and a 300 px map. Cards created through the visual editor start on radar reflectivity.

A practical customized example:

```yaml
type: custom:bom-radar-card
layer: rain_rate
center_latitude: -33.87
center_longitude: 151.21
zoom_level: 7
map_height: 350
basemap_provider: bom
basemap_style: auto
frame_count: 9
frame_delay: 400
radar_opacity: 0.7
show_marker: true
show_layer_switcher: true
show_playback: true
show_legend: true
```

## Configuration

Most options are available in Home Assistant's visual editor. YAML-only options are marked below.

### Map and data

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `layer` | string | `rain_rate` | Initial BOM layer for minimal YAML. The visual editor starts new cards on `reflectivity`. See [Available BOM layers](#available-bom-layers). |
| `enabled_layers` | list | all layers | Limit the available layers. If `layer` is omitted or excluded, the first enabled layer becomes active. |
| `center_latitude` | number | HA latitude | Map center latitude. |
| `center_longitude` | number | HA longitude | Map center longitude. |
| `zoom_level` | number | `7` | Display zoom from 3–8, or 3–10 with `allow_overzoom`. |
| `map_height` | number | `300` | Map height in pixels. YAML values are capped at 4096 px. |
| `allow_overzoom` | boolean | `false` | Scale BOM's native z8 radar tiles up to display zoom 10. |
| `basemap_provider` | string | `bom` | `bom`, `carto`, `stadia`, or `esri`. |
| `basemap_style` | string | `auto` | Provider style, including automatic day/night switching where supported. |
| `basemap_api_key` | string | none | Optional Stadia Maps or Esri browser key. Stadia can use domain authentication instead; BOM and CARTO do not use this field. |
| `bom_reference_layers` | list | none | Add `state_borders`, `coastal_areas`, `forecast_districts`, `drainage_divisions`, `railways`, or `lakes`. |
| `show_bom_boundaries` | boolean | `false` | Legacy shortcut that adds `state_borders`. |
| `show_radar_coverage` | boolean | `false` | Shade areas outside BOM's radar-network coverage above `rain_rate` or `reflectivity`. It is ignored for other weather layers. |

### Animation and appearance

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `frame_count` | number | `9` | Maximum animation frames, clamped to 1–9. Some daily products provide fewer. |
| `frame_delay` | number | `500` | Delay between frames in milliseconds; minimum 100 ms. |
| `restart_delay` | number | `1500` | Pause on the final frame in milliseconds; minimum 500 ms. |
| `radar_opacity` | number | `0.7` | Weather overlay opacity from 0.1–1.0. |
| `chrome_opacity` | number | `1.0` | Opacity of controls, badges, and panels from 0.2–1.0. |
| `accent_color` | string | neutral | Optional `#RGB` or `#RRGGBB` color for UI highlights. |
| `location_color` | string | HA accent | Optional `#RGB` or `#RRGGBB` color for the location marker. |
| `show_marker` | boolean | `true` | Show the home marker. |
| `marker_latitude` | number | HA latitude | Override the marker latitude without changing the map center. Falls back to the configured center, then Sydney, when HA has no location. |
| `marker_longitude` | number | HA longitude | Override the marker longitude without changing the map center. Falls back to the configured center, then Sydney, when HA has no location. |
| `show_zoom` | boolean | `true` | Show Leaflet zoom controls. |
| `show_recenter` | boolean | `true` | Show the button that recenters on the marker location. |
| `show_layer_switcher` | boolean | `true` | Show the in-card layer switcher. |
| `show_playback` | boolean | `true` | Show playback and timeline controls. |
| `show_legend` | boolean | `true` | Show the rain-rate/reflectivity legend when applicable. |
| `show_layer_label` | boolean | `false` | Show the active layer name. |
| `show_attribution` | boolean | `true` | Show map and data attribution. |
| `square_style` | boolean | `false` | Use square corners for the card and controls. |
| `dark_basemap` | boolean | `true` | Legacy light/dark fallback used when a fixed style is not configured. |

### Lightning

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `show_lightning` | boolean | `true` | Show strikes when the [Blitzortung integration](https://github.com/mrk-its/homeassistant-blitzortung) is installed. |
| `lightning_fade_minutes` | number | `30` | Fade window from 1–120 minutes. |
| `lightning_pulse` | boolean | `true` | Pulse newly seen strikes; disabled when reduced motion is preferred. |
| `lightning_dot_size` | number | `5` | Strike radius from 2–12 px. YAML only. |

Lightning is inert when the Blitzortung integration is not installed. Fresh strikes start white/yellow and fade through amber to dark red before disappearing. The card reads the integration's local Home Assistant entities and makes no direct Blitzortung network request. The separate integration connects Home Assistant server-side to its public MQTT service.

Busy storms can create many short-lived strike entities. To keep their state changes out of Recorder without excluding other `geo_location` integrations, add this [supported entity-glob exclusion](https://www.home-assistant.io/integrations/recorder/#configure-filter) to `configuration.yaml` and restart Home Assistant:

```yaml
recorder:
  exclude:
    entity_globs:
      - geo_location.lightning_strike_*
```

See the integration's [configuration guidance](https://github.com/mrk-its/homeassistant-blitzortung#configuration) for its own setup and limits. Treat lightning as best-effort visual context, not as a safety warning. Lightning data &copy; [Blitzortung.org](https://www.blitzortung.org/).

### Compatibility

Unknown YAML keys are ignored so migrated dashboards continue loading. Use `radar_opacity` for the BOM overlay; keys from other radar cards such as `overlay_transparency` and `show_scale` are not supported.

## Common recipes

<details>
<summary><strong>Automatic day/night basemap</strong></summary>

```yaml
type: custom:bom-radar-card
basemap_provider: bom
basemap_style: auto
```

Automatic mode follows Home Assistant's `sun.sun` state. If that entity is unavailable, `dark_basemap` supplies the fallback.

</details>

<details>
<summary><strong>Radar network coverage</strong></summary>

```yaml
type: custom:bom-radar-card
layer: reflectivity
show_radar_coverage: true
```

The optional overlay uses BOM's published radar-coverage MapServer tiles and
is only shown with rain rate or reflectivity. Dark shading marks areas outside
the radar network's coverage; transparent areas are covered. It is off by
default and does not make runtime metadata requests.

</details>

<details>
<summary><strong>BOM borders and reference overlays</strong></summary>

```yaml
type: custom:bom-radar-card
bom_reference_layers:
  - state_borders
  - forecast_districts
  - coastal_areas
```

These public BOM MapServer layers render above the weather overlay.

</details>

<details>
<summary><strong>Closer view with optional overzoom</strong></summary>

```yaml
type: custom:bom-radar-card
layer: reflectivity
zoom_level: 10
allow_overzoom: true
```

Overzoom enlarges BOM's native z8 tiles. It provides a closer view but no additional radar detail, so the result may look softer.

</details>

<details>
<summary><strong>Limit the in-card layer switcher</strong></summary>

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

</details>

<details>
<summary><strong>Center a maximum-width card with card-mod</strong></summary>

Requires the separate [card-mod](https://github.com/thomasloven/lovelace-card-mod) integration.

```yaml
type: custom:bom-radar-card
map_height: 600
card_mod:
  style: |
    :host {
      display: block;
      max-width: 750px;
      margin: 0 auto;
    }
```

</details>

## Available BOM layers

The visual editor and in-card switcher use these layer IDs. Observed layers initially show the latest observation, then playback loops from oldest to newest. Forecast layers start at the earliest available current or future timestamp.

<details>
<summary><strong>Show all 34 layer IDs</strong></summary>

| Layer ID | Category | Description |
| --- | --- | --- |
| `rain_rate` | Rain / observed | Rain rate in mm/h |
| `accumulation_1hr` | Rain / observed | Estimated one-hour rainfall accumulation |
| `accumulation_24hr` | Rain / observed | Accumulated 24-hour rainfall total |
| `reflectivity` | Rain / observed | Raw radar reflectivity in dBZ |
| `forecast_rain_50pct_3hr` | Rain / forecast | 50% chance forecast rain amount, three-hourly |
| `forecast_rain_50pct_daily` | Rain / forecast | 50% chance forecast rain amount, daily |
| `forecast_rain_25pct_3hr` | Rain / forecast | 25% chance forecast rain amount, three-hourly |
| `forecast_rain_25pct_daily` | Rain / forecast | 25% chance forecast rain amount, daily |
| `forecast_rain_10pct_3hr` | Rain / forecast | 10% chance forecast rain amount, three-hourly |
| `forecast_rain_10pct_daily` | Rain / forecast | 10% chance forecast rain amount, daily |
| `forecast_rain_chance_3hr` | Rain / forecast | Chance of at least 0.2 mm, three-hourly |
| `forecast_rain_chance_daily` | Rain / forecast | Chance of at least 0.2 mm, daily |
| `wind_speed_kmh` | Wind | Wind speed in km/h |
| `wind_speed_kt` | Wind | Wind speed in knots |
| `wind_direction` | Wind | Wind direction |
| `wave_total_height` | Waves | Total wave height |
| `swell_1_height` | Waves | Primary swell height |
| `swell_1_direction` | Waves | Primary swell direction |
| `swell_2_height` | Waves | Secondary swell height |
| `swell_2_direction` | Waves | Secondary swell direction |
| `wind_wave_height` | Waves | Wind-wave height |
| `air_temperature` | Temperature | Air temperature |
| `feels_like` | Temperature | Apparent temperature |
| `temperature_max_daily` | Temperature | Daytime maximum temperature |
| `temperature_min_daily` | Temperature | Overnight minimum temperature |
| `heatwave_severity` | Temperature | Heatwave severity |
| `relative_humidity` | Humidity & UV | Relative humidity |
| `dew_point` | Humidity & UV | Dew-point temperature |
| `uv_index` | Humidity & UV | UV Index |
| `uv_max_daily` | Humidity & UV | Daily maximum UV Index |
| `thunderstorms` | Significant weather | Thunderstorm overlay |
| `snow` | Significant weather | Snow overlay |
| `fog` | Significant weather | Fog overlay |
| `frost` | Significant weather | Frost overlay |

</details>

The built-in qualitative legend applies to `rain_rate` and `reflectivity`. Other layers use BOM's rendered tile colours without an additional inline scale.

## Basemap providers

| Provider | Included styles | API key |
| --- | --- | --- |
| `bom` | Default, Dark, Auto | Not required |
| `carto` | Voyager Light, Dark Matter, Auto | Optional (recommended) |
| `stadia` | Alidade Light/Dark, Outdoors, OSM Bright, Terrain, Satellite | Domain auth or API key required |
| `esri` | World Imagery, World Topographic | May be required |

Set `basemap_provider: carto` to retain the card's older CARTO appearance. Provider access terms can change; if a third-party basemap rejects tile requests, configure that provider's authentication rather than changing BOM radar settings. CARTO now requires a free API key for reliable, watermark-free tiles on most accounts — see below.

### Getting basemap provider keys

`bom` does not need a key. CARTO, Stadia Maps, and Esri share the `basemap_api_key` field; only the selected provider receives it.

<details>
<summary><strong>CARTO authentication</strong></summary>

CARTO's basemap tiles now require a free API key for most accounts; without one you may see a "Missing API key" watermark on the map.

1. Create a free CARTO account at [carto.com](https://carto.com/).
2. Open **Your basemaps** (or the [Basemaps section of the CARTO dashboard](https://console.carto.com/basemaps)) and copy the default API key, or create a new one scoped to basemaps.
3. Add the key as `basemap_api_key` when using `basemap_provider: carto`.

- [CARTO basemaps documentation](https://docs.carto.com/carto-for-developers/carto-for-react/guides/basemaps)

</details>

> [!WARNING]
> `basemap_api_key` is a client-side credential. It is stored in the dashboard
> configuration and is visible to browsers and in their tile requests. Never
> use an account password, administrator token, or confidential server key.
> Use a browser/client key with the narrowest available basemap permissions,
> origin or referrer restrictions, and usage limits.

<details>
<summary><strong>Stadia Maps authentication</strong></summary>

1. Create a Stadia Maps account.
2. Open the client dashboard and select your property.
3. Generate a browser API key or configure domain authentication for the origins where Home Assistant is opened.
4. If users access Home Assistant through more than one hostname, register each required hostname with the Stadia property.
5. Add the key as `basemap_api_key` when using key authentication.

Tile requests are made by each user's browser, not proxied through the Home
Assistant server. Domain authentication must therefore recognize the address
shown in the browser, such as the external Home Assistant hostname and any
separate internal hostname used directly.

```yaml
type: custom:bom-radar-card
basemap_provider: stadia
basemap_style: alidade_dark
basemap_api_key: YOUR_BROWSER_KEY
```

- [Authentication documentation](https://docs.stadiamaps.com/authentication/)
- [Client dashboard](https://client.stadiamaps.com/)
- [Pricing](https://stadiamaps.com/pricing/)

</details>

<details>
<summary><strong>Esri / ArcGIS authentication</strong></summary>

1. Create an ArcGIS Location Platform or ArcGIS Online account.
2. Create client API-key credentials with only the required basemap access and apply available origin or referrer restrictions.
3. Add the generated key as `basemap_api_key`.

- [API key authentication](https://developers.arcgis.com/documentation/security-and-authentication/api-key-authentication/)
- [Create an API key](https://developers.arcgis.com/documentation/security-and-authentication/api-key-authentication/tutorials/create-an-api-key/online/)
- [Basemap Styles service](https://developers.arcgis.com/rest/basemap-styles/)

</details>

## Layout and sizing

`map_height` is the complete rendered card height. Playback, layer, recenter, legend, marker, and label controls overlay the map and do not add another layout block.

Home Assistant uses `getCardSize()` for masonry dashboards and `getGridOptions()` for sections dashboards. Both derive from `map_height`. Because the map itself is fixed-height, sections dashboards receive matching minimum, preferred, and maximum row counts; change `map_height` instead of vertically resizing the card in the sections editor. Home Assistant still rounds to its discrete row grid, so a small amount of unused grid space can remain.

When a Lovelace view is hidden, detached, resized, or reconnected, the card guards Leaflet's cached dimensions and remeasures the visible container. This includes dashboard tabs, panel views, stacks, responsive columns, and card-mod width constraints.

## How it works

The card renders BOM's 256×256 PNG time-series tiles over the selected basemap:

1. Generate suitable timestamps from the selected layer's known observed or forecast update schedule.
2. Check the first and last timestamps with tiny BOM z0 tiles. If one boundary
   is repeatedly rejected and the adjacent replacement works, shift the whole
   window by one cadence while preserving its frame count. Broad or ambiguous
   network failures leave the generated schedule unchanged.
3. Load one tile layer per frame and animate through them locally.
4. Refresh the timestamps and layers every five minutes.

Providers with separate label tiles render those labels above the weather overlay. BOM reference overlays are also kept above weather tiles so borders and districts remain readable.

### Technical details

| Item | Value |
| --- | --- |
| Weather service | BOM WMTS at `api.bom.gov.au` |
| Tile format | 256×256 transparent PNG |
| Projection | Australian-extent WMTS matrix sets based on EPSG:3857 |
| Native radar zoom | 0–8 |
| Optional display overzoom | Up to 10 |
| Map library | Leaflet 1.9.4, bundled into the self-contained card module |
| Refresh interval | Five minutes |

## Why BOM directly?

The card requests weather tiles from BOM's own mapping service rather than a third-party weather-data intermediary. That provides:

- BOM's native layer IDs and rendered products
- Observed and forecast products beyond a standard rain-radar view
- BOM's Australian tile extents and matrix offsets
- A direct, inspectable path from the browser to the public BOM tile endpoints

## Troubleshooting

### The card does not appear after installation

- Confirm the resource is loaded as a **JavaScript module**.
- Hard-refresh the browser or clear the Home Assistant frontend cache.
- Remove old BOM radar resources that may register a conflicting custom element.
- Open the browser console and confirm it reports `BOM-RADAR-CARD v1.11.0`.

### The map changes width or framing after switching tabs

Upgrade to v1.11.0 or later and hard-refresh the browser. This release retains the cached-view and card-mod fixes while adding further guarded resize and reconnect handling.

### A CARTO, Stadia Maps, or Esri basemap is blank or shows a watermark

The BOM weather layer and third-party basemap are separate services. Add a valid client `basemap_api_key` for the selected provider, or configure the provider's domain authentication. If browser developer tools show a `401` or `403` tile response, check that the exact Home Assistant hostname in the browser is allowed. A CARTO map showing a "Missing API key" watermark needs a free CARTO `basemap_api_key` (see [Getting basemap provider keys](#getting-basemap-provider-keys)). BOM remains the only always-no-key option.

### The timeline shows fewer frames than requested

`frame_count` is capped at nine. Some daily layers intentionally expose fewer frames because their useful published or generated horizon is shorter.

### The map is blank outside Australia

BOM's tile matrices cover Australia and nearby waters rather than the full world. Keep the configured center inside the supported map bounds.

## Support and contributing

- [GitHub Discussions](https://github.com/AshtonAU/bom-radar-card/discussions): setup help, ideas, screenshots, and general feedback
- [GitHub Issues](https://github.com/AshtonAU/bom-radar-card/issues): reproducible bugs and concrete feature requests
- [CONTRIBUTING.md](CONTRIBUTING.md): development and contribution guidance
- [SECURITY.md](SECURITY.md): private vulnerability reporting guidance

If the card saves you time and you want to support maintenance, you can use [GitHub Sponsors](https://github.com/sponsors/AshtonAU) or [Buy Me a Coffee](https://buymeacoffee.com/ashtonau).

## Credits and license

- Weather and reference data: [Australian Bureau of Meteorology](http://www.bom.gov.au) (Commonwealth of Australia)
- Basemaps: BOM, [CARTO](https://carto.com/), [Stadia Maps](https://stadiamaps.com/), or [Esri](https://www.esri.com/), depending on configuration
- Map library: [Leaflet](https://leafletjs.com/) 1.9.4, bundled under the BSD 2-Clause License with its notice preserved in the release asset
- Lightning data: [Blitzortung.org](https://www.blitzortung.org/), when enabled

Released under the [MIT License](LICENSE). BOM data remains subject to the Bureau of Meteorology's [copyright notice](http://www.bom.gov.au/other/copyright.shtml).
