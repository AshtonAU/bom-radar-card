# Changelog

## Unreleased

### Added

- Add Stamen Toner under Stadia Maps in the map-style settings: a high-contrast
  black-and-white basemap suited to e-ink displays. Thanks to @jonathon-m in #25.

## v1.13.0 - 2026-09-21

### Added

- Add a Controls theme setting (`ui_theme: auto | light | dark`). Keep dashboard
  colours by default, or select a neutral light/dark palette for the card and its
  controls and panels. Custom accent colours still apply; map styles, marker
  colours and settings-editor appearance remain independent. Addresses #24.

## v1.12.0 - 2026-09-12

### Changed

- Replace the narrow layer menu with a responsive grouped grid and fixed close
  header. Keep scrolling inside the picker, constrain it to the visible screen
  and card, and reveal the selected layer without moving the dashboard.
- Inherit Home Assistant typography and use softer, consistent control corners.
  Bundle licensed Inter as a fallback after the dashboard's font variables,
  followed by system fonts; retain the MIT project licence and include the
  font's OFL notice in the build.
- Make card controls, panels and the visual editor inherit dashboard theme
  colours, including custom themes, with light/dark fallbacks for missing theme
  variables. Use Home Assistant's primary colour for the default UI accent and
  preserve existing optional overrides. Appearance follows the dashboard without
  a separate card theme picker; basemap day/night styles and BOM legend colours
  remain independent. Keep open panels solid when control opacity is reduced.
- Group editor settings into collapsible sections, use sentence-case labels
  and layer names, and display opacity as percentages. Layer IDs and fractional
  YAML opacity values remain unchanged.
- Keep playback hover feedback on the icon only, without a background circle.
- Use a neutral, theme-aware loading spinner rather than the UI accent colour.
- Match playback to the compact toolbar, improve layer-name and timestamp
  readability, and enlarge timeline hit areas without adding visual weight.
  Layer menus support Escape and focus return independently of the colour key;
  playback exposes its state and decorative motion honours reduced motion.
- Consolidate map controls into one compact toolbar with consistent spacing,
  keyboard focus indicators and 44px touch targets. Colour keys and layer menus
  overlay the toolbar inside the card, with fixed headers, internal scrolling,
  and room for playback underneath when height permits. Short cards use a
  compact toolbar that wraps on narrow widths, with the layer label below it.
  Hide the optional layer label when it cannot fit clear of controls and credits,
  restoring it when space becomes available.
  Panels temporarily hide playback if needed for readable content, restoring it
  when they close or more space becomes available.
- Generate the existing smooth radar strip from the shared BOM colour tables,
  removing its duplicate hard-coded palette while preserving the exact gradient
  stops and six-pixel height. Screen-reader labels distinguish reflectivity from
  rain rate and describe the strip as qualitative.
- Use one renderer and one 6px top-strip layout for all 31 colour-bearing layers.
  Numerical palettes blend smoothly; categorical palettes retain hard boundaries.
  The expanded key uses the same source data for exact swatches and ranges.

### Added

- Added optional `auto_hide_controls` (off by default). After 10 seconds of
  inactivity, the toolbar, playback, time, weather-layer label and attribution
  fade away, leaving the map and any enabled top colour strip. Pointer movement or a first
  reveal-only tap restores the interface. Open panels and keyboard-focused
  controls stay visible; the colour strip remains interactive. Reduced-motion
  preferences disable the fade. Provider attribution requirements still apply.
- Added a default-on, configurable colour-key button beside the layer selector.
  Its initially closed panel shows exact BOM swatches and units for all 31
  colour-bearing layers, independently of strip visibility. Supports Escape,
  focus return, map-interaction dismissal and disconnect cleanup. Direction-only
  layers hide the button. Tapping the strip opens the same panel, including on
  initial load and after reconnecting the card; both triggers share its open state.
- Added presentation-independent legend definitions for all 34 weather layers:
  31 verified BOM colour tables and three direction-arrow definitions. Rain rate
  and reflectivity retain distinct units and band labels.
- Added a read-only `check:legends` command to detect upstream colour, label or
  direction-renderer changes, plus deterministic data and lifecycle tests.
- Added an optional, default-off `show_weather_legend` strip and a
  local `preview:legends` comparison for Chromium visual QA. The existing radar
  gradient, map height and strip visibility defaults are unchanged.
- Added `/visual` to the local preview server for using the card and settings
  editor together in light and dark appearance. Preview edits stay local and
  do not update a Home Assistant dashboard.

## v1.11.1 - 2026-08-28

### Fixed

