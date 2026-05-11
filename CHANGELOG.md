# Changelog

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
