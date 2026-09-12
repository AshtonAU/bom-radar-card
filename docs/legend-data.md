# Legend data and rendering boundary

Legend data and presentation are separate modules in the client-side Home
Assistant card. The bundled definitions introduce no server, proxy, credentials
or runtime metadata requests.

## Layer contract

`getLayerLegend(layerKey)` in `src/bom-legends.js` covers every key in `BOM_LAYERS`.
Unknown keys return `null`, never another product's legend.

```js
getLayerLegend('air_temperature');
// {
//   layerKey: 'air_temperature',
//   title: 'Air temperature',
//   unit: '°C',
//   kind: 'numeric',
//   rasterFunction: 'temperature_celsius',
//   bands: [{ label: '< 0', rgba: [16, 61, 98, 255] }, ...]
// }
```

| Kind | Layers | Contract |
| --- | ---: | --- |
| `numeric` | 24 | Ordered colour bands with BOM range labels and the layer's units |
| `categorical` | 5 | Heatwave, thunderstorms, snow, fog and frost labels; no numeric axis |
| `radar` | 2 | Verified rain-rate (`mm/h`) and reflectivity (`dBZ`) bands; the existing visual strip remains unchanged |
| `direction` | 3 | Wind and two swell arrow renderers, `deg` units, empty `bands`; do not invent a colour scale |

Each call returns independent band objects and RGBA arrays, so a renderer cannot
accidentally mutate another layer's shared palette. Numeric ranges are display
labels, not machine-readable interval definitions. Some BOM labels use ambiguous
boundaries (for example UV `> 11`); preserve them rather than inferring inclusivity,
relabeling them or using them to classify raw readings.

Layer titles use the sentence-case names in `BOM_LAYERS`. This presentation change
does not rename layer keys, change units or alter BOM's source band labels.

Do not assume equal colour spacing means equal numeric intervals. Do not infer
wind/swell arrow "from" versus "towards" semantics from the colour table. The
contract identifies the verified BOM arrow renderer, not an invented bearing key.

## Sources and revalidation

`src/bom-legend-data.js` contains the 31 colour tables, grouped into 19 distinct
palettes. Verified on 2026-09-08 against BOM's first-party ImageServer endpoints.
Each layer is checked separately even when its current palette matches another.

`getLegendTableUrl(layerKey)` builds the corresponding public source URL using:

```text
https://api.bom.gov.au/apikey/v1/mapping/{observations|forecasts}/{layer.id}/ImageServer/rasterAttributeTable
  ?f=json&renderingRule={"rasterFunction":"the verified renderer"}
```

Use the pinned Node 24/npm 11 toolchain:

```sh
npm test
npm run check:legends
```

The read-only check compares every ordered label and RGBA value exactly (except
surrounding label whitespace). For directions, it checks that the expected
renderer still exists in `rasterFunctionInfos` and that no colour table has appeared.
HTTP errors, timeouts or mismatches fail the check rather than silently updating
the bundled data. Review upstream changes, update the snapshot and its date, and
rerun the tests before releasing a palette change.

The card does not call these metadata endpoints at runtime: BOM rejects tested
Home Assistant-style origins. The maintenance script runs outside the browser.

## Rendering and interaction

- Data/API contract: `src/bom-legends.js` and `src/bom-legend-data.js`.
- Shared strip renderer: `src/legend.js`. All 31 colour-bearing layers use the same
  HTML and the same 6px `.legend-scale` CSS rule in `src/bom-radar-card.js`. Numerical
  palettes use smooth gradients; categorical palettes use hard stops. Fog is one
  solid band. No product-specific panel or alternate layout is introduced.
- Radar preserves its original 15 CSS stop positions exactly. Other numerical
  palettes space their stops evenly. These are visual positions, not physical
  thresholds; byte-for-byte radar regression tests protect the existing appearance.
- Config/editor and displayed-layer wiring: `_renderTopOverlays()` in
  `src/bom-radar-card.js`.
- UI appearance: `src/ui-theme.js` maps Home Assistant's semantic theme variables
  into the card controls, panels and editor, including custom dashboard colours.
  Theme-provided surfaces, text, borders and accents take precedence over bundled
  defaults. Missing variables receive light/dark fallbacks, selected using
  Home Assistant's `themes.darkMode` or otherwise the browser's appearance
  preference. The card does not add a separate theme picker.
- Typography inherits `--ha-font-family-body`, then `--primary-font-family`,
  followed by bundled Inter and system fonts. The default UI accent inherits
  `--primary-color`; the existing optional `accent_color` override is preserved.
  The card shell also respects Home Assistant card background and corner-radius
  variables. These fallbacks support themes that define only some variables.
- Theme inheritance does not change BOM's weather colours or the basemap's
  separate day/night selection. `chrome_opacity` affects compact control and
  badge backgrounds; open panels retain solid theme surfaces for readable text
  and colour swatches.
- Side-by-side local preview: `npm run preview:legends`, then open
  `http://127.0.0.1:8124`. Builds in memory; does not edit `dist` or deploy to HA.
  All 34 products are available in the preview selector. A separate set of exact
  source-table swatches appears only in the development page.
- Card and editor preview: use the same server at `http://127.0.0.1:8124/visual`.
  Its appearance selector supplies light/dark Home Assistant state to both
  components. Editor changes update the local card without saving to a dashboard.

The editor keeps the weather layer and opacity fields first, with collapsible
sections for map, playback, controls and appearance, available layers, lightning,
and home marker settings. Labels use sentence case. Weather and controls opacity
are displayed as percentages but are still emitted as fractional `radar_opacity`
and `chrome_opacity` configuration values (for example, `70%` becomes `0.7`).

The weather key follows the **committed displayed layer**, not a pending selection.
A slow or failed layer change must not show new units over old map data. Same-layer
refreshes retain the existing strip node and the key panel's scroll position.
When the colour key is enabled, tapping the strip opens its panel. The toolbar
button and strip trigger share the panel's open state and keyboard focus returns
to the trigger used to open it. The visible strip remains 6px high.
`show_weather_legend` remains opt-in and independent of `show_legend`; redesigning
the UI does not require changing these definitions.

`show_legend_button` defaults to true, independently of either strip toggle.
Disabling it also disables the strip trigger; there is no separate interaction
setting.
`renderLegendBandsHtml()` uses the same data for exact swatches. The non-modal
panel starts closed, supports Escape and focus return, and closes on map
click/pan/zoom. Its toolbar button shares the control row with the layer selector
when present, but works without it. The key and layer picker overlay the toolbar
inside the visible card area. Both use fixed headers and internal scrolling.
When the vertical toolbar cannot fit above playback, it becomes a horizontal
row and the optional layer label moves underneath. Panels normally reserve room
for playback; if that leaves less than 140px of panel height, they can use that
space and temporarily hide playback. Playback returns when the panel closes or
there is enough visible height to reserve its space again. Panels are mutually
exclusive. The key hides for direction
products, follows the committed layer, and removes its DOM and keyboard listener
on disconnect. These behaviors have lifecycle tests; the strip gradient is unchanged.

Visual QA uses the local Chromium preview to check narrow and wide cards,
keyboard focus, scrolling, viewport containment and playback overlap. This local
preview does not deploy the card to a Home Assistant dashboard. The preview's
**Check layout** action reports panel bounds, playback visibility and clearance for the
currently open panel.