- Applied a dedicated `carto_api_key` to both CARTO base and label tile requests using
  CARTO's documented `?key=` parameter, restoring watermark-free authenticated
  raster basemaps. This builds on the original CARTO key support contributed by
  [@bossanova808](https://github.com/bossanova808) in
  [#23](https://github.com/AshtonAU/bom-radar-card/pull/23).
- Kept CARTO credentials separate from the existing Stadia Maps and Esri
  `basemap_api_key`, so a key retained by an older CARTO configuration is never
  sent to CARTO after upgrading.
- Cleared both provider-specific basemap key fields in the visual editor
  whenever the provider changes so a key is not sent to a different service.
- Added the required OpenStreetMap credit to CARTO attribution and made the
  visible attribution control easier to read. The existing `show_attribution`
  option remains available and enabled by default.
- Restored Leaflet's pane stacking order and absolute marker positioning so
  the home marker remains above loaded map and weather tiles through redraws.

### Documentation

- Documented CARTO's free-key requirement and dedicated config field, cached
  watermark recovery, attribution terms, provider-specific key handling, and
  planned retirement of its raster basemap endpoints.

## v1.11.0 - 2026-08-16

v1.11.0 is a backward-compatible reliability release based on a fresh review
of BOM's current mapping services. It adds an optional radar-network coverage
overlay, improves publication-rollover and Home Assistant lifecycle handling,
and makes the card self-contained by bundling Leaflet. Existing configuration,
defaults, weather layers, and frame limits remain unchanged.

### Added

- Added an optional, default-off overlay that shades areas outside BOM's radar
  network coverage for rain rate and reflectivity, available in YAML and the
  visual editor without a runtime metadata request.

### Fixed

- Locked Home Assistant sections-grid rows to the fixed height derived from
  `map_height`, avoiding a resize affordance that could not resize the map.
- Made visual-editor configuration events bubble across the editor shadow root
  so Home Assistant wrappers can receive them reliably.
- Started three-hour forecast timelines at the next current or future cadence
  instead of briefly requesting an expired first frame during BOM rollovers.
- Prevented blank edge frames when BOM advances a publication window by
  validating its first and last timestamps with tiny WMTS tiles and shifting a
  confirmed rollover without reducing the configured frame count.
- Added a guarded browser-resize fallback so Leaflet remeasures after a hidden
  or backgrounded dashboard misses its `ResizeObserver` delivery.
- Prevented a browser error when Home Assistant disconnects or reconnects a
  lightning-enabled card immediately after a resize.
- Retried a failed BOM image tile once before using the transparent fallback,
  recovering from short-lived upstream edge errors without creating a loop.
- Kept the current radar visible during refreshes and failed or overlapping
  layer switches, preventing stale results, blank maps, or a layer label that
  did not match the displayed data.

### Changed

- Bundled Leaflet 1.9.4 into the card so every instance uses the same
  module-local map engine without downloading Leaflet from a third-party CDN or
  overwriting a global owned by Home Assistant or another card.
- Preserved existing configuration, defaults, and layer frame limits. The new
  radar-coverage overlay remains off unless explicitly enabled.

## v1.10.1 - 2026-08-02

### Fixed

- Preserved card-mod's injected host styles when Home Assistant reconnects a
  cached Lovelace view, preventing width constraints from disappearing and the
  radar from rendering wider after switching dashboard tabs.
- Kept Leaflet's cached map size stable while a container is hidden, and
  re-measured its padding-box size when it becomes visible or its responsive
  layout changes. This prevents stale framing during other visibility paths.

### Documentation

- Reworked the README into a shorter, grouped reference with clearer setup,
  configuration, recipes, layer, sizing, and troubleshooting guidance.

### Validation

- Passed the unit, coverage, build, package, dependency-audit, syntax, and
  committed-bundle parity checks.
- Passed the issue 17 browser lifecycle matrix on desktop, mobile, fractional
  device-pixel-ratio, and ResizeObserver-only configurations. The v1.10.0
  positive control reproduced the original failures while v1.10.1 did not.

## v1.10.0 - 2026-07-06

### Added
- Optional live Blitzortung lightning-strike overlay. When the
  [Blitzortung integration](https://github.com/mrk-its/homeassistant-blitzortung)
  is installed, recency-coloured strike dots are drawn on the radar (on by default).
  New options: `show_lightning`, `lightning_fade_minutes`, `lightning_pulse`,
  `lightning_dot_size`.

### Maintenance
- Updated the Rollup build tooling and lockfile to clear dev-dependency audit findings.

### Validation
- Verified the Blitzortung overlay with unit tests, a local Chromium smoke test,
  and the existing browser/all-layer regression harnesses.

## v1.9.0 - 2026-06-25

### Added

- Added BOM-native Snow and Frost significant-weather WMTS layers.

### Validation

- Verified Snow and Frost against the current BOM WMTS capabilities, live PNG tile content, and browser rendering through the bundled card.

## v1.8.0 - 2026-06-05

### Added

- Added a no-key `bom` basemap provider using the public BOM `basemap_default` and `basemap_dark` MapServer tiles verified against the current BOM map stack.
- Added `uv_max_daily`, a BOM-native daily maximum UV Index layer verified against the public WMTS endpoint.
- Added optional `show_bom_boundaries` support using BOM's public `state_borders` MapServer image tiles.
- Added optional `bom_reference_layers` support for verified BOM MapServer reference overlays: state borders, coastal areas, forecast districts, drainage divisions, railways, and lakes.

### Changed

- Changed the default basemap provider to BOM, with day/night auto mode using BOM's default and dark basemaps unless a provider/style is configured.
- Users who want the previous CARTO look can keep it by setting `basemap_provider: carto` and the preferred fixed `basemap_style`.

### Fixed

- Hardened refresh/playback handling so data refreshes stop and resume animation cleanly, ignore stale rebuilds, guard invalid frame indexes, and clear map-layer state during cleanup.
- Sanitized numeric YAML/editor config values before runtime use, including map height, zoom, opacity, frame count, and animation delays.
- Hardened provider/style/layer registry lookups so inherited object keys cannot be treated as valid configuration.
- Fixed Leaflet loader retry handling after a transient CDN/script-load failure.
- Hardened the CI workflow with read-only token permissions and pinned action commit references.

### Documentation

- Documented the BOM-native basemap provider.
- Documented the optional BOM reference overlays.

## v1.7.0 - 2026-05-31

### Added

- Added optional `basemap_style: auto` mode, which uses Home Assistant's `sun.sun` state to switch between the provider's light daytime basemap and dark nighttime basemap.
- Added visual editor support for the auto day/night basemap style.

### Documentation

- Documented the new auto day/night basemap mode and updated release references for `v1.7.0`.

## v1.6.6 - 2026-05-29

### Fixed

- Fixed excess whitespace under the card in Home Assistant masonry and sections views by making the layout size estimate match the rendered `map_height`.
- Stopped playback controls from adding phantom layout height. Playback is overlaid on the map, so it no longer changes the reserved card height.
- Fixed BOM capabilities loading so the request is only used from CORS-safe contexts. Home Assistant browser dashboards now go straight to generated current timestamps instead of attempting a known-blocked capabilities request before falling back.
- Rebuilt the card when Home Assistant calls `setConfig()` after the map is already initialized, keeping editor/runtime config changes aligned with the rendered map.
- Reset playback state during runtime rebuilds so a paused card cannot come back with stale controls or no visible way to resume.
- Updated the embedded card banner version to match the package release.

### Documentation

- Clarified how `map_height`, `getCardSize()`, and sections-grid rows relate to each other.
- Documented that unknown migrated keys are ignored, and that `overlay_transparency` and `show_scale` are not supported options for this card.
- Updated release references and issue-template version hints for `v1.6.6`.

## v1.6.5 - 2026-05-11

### Fixed

- Fixed Home Assistant sidebar / SPA navigation returning to a dashboard with the card stuck in the loading state.
- Delayed card initialization until the element is connected and both config and Home Assistant state are available.
- Added lifecycle tokens so stale async initialization, Leaflet loading, and radar data loading cannot update a card after it has been disconnected and reconnected.
- Cleaned up partially-created Leaflet maps when initialization fails so a later retry can start from a clean state.
- Re-invalidated Leaflet size after attach and resize so maps recover correctly in Home Assistant sections views and hidden-to-visible dashboard layouts.
- Guarded BOM tile fallback completion so tile error fallback cannot call Leaflet's tile completion callback more than once.

### Verification Notes

- Verified with local Node regression checks for detached config/state setup, connected-first setup, SPA detach/reconnect, stale async initialization, stale radar data loading, partial map cleanup, and BOM tile fallback completion.
- Verified with browser lifecycle and live visual harnesses using real Leaflet, CARTO basemap tiles, and BOM WMTS tile requests.
- CI verifies the production bundle builds and committed `dist/bom-radar-card.js` remains current.

### Verified

- `npm run build`
- `node --check src/bom-radar-card.js`
- `git diff --check`
- `npm audit --omit=dev`
- `npm ci --dry-run`
- Browser preview with real map tiles
- Browser lifecycle harness
- Browser live harness covering overlay switching, timestamp labels, zoom, recenter, detach/reattach, hidden-to-visible, and narrow layout behavior
