/**
 * BOM Radar Card for Home Assistant
 * Uses native BOM WMTS tiles from api.bom.gov.au
 *
 * Author: Ashton Turner (github.com/AshtonAU)
 * License: MIT
 */

const CARD_VERSION = '1.4.1';

console.info(
  `%c BOM-RADAR-CARD %c v${CARD_VERSION} `,
  'color: #00BCD4; font-weight: bold; background: #1a1a2e',
  'color: white; font-weight: bold; background: #16213e',
);

// BOM WMTS Configuration
const BOM_WMTS_BASE = 'https://api.bom.gov.au/apikey/v1/mapping/timeseries/wmts';
const BOM_WMTS_CAPABILITIES_URL = `${BOM_WMTS_BASE}?SERVICE=WMTS&REQUEST=GetCapabilities&VERSION=1.0.0`;

// Available radar layers
const BOM_LAYERS = {
  'rain_rate': {
    id: 'atm_surf_air_precip_rate_1hr_total_mm_h',
    name: 'Rain Rate',
    unit: 'mm/h',
    tileMatrixSet: 'GoogleMapsCompatible_BoM',
    legendType: 'rainRadar',
  },
  'accumulation_1hr': {
    id: 'atm_surf_air_precip_accumulation_1hr_total_mm',
    name: 'Estimated Rain 1hr',
    unit: 'mm',
    tileMatrixSet: 'GoogleMapsCompatible_BoM',
    legendType: 'numerical',
  },
  'reflectivity': {
    id: 'atm_surf_air_precip_reflectivity_dbz',
    name: 'Rain Reflectivity',
    unit: 'dBZ',
    tileMatrixSet: 'GoogleMapsCompatible_BoM',
    legendType: 'rainRadar',
  },
};

const RADAR_LEGEND = {
  gradient: 'linear-gradient(90deg, rgb(245, 245, 255) 0%, rgb(180, 180, 255) 7%, rgb(120, 120, 255) 14%, rgb(20, 20, 255) 21%, rgb(0, 216, 195) 28%, rgb(0, 150, 144) 35%, rgb(0, 102, 102) 42%, rgb(255, 255, 0) 49%, rgb(255, 200, 0) 56%, rgb(255, 150, 0) 63%, rgb(255, 100, 0) 70%, rgb(255, 0, 0) 77%, rgb(200, 0, 0) 84%, rgb(120, 0, 0) 91%, rgb(40, 0, 0) 100%)',
};

// TileMatrixSet: GoogleMapsCompatible_BoM
// TopLeftCorner (EPSG:3857) and matrix dimensions for each zoom level
const TILE_MATRIX_INFO = [
  { z: 0, tlx: 11584952, tly: 34168990.685578, w: 1, h: 1 },
  { z: 1, tlx: 11584952, tly: 14131482.342789, w: 1, h: 1 },
  { z: 2, tlx: 11584952, tly: 4112728.171395, w: 1, h: 1 },
  { z: 3, tlx: 11584952, tly: 4112728.171395, w: 2, h: 2 },
  { z: 4, tlx: 11584952, tly: 1608039.628546, w: 3, h: 3 },
  { z: 5, tlx: 11584952, tly: 355695.357122, w: 6, h: 5 },
  { z: 6, tlx: 11584952, tly: -270476.778591, w: 11, h: 9 },
  { z: 7, tlx: 11584952, tly: -583562.846447, w: 22, h: 17 },
  { z: 8, tlx: 11584952, tly: -740105.880375, w: 43, h: 33 },
];

const MIN_MAP_ZOOM = 3;
const MAX_RADAR_NATIVE_ZOOM = TILE_MATRIX_INFO[TILE_MATRIX_INFO.length - 1].z;
const MAX_DISPLAY_ZOOM = 12;

const WORLD_EXTENT = 40075016.68;
const HALF_EXTENT = 20037508.34;

// 1x1 transparent PNG for out-of-bounds tiles
const TRANSPARENT_PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

function getTileOffset(z) {
  if (z < 0 || z > MAX_RADAR_NATIVE_ZOOM) return null;
  const info = TILE_MATRIX_INFO[z];
  const tileSpan = WORLD_EXTENT / Math.pow(2, z);
  return {
    xOffset: Math.round((info.tlx + HALF_EXTENT) / tileSpan),
    yOffset: Math.round((HALF_EXTENT - info.tly) / tileSpan),
    width: info.w,
    height: info.h,
  };
}

// SVG icons
const ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
const ICON_RECENTER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v3"/><path d="M12 19v3"/><path d="M2 12h3"/><path d="M19 12h3"/></svg>';
const ICON_LAYERS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4 4 8l8 4 8-4-8-4Z"/><path d="m4 12 8 4 8-4"/><path d="m4 16 8 4 8-4"/></svg>';

// Leaflet CSS (minimal, inlined for Shadow DOM)
const LEAFLET_CSS = `
.leaflet-pane,.leaflet-tile,.leaflet-marker-icon,.leaflet-marker-shadow,.leaflet-tile-container,.leaflet-pane>svg,.leaflet-pane>canvas,.leaflet-zoom-box,.leaflet-image-layer,.leaflet-layer{position:absolute;left:0;top:0}
.leaflet-container{overflow:hidden;-webkit-tap-highlight-color:transparent;font-family:inherit}
.leaflet-tile,.leaflet-marker-icon,.leaflet-marker-shadow{-webkit-user-select:none;-moz-user-select:none;user-select:none;-webkit-user-drag:none}
.leaflet-tile{filter:none;visibility:hidden}
.leaflet-tile-loaded{visibility:inherit}
.leaflet-zoom-anim .leaflet-zoom-animated{will-change:transform;-webkit-transition:-webkit-transform .25s cubic-bezier(0,0,.25,1);-moz-transition:-moz-transform .25s cubic-bezier(0,0,.25,1);transition:transform .25s cubic-bezier(0,0,.25,1)}
.leaflet-zoom-anim .leaflet-tile,.leaflet-pan-anim .leaflet-tile{-webkit-transition:none;-moz-transition:none;transition:none}
.leaflet-interactive{cursor:pointer}
.leaflet-grab{cursor:-webkit-grab;cursor:-moz-grab;cursor:grab}
.leaflet-crosshair,.leaflet-crosshair .leaflet-interactive{cursor:crosshair}
.leaflet-control-zoom-in,.leaflet-control-zoom-out{font:bold 18px 'Lucida Console',Monaco,monospace;text-indent:1px}
.leaflet-touch .leaflet-control-zoom-in,.leaflet-touch .leaflet-control-zoom-out{font-size:22px}
.leaflet-map-pane,.leaflet-tile,.leaflet-marker-icon,.leaflet-marker-shadow,.leaflet-tile-container,.leaflet-pane>svg,.leaflet-pane>canvas,.leaflet-zoom-box,.leaflet-image-layer,.leaflet-layer{position:absolute;left:0;top:0;pointer-events:none}
.leaflet-tile-pane{pointer-events:auto}
.leaflet-control{position:relative;z-index:800;pointer-events:visiblePainted;pointer-events:auto}
.leaflet-top,.leaflet-bottom{position:absolute;z-index:1000;pointer-events:none}
.leaflet-top{top:0}.leaflet-right{right:0}.leaflet-bottom{bottom:0}.leaflet-left{left:0}
.leaflet-control{float:left;clear:both}
.leaflet-right .leaflet-control{float:right}
.leaflet-top .leaflet-control{margin-top:10px}
.leaflet-bottom .leaflet-control{margin-bottom:10px}
.leaflet-left .leaflet-control{margin-left:10px}
.leaflet-right .leaflet-control{margin-right:10px}
.leaflet-control-zoom{border:none;border-radius:var(--bom-control-radius);overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.3)}
.leaflet-control-zoom a{background-color:rgba(20,20,40,0.85);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);color:rgba(255,255,255,0.7);width:32px;height:32px;line-height:32px;text-align:center;text-decoration:none;display:block;border-bottom:1px solid rgba(255,255,255,0.06);transition:background 0.15s,color 0.15s}
.leaflet-control-zoom a:hover{background-color:rgba(30,30,60,0.95);color:white}
.leaflet-control-zoom-in{border-top-left-radius:var(--bom-control-radius);border-top-right-radius:var(--bom-control-radius)}
.leaflet-control-zoom-out{border-bottom-left-radius:var(--bom-control-radius);border-bottom-right-radius:var(--bom-control-radius);border-bottom:none}
.leaflet-control-attribution{background:rgba(0,0,0,0.35)!important;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);color:rgba(255,255,255,0.4);font-size:9px;padding:1px 6px;border-radius:var(--bom-attribution-radius);line-height:1.4}
.leaflet-control-attribution a{color:rgba(100,180,255,0.5);text-decoration:none}
.leaflet-touch .leaflet-control-zoom a{width:36px;height:36px;line-height:36px;font-size:18px}
.bom-recenter-control{border:none;border-radius:var(--bom-control-radius);overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.3)}
.bom-recenter-button{appearance:none;-webkit-appearance:none;background-color:rgba(20,20,40,0.85);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);color:rgba(255,255,255,0.7);width:32px;height:32px;padding:0;display:flex;align-items:center;justify-content:center;border:none;cursor:pointer;transition:background 0.15s,color 0.15s}
.bom-recenter-button:hover{background-color:rgba(30,30,60,0.95);color:white}
.bom-recenter-button svg{width:16px;height:16px}
.leaflet-touch .bom-recenter-button{width:36px;height:36px}
.bom-layer-control{position:relative}
.bom-layer-button{appearance:none;-webkit-appearance:none;background-color:rgba(20,20,40,0.85);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);color:rgba(255,255,255,0.72);width:32px;height:32px;padding:0;display:flex;align-items:center;justify-content:center;border:none;border-radius:var(--bom-control-radius);cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.3);transition:background 0.15s,color 0.15s}
.bom-layer-button:hover,.bom-layer-button.is-open{background-color:rgba(30,30,60,0.95);color:white}
.bom-layer-button svg{width:16px;height:16px}
.bom-layer-panel{position:absolute;top:0;right:40px;min-width:156px;padding:4px;display:none;flex-direction:column;gap:3px;background:rgba(10,10,24,0.92);backdrop-filter:blur(16px) saturate(1.6);-webkit-backdrop-filter:blur(16px) saturate(1.6);border:1px solid rgba(255,255,255,0.08);border-radius:var(--bom-control-radius);box-shadow:0 10px 24px rgba(0,0,0,0.32)}
.bom-layer-panel.is-open{display:flex}
.bom-layer-option{appearance:none;-webkit-appearance:none;width:100%;padding:8px 10px;border:none;border-radius:calc(var(--bom-control-radius) - 2px);background:transparent;color:rgba(255,255,255,0.72);cursor:pointer;text-align:left;transition:background 0.15s,color 0.15s}
.bom-layer-option:hover,.bom-layer-option.is-active{background:rgba(255,255,255,0.1);color:white}
.bom-layer-option-name{display:block;font-size:12px;font-weight:600;line-height:1.2}
.bom-layer-option-unit{display:block;margin-top:2px;font-size:10px;letter-spacing:0.04em;text-transform:uppercase;opacity:0.64}
.leaflet-touch .bom-layer-button{width:36px;height:36px}
.leaflet-touch .bom-layer-panel{right:44px}
`;

const CARD_CSS = `
:host {
  display: block;
}
ha-card {
  overflow: hidden;
  border-radius: var(--bom-card-radius, var(--ha-card-border-radius, 12px));
  background: var(--ha-card-background, var(--card-background-color, rgba(26, 26, 46, 0.6)));
  box-shadow: var(--ha-card-box-shadow, none);
}
.card-content {
  --bom-control-radius: 8px;
  --bom-badge-radius: 8px;
  --bom-bar-radius: 14px;
  --bom-attribution-radius: 6px 0 0 0;
  --bom-track-radius: 1.5px;
  padding: 0;
  position: relative;
}
.card-content.is-square {
  --bom-card-radius: 0px;
  --bom-control-radius: 0px;
  --bom-badge-radius: 0px;
  --bom-bar-radius: 0px;
  --bom-attribution-radius: 0px;
  --bom-track-radius: 0px;
}
.card-content.has-top-legend .layer-badge {
  top: 18px;
}
.card-content.has-top-legend .leaflet-top .leaflet-control {
  margin-top: 22px;
}
#map {
  width: 100%;
  border-radius: var(--bom-card-radius, var(--ha-card-border-radius, 12px));
  z-index: 0;
  background: #0d1117;
}

/* Controls bar */
.controls {
  position: absolute;
  bottom: 10px;
  left: 10px;
  right: 10px;
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: rgba(10, 10, 24, 0.8);
  backdrop-filter: blur(16px) saturate(1.8);
  -webkit-backdrop-filter: blur(16px) saturate(1.8);
  border-radius: var(--bom-bar-radius);
  border: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}
.play-btn {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.85);
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--bom-control-radius);
  transition: background 0.15s, transform 0.1s;
  flex-shrink: 0;
}
.play-btn svg {
  width: 16px;
  height: 16px;
}
.play-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}
.play-btn:active {
  transform: scale(0.92);
}

/* Timeline */
.timeline {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 3px;
  height: 28px;
  padding: 0 2px;
}
.frame-dot {
  flex: 1;
  height: 3px;
  border-radius: var(--bom-track-radius);
  background: rgba(255, 255, 255, 0.1);
  cursor: pointer;
  transition: background 0.2s, height 0.15s, box-shadow 0.2s;
  position: relative;
}
.frame-dot:hover {
  background: rgba(255, 255, 255, 0.25);
  height: 5px;
}
.frame-dot.active {
  background: #00BCD4;
  height: 5px;
  box-shadow: 0 0 8px rgba(0, 188, 212, 0.5);
}
.frame-dot.past {
  background: rgba(0, 188, 212, 0.25);
}

/* Time label */
.time-label {
  color: rgba(255, 255, 255, 0.6);
  font-size: 11px;
  font-weight: 500;
  min-width: 40px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
  letter-spacing: 0.3px;
}

/* Layer label */
.layer-badge {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 1000;
  padding: 4px 10px;
  background: rgba(10, 10, 24, 0.7);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-radius: var(--bom-badge-radius);
  border: 1px solid rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.55);
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  pointer-events: none;
}

/* Legend */
.legend-card {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  pointer-events: none;
}
.legend-scale {
  height: 8px;
  border-radius: 0;
  box-shadow: inset 0 -1px 0 rgba(255, 255, 255, 0.12);
}

/* Loading state */
.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1001;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: rgba(13, 17, 23, 0.6);
  pointer-events: none;
  transition: opacity 0.3s;
}
.loading-overlay.hidden {
  opacity: 0;
}
.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid rgba(0, 188, 212, 0.15);
  border-top-color: #00BCD4;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.loading-text {
  color: rgba(255, 255, 255, 0.4);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.5px;
}
.error-text {
  color: rgba(255, 100, 100, 0.7);
  font-size: 12px;
}

/* Home marker */
.marker-dot {
  position: relative;
}
.marker-dot::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 12px;
  height: 12px;
  background: #00BCD4;
  border: 2px solid rgba(255, 255, 255, 0.9);
  border-radius: 50%;
  box-shadow: 0 0 10px rgba(0, 188, 212, 0.6), 0 0 20px rgba(0, 188, 212, 0.2);
}
.marker-dot::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 24px;
  height: 24px;
  background: rgba(0, 188, 212, 0.15);
  border-radius: 50%;
  animation: pulse 2s ease-out infinite;
}
@keyframes pulse {
  0% { transform: translate(-50%, -50%) scale(0.8); opacity: 1; }
  100% { transform: translate(-50%, -50%) scale(2); opacity: 0; }
}

@media (max-width: 480px) {
  .card-content.has-top-legend .layer-badge {
    top: 16px;
  }
  .card-content.has-top-legend .leaflet-top .leaflet-control {
    margin-top: 20px;
  }
}
`;

let leafletLoadPromise = null;
let capabilitiesLoadPromise = null;
let capabilitiesCache = null;
let capabilitiesFetchedAt = 0;

function loadLeaflet() {
  if (window.L) {
    return Promise.resolve(window.L);
  }

  if (leafletLoadPromise) {
    return leafletLoadPromise;
  }

  leafletLoadPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector('script[data-bom-radar-leaflet]');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(window.L), { once: true });
      existingScript.addEventListener('error', () => {
        leafletLoadPromise = null;
        reject(new Error('Failed to load Leaflet'));
      }, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.dataset.bomRadarLeaflet = 'true';
    script.onload = () => resolve(window.L);
    script.onerror = () => {
      leafletLoadPromise = null;
      reject(new Error('Failed to load Leaflet'));
    };
    document.head.appendChild(script);
  });

  return leafletLoadPromise;
}

function generateFallbackTimestamps(count = 9) {
  const now = new Date();
  const minutes = Math.floor(now.getUTCMinutes() / 5) * 5;
  const latest = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
    now.getUTCHours(), minutes, 0
  ));
  // BOM takes ~5 min to process, go back one interval
  latest.setUTCMinutes(latest.getUTCMinutes() - 5);

  const timestamps = [];
  for (let i = count - 1; i >= 0; i--) {
    const t = new Date(latest.getTime() - i * 5 * 60 * 1000);
    timestamps.push(t.toISOString().replace(/\.\d{3}Z$/, 'Z'));
  }
  return timestamps;
}

function getChildByLocalName(parent, name) {
  return Array.from(parent?.children || []).find((node) => node.localName === name) || null;
}

function getChildrenByLocalName(parent, name) {
  return Array.from(parent?.children || []).filter((node) => node.localName === name);
}

async function loadBomCapabilities() {
  const cacheAgeMs = 4 * 60 * 1000;
  if (capabilitiesCache && (Date.now() - capabilitiesFetchedAt) < cacheAgeMs) {
    return capabilitiesCache;
  }

  if (capabilitiesLoadPromise) {
    return capabilitiesLoadPromise;
  }

  capabilitiesLoadPromise = fetch(BOM_WMTS_CAPABILITIES_URL, { mode: 'cors' })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Capabilities request failed with ${response.status}`);
      }
      const xmlText = await response.text();
      const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
      if (xml.querySelector('parsererror')) {
        throw new Error('Capabilities response could not be parsed');
      }
      capabilitiesCache = xml;
      capabilitiesFetchedAt = Date.now();
      capabilitiesLoadPromise = null;
      return xml;
    })
    .catch((err) => {
      capabilitiesLoadPromise = null;
      throw err;
    });

  return capabilitiesLoadPromise;
}

function extractLayerTimestamps(xml, layerId) {
  const layers = Array.from(xml.getElementsByTagNameNS('*', 'Layer'));
  const layer = layers.find((node) => getChildByLocalName(node, 'Identifier')?.textContent?.trim() === layerId);
  if (!layer) {
    return [];
  }

  const dimensions = getChildrenByLocalName(layer, 'Dimension');
  const timeDimension = dimensions.find((node) => getChildByLocalName(node, 'Identifier')?.textContent?.trim() === 'time');
  if (!timeDimension) {
    return [];
  }

  const values = getChildrenByLocalName(timeDimension, 'Value')
    .map((node) => node.textContent?.trim())
    .filter(Boolean);

  const defaultValue = getChildByLocalName(timeDimension, 'Default')?.textContent?.trim();
  if (defaultValue && !values.includes(defaultValue)) {
    values.push(defaultValue);
  }

  return values.sort();
}

async function getLayerTimestamps(layerConfig, count = 9) {
  try {
    const capabilities = await loadBomCapabilities();
    const publishedTimes = extractLayerTimestamps(capabilities, layerConfig.id);
    if (publishedTimes.length > 0) {
      return publishedTimes.slice(-count);
    }
  } catch (err) {
    console.warn(`BOM Radar Card: Falling back to generated timestamps for ${layerConfig.id}`, err);
  }

  return generateFallbackTimestamps(count);
}

function bomTileUrl(layerId, tileMatrixSet, z, col, row, time) {
  return `${BOM_WMTS_BASE}?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0` +
    `&LAYER=${layerId}&STYLE=default&FORMAT=image/png` +
    `&TILEMATRIXSET=${tileMatrixSet}&TILEMATRIX=${z}` +
    `&TILEROW=${row}&TILECOL=${col}&time=${time}`;
}

function getBomTileUrlForCoords(layerId, tileMatrixSet, coords, time) {
  const offset = getTileOffset(coords.z);
  if (!offset) return '';

  const col = coords.x - offset.xOffset;
  const row = coords.y - offset.yOffset;
  if (col < 0 || col >= offset.width || row < 0 || row >= offset.height) {
    return '';
  }

  return bomTileUrl(layerId, tileMatrixSet, coords.z, col, row, time);
}

function createBomTileLayer(L, layerId, tileMatrixSet, time, options = {}) {
  const BomTileLayer = L.TileLayer.extend({
    getTileUrl: function(coords) {
      return getBomTileUrlForCoords(layerId, tileMatrixSet, coords, time);
    },
    createTile: function(coords, done) {
      const tile = document.createElement('img');
      tile.alt = '';
      const url = this.getTileUrl(coords);
      if (!url) {
        tile.src = TRANSPARENT_PIXEL;
        setTimeout(() => done(null, tile), 0);
        return tile;
      }
      tile.onload = () => done(null, tile);
      tile.onerror = () => {
        // Silently show transparent tile on error (e.g. timestamp not yet available)
        tile.src = TRANSPARENT_PIXEL;
        done(null, tile);
      };
      tile.src = url;
      return tile;
    },
  });

  return new BomTileLayer('', options);
}

function getLegendConfig(layerKey) {
  const layer = BOM_LAYERS[layerKey];
  if (!layer || layer.legendType !== 'rainRadar') {
    return null;
  }

  return {
    title: layer.name,
    unit: layer.unit,
    gradient: RADAR_LEGEND.gradient,
    ariaLabel: `${layer.name} legend from light to heavy precipitation`,
  };
}

function renderLegendHtml(layerKey) {
  const legend = getLegendConfig(layerKey);
  if (!legend) {
    return '';
  }

  return `
    <div class="legend-card" role="note" aria-label="${legend.ariaLabel}">
      <div class="legend-scale" style="background:${legend.gradient}"></div>
    </div>
  `;
}


class BomRadarCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._hass = null;
    this._map = null;
    this._L = null;
    this._radarLayers = [];
    this._currentFrame = 0;
    this._playing = true;
    this._animationTimer = null;
    this._timestamps = [];
    this._initialized = false;
    this._updateTimer = null;
    this._resizeObserver = null;
    this._layerSwitcher = null;
    this._lastRadarDisplayZoom = null;
    this._pendingZoomRebuild = false;
    this._previousDisplayZoom = null;
  }

  connectedCallback() {
    if (!this._initialized && this._hass && this._map === null && Object.keys(this._config).length > 0) {
      this._init();
    }
  }

  _getEstimatedCardHeight() {
    const mapHeight = this._config?.map_height || 300;
    const controlsHeight = this._config?.show_playback === false ? 0 : 64;
    const cardPadding = 16;
    return mapHeight + controlsHeight + cardPadding;
  }

  _getHomeCoordinates() {
    const lat = this._config.marker_latitude ?? this._hass?.config?.latitude ?? this._config.center_latitude ?? -33.87;
    const lon = this._config.marker_longitude ?? this._hass?.config?.longitude ?? this._config.center_longitude ?? 151.21;
    return [lat, lon];
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._initialized) {
      this._init();
    }
  }

  setConfig(config) {
    if (!config) throw new Error('Invalid configuration');
    this._config = {
      center_latitude: config.center_latitude,
      center_longitude: config.center_longitude,
      zoom_level: Math.min(MAX_DISPLAY_ZOOM, Math.max(MIN_MAP_ZOOM, config.zoom_level || 6)),
      frame_count: Math.min(9, Math.max(1, config.frame_count || 9)),
      frame_delay: config.frame_delay || 500,
      restart_delay: config.restart_delay || 1500,
      layer: config.layer || 'reflectivity',
      show_marker: config.show_marker !== false,
      show_zoom: config.show_zoom !== false,
      show_recenter: config.show_recenter !== false,
      show_layer_switcher: config.show_layer_switcher !== false,
      show_playback: config.show_playback !== false,
      show_legend: config.show_legend !== false,
      square_style: config.square_style === true,
      show_attribution: config.show_attribution !== false,
      show_layer_label: config.show_layer_label === true,
      map_height: config.map_height || 300,
      dark_basemap: config.dark_basemap !== false,
      marker_latitude: config.marker_latitude,
      marker_longitude: config.marker_longitude,
      radar_opacity: Math.min(1, Math.max(0.1, config.radar_opacity || 0.7)),
      card_mod: config.card_mod,
    };
  }

  getCardSize() {
    return Math.ceil(this._getEstimatedCardHeight() / 50);
  }

  getGridOptions() {
    const rows = Math.max(4, Math.ceil((this._getEstimatedCardHeight() + 8) / 64));
    return {
      rows,
      min_rows: Math.max(4, rows - 1),
      columns: 12,
      min_columns: 6,
      max_columns: 12,
    };
  }

  static getConfigElement() {
    return document.createElement('bom-radar-card-editor');
  }

  static getStubConfig() {
    return {
      layer: 'reflectivity',
      zoom_level: 6,
      map_height: 300,
    };
  }

  async _init() {
    if (this._initialized) return;
    this._initialized = true;

    this.shadowRoot.innerHTML = `
      <style>${LEAFLET_CSS}${CARD_CSS}</style>
      <ha-card style="--bom-card-radius:${this._config.square_style ? '0px' : 'var(--ha-card-border-radius, 12px)'}">
        <div class="card-content${this._config.square_style ? ' is-square' : ''}">
          <div id="map" style="height: ${this._config.map_height}px"></div>
          <div class="loading-overlay" id="loading">
            <div class="spinner"></div>
            <div class="loading-text">Loading radar data</div>
          </div>
          ${this._config.show_playback ? `
          <div class="controls">
            <button class="play-btn" id="play-btn" aria-label="Play/Pause">${ICON_PAUSE}</button>
            <div class="timeline" id="timeline"></div>
            <span class="time-label" id="time-label">--:--</span>
          </div>` : ''}
        </div>
      </ha-card>
    `;

    try {
      this._renderTopOverlays();
      this._L = await loadLeaflet();
      await this._initMap(this._L);
      // Fade out loading overlay
      const loading = this.shadowRoot.getElementById('loading');
      if (loading) {
        loading.classList.add('hidden');
        setTimeout(() => loading.remove(), 300);
      }
    } catch (err) {
      this._initialized = false;
      console.error('BOM Radar Card: Failed to initialize', err);
      const loading = this.shadowRoot.getElementById('loading');
      if (loading) {
        loading.innerHTML = `<div class="error-text">Failed to load radar</div>`;
      }
    }
  }

  async _initMap(L) {
    const container = this.shadowRoot.getElementById('map');
    if (!container) return;

    const lat = this._config.center_latitude ?? this._hass?.config?.latitude ?? -33.87;
    const lon = this._config.center_longitude ?? this._hass?.config?.longitude ?? 151.21;

    this._map = L.map(container, {
      center: [lat, lon],
      zoom: this._config.zoom_level,
      zoomControl: false,
      attributionControl: this._config.show_attribution,
      maxBounds: [[-55, 95], [5, 175]],
      minZoom: MIN_MAP_ZOOM,
      maxZoom: MAX_DISPLAY_ZOOM,
    });
    if (this._config.show_attribution && this._map.attributionControl) {
      this._map.attributionControl.setPrefix(false);
    }
    this._lastRadarDisplayZoom = this._map.getZoom();

    // Add zoom control to top-right
    if (this._config.show_zoom) {
      L.control.zoom({ position: 'topright' }).addTo(this._map);
    }
    if (this._config.show_recenter) {
      this._addRecenterControl(L);
    }
    if (this._config.show_layer_switcher) {
      this._addLayerSwitcherControl(L);
    }

    const basemapUrl = this._config.dark_basemap
      ? 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png';

    const labelsUrl = this._config.dark_basemap
      ? 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png';

    // Base tiles (below radar)
    L.tileLayer(basemapUrl, {
      subdomains: 'abcd',
      maxZoom: MAX_DISPLAY_ZOOM,
    }).addTo(this._map);

    // Load radar data (middle layer)
    await this._loadRadarData(L);

    // Labels on top of radar
    L.tileLayer(labelsUrl, {
      attribution: '&copy; <a href="https://carto.com">CARTO</a> | &copy; <a href="http://www.bom.gov.au">BOM</a>',
      subdomains: 'abcd',
      maxZoom: MAX_DISPLAY_ZOOM,
      pane: 'overlayPane',
    }).addTo(this._map);

    // Home marker
    if (this._config.show_marker) {
      const [mLat, mLon] = this._getHomeCoordinates();
      const icon = L.divIcon({
        className: 'marker-dot',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      L.marker([mLat, mLon], { icon, interactive: false }).addTo(this._map);
    }

    this._setupControls();
    if (this._playing) this._startAnimation();

    // Auto-refresh every 5 minutes
    this._updateTimer = setInterval(() => this._refreshData(), 300000);

    // Pause animation during map interaction
    this._map.on('movestart', () => {
      if (this._playing) this._stopAnimation();
    });
    this._map.on('zoomstart', () => {
      this._pendingZoomRebuild = true;
      this._previousDisplayZoom = this._lastRadarDisplayZoom ?? this._map?.getZoom() ?? this._config.zoom_level;
      if (this._playing) this._stopAnimation();
    });
    this._map.on('moveend', () => {
      if (this._pendingZoomRebuild) return;
      if (this._playing) this._startAnimation();
    });
    this._map.on('zoomend', async () => {
      const nextZoom = this._map?.getZoom();
      const previousZoom = this._previousDisplayZoom ?? nextZoom;

      try {
        if (this._shouldRebuildRadarOnZoom(previousZoom, nextZoom)) {
          await this._rebuildRadarLayers();
        }
      } finally {
        this._lastRadarDisplayZoom = nextZoom;
        this._previousDisplayZoom = null;
        this._pendingZoomRebuild = false;
        if (this._playing) this._startAnimation();
      }
    });

    // Handle resize
    this._resizeObserver = new ResizeObserver(() => this._map?.invalidateSize());
    this._resizeObserver.observe(container);
  }

  _addRecenterControl(L) {
    const control = L.control({ position: 'topright' });
    control.onAdd = () => {
      const container = L.DomUtil.create('div', 'leaflet-control bom-recenter-control');
      const button = L.DomUtil.create('button', 'bom-recenter-button', container);
      button.type = 'button';
      button.innerHTML = ICON_RECENTER;
      button.title = 'Recenter to home location';
      button.setAttribute('aria-label', 'Recenter to home location');

      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);
      L.DomEvent.on(button, 'click', () => {
        const [homeLat, homeLon] = this._getHomeCoordinates();
        this._map?.panTo([homeLat, homeLon], { animate: true });
      });

      return container;
    };
    control.addTo(this._map);
  }

  _addLayerSwitcherControl(L) {
    const control = L.control({ position: 'topright' });
    control.onAdd = () => {
      const container = L.DomUtil.create('div', 'leaflet-control bom-layer-control');
      const button = L.DomUtil.create('button', 'bom-layer-button', container);
      const panel = L.DomUtil.create('div', 'bom-layer-panel', container);

      button.type = 'button';
      button.innerHTML = ICON_LAYERS;
      button.title = 'Choose radar layer';
      button.setAttribute('aria-label', 'Choose radar layer');
      button.setAttribute('aria-haspopup', 'true');
      button.setAttribute('aria-expanded', 'false');

      Object.entries(BOM_LAYERS).forEach(([key, layer]) => {
        const option = L.DomUtil.create('button', 'bom-layer-option', panel);
        option.type = 'button';
        option.dataset.layer = key;
        option.innerHTML = `
          <span class="bom-layer-option-name">${layer.name}</span>
          <span class="bom-layer-option-unit">${layer.unit}</span>
        `;
        L.DomEvent.on(option, 'click', async (ev) => {
          L.DomEvent.stop(ev);
          await this._setLayer(key);
        });
      });

      const togglePanel = (ev) => {
        L.DomEvent.stop(ev);
        const isOpen = !panel.classList.contains('is-open');
        panel.classList.toggle('is-open', isOpen);
        button.classList.toggle('is-open', isOpen);
        button.setAttribute('aria-expanded', String(isOpen));
      };

      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);
      L.DomEvent.on(button, 'click', togglePanel);

      this._layerSwitcher = { button, panel };
      this._syncLayerSwitcherState();
      return container;
    };
    control.addTo(this._map);
    this._map.on('click movestart zoomstart', () => this._closeLayerSwitcher());
  }

  _renderTopOverlays() {
    const content = this.shadowRoot.querySelector('.card-content');
    const map = this.shadowRoot.getElementById('map');
    if (!content || !map) return;

    content.querySelector('.layer-badge')?.remove();
    content.querySelector('.legend-card')?.remove();

    const layerConfig = BOM_LAYERS[this._config.layer] || BOM_LAYERS.reflectivity;
    const legendConfig = this._config.show_legend ? getLegendConfig(this._config.layer) : null;

    content.classList.toggle('has-top-legend', Boolean(legendConfig));

    if (this._config.show_layer_label) {
      map.insertAdjacentHTML('beforebegin', `<div class="layer-badge">${layerConfig.name}</div>`);
    }
    if (legendConfig) {
      map.insertAdjacentHTML('beforebegin', renderLegendHtml(this._config.layer));
    }
  }

  _closeLayerSwitcher() {
    if (!this._layerSwitcher) return;
    this._layerSwitcher.panel.classList.remove('is-open');
    this._layerSwitcher.button.classList.remove('is-open');
    this._layerSwitcher.button.setAttribute('aria-expanded', 'false');
  }

  _syncLayerSwitcherState() {
    if (!this._layerSwitcher) return;
    const layerConfig = BOM_LAYERS[this._config.layer] || BOM_LAYERS.reflectivity;
    this._layerSwitcher.button.title = `Radar layer: ${layerConfig.name}`;
    this._layerSwitcher.button.setAttribute('aria-label', `Radar layer: ${layerConfig.name}`);
    this._layerSwitcher.panel.querySelectorAll('.bom-layer-option').forEach((option) => {
      const isActive = option.dataset.layer === this._config.layer;
      option.classList.toggle('is-active', isActive);
      option.setAttribute('aria-pressed', String(isActive));
    });
  }

  async _setLayer(layerKey) {
    if (!BOM_LAYERS[layerKey] || layerKey === this._config.layer) {
      this._closeLayerSwitcher();
      return;
    }

    this._config.layer = layerKey;
    this._renderTopOverlays();
    this._syncLayerSwitcherState();
    this._closeLayerSwitcher();

    if (!this._L || !this._map) return;

    try {
      await this._refreshData();
    } catch (err) {
      console.warn(`BOM Radar Card: Failed to switch to layer "${layerKey}"`, err);
    }
  }

  async _loadRadarData(L) {
    const layerConfig = BOM_LAYERS[this._config.layer] || BOM_LAYERS.reflectivity;
    const timestamps = await getLayerTimestamps(layerConfig, this._config.frame_count);

    if (!timestamps.length) return;

    this._timestamps = timestamps;
    this._currentFrame = this._timestamps.length - 1;
    this._replaceRadarLayers(L, layerConfig);
    this._updateTimeline();
    this._updateTimeLabel();
  }

  _replaceRadarLayers(L, layerConfig) {
    const activeFrame = Math.min(this._currentFrame, this._timestamps.length - 1);

    // Remove old layers
    this._radarLayers.forEach(layer => {
      if (this._map.hasLayer(layer)) this._map.removeLayer(layer);
    });
    this._radarLayers = [];

    for (let i = 0; i < this._timestamps.length; i++) {
      const time = this._timestamps[i];
      const layer = createBomTileLayer(L, layerConfig.id, layerConfig.tileMatrixSet, time, {
        opacity: i === activeFrame ? this._config.radar_opacity : 0,
        maxZoom: MAX_DISPLAY_ZOOM,
        maxNativeZoom: MAX_RADAR_NATIVE_ZOOM,
        minZoom: MIN_MAP_ZOOM,
      });
      layer.addTo(this._map);
      this._radarLayers.push(layer);
    }

    this._currentFrame = activeFrame;
  }

  _shouldRebuildRadarOnZoom(previousZoom, nextZoom) {
    const previous = Math.round(previousZoom ?? nextZoom ?? this._config.zoom_level);
    const next = Math.round(nextZoom ?? previous);

    return previous !== next && (previous > MAX_RADAR_NATIVE_ZOOM || next > MAX_RADAR_NATIVE_ZOOM);
  }

  async _rebuildRadarLayers() {
    if (!this._L || !this._map || !this._timestamps.length) return;
    const layerConfig = BOM_LAYERS[this._config.layer] || BOM_LAYERS.reflectivity;
    this._replaceRadarLayers(this._L, layerConfig);
  }

  async _refreshData() {
    if (!this._L || !this._map) return;
    try {
      const wasPlaying = this._playing;
      if (wasPlaying) this._stopAnimation();
      await this._loadRadarData(this._L);
      this._buildTimeline();
      if (wasPlaying) this._startAnimation();
    } catch (err) {
      console.warn('BOM Radar Card: Refresh failed', err);
    }
  }

  _setupControls() {
    const playBtn = this.shadowRoot.getElementById('play-btn');
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        this._playing = !this._playing;
        playBtn.innerHTML = this._playing ? ICON_PAUSE : ICON_PLAY;
        if (this._playing) {
          this._startAnimation();
        } else {
          this._stopAnimation();
        }
      });
    }
    this._buildTimeline();
  }

  _buildTimeline() {
    const timeline = this.shadowRoot.getElementById('timeline');
    if (!timeline) return;

    timeline.innerHTML = '';
    for (let i = 0; i < this._timestamps.length; i++) {
      const dot = document.createElement('div');
      dot.className = 'frame-dot' + (i === this._currentFrame ? ' active' : i < this._currentFrame ? ' past' : '');
      dot.addEventListener('click', () => {
        this._stopAnimation();
        this._showFrame(i);
        this._playing = false;
        const playBtn = this.shadowRoot.getElementById('play-btn');
        if (playBtn) playBtn.innerHTML = ICON_PLAY;
      });
      timeline.appendChild(dot);
    }
  }

  _showFrame(index) {
    for (let i = 0; i < this._radarLayers.length; i++) {
      this._radarLayers[i].setOpacity(i === index ? this._config.radar_opacity : 0);
    }
    this._currentFrame = index;
    this._updateTimeline();
    this._updateTimeLabel();
  }

  _updateTimeline() {
    const dots = this.shadowRoot.querySelectorAll('.frame-dot');
    dots.forEach((dot, i) => {
      dot.className = 'frame-dot' + (i === this._currentFrame ? ' active' : i < this._currentFrame ? ' past' : '');
    });
  }

  _updateTimeLabel() {
    const label = this.shadowRoot.getElementById('time-label');
    if (!label || !this._timestamps[this._currentFrame]) return;

    const time = new Date(this._timestamps[this._currentFrame]);
    label.textContent = time.toLocaleTimeString('en-AU', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  }

  _startAnimation() {
    this._stopAnimation();
    const advance = () => {
      let nextFrame = this._currentFrame + 1;
      let delay = this._config.frame_delay;

      if (nextFrame >= this._timestamps.length) {
        nextFrame = 0;
      }
      if (nextFrame === this._timestamps.length - 1) {
        delay = this._config.restart_delay;
      }

      this._showFrame(nextFrame);
      this._animationTimer = setTimeout(advance, delay);
    };

    this._animationTimer = setTimeout(advance, this._config.frame_delay);
  }

  _stopAnimation() {
    if (this._animationTimer) {
      clearTimeout(this._animationTimer);
      this._animationTimer = null;
    }
  }

  disconnectedCallback() {
    this._stopAnimation();
    this._closeLayerSwitcher();
    if (this._updateTimer) {
      clearInterval(this._updateTimer);
      this._updateTimer = null;
    }
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    if (this._map) {
      this._map.remove();
      this._map = null;
    }
    this._layerSwitcher = null;
    this._initialized = false;
  }
}


// Visual config editor
class BomRadarCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  set hass(hass) {
    this._hass = hass;
  }

  setConfig(config) {
    this._config = { ...config };
    this._render();
  }

  _render() {
    const cfg = this._config;
    this.shadowRoot.innerHTML = `
      <style>
        .editor { padding:16px; }
        .section { margin-bottom:14px; }
        .section-title { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.8px; color:var(--secondary-text-color); margin-bottom:8px; }
        .row { margin-bottom:8px; }
        .row-inline { display:flex; gap:12px; }
        .row-inline>.row { flex:1; }
        label { display:block; font-size:12px; font-weight:500; margin-bottom:4px; color:var(--primary-text-color); }
        select,input[type="number"] { width:100%; padding:8px 10px; border:1px solid var(--divider-color); border-radius:10px; background:var(--card-background-color); color:var(--primary-text-color); font-size:14px; box-sizing:border-box; }
        select:focus,input:focus { outline:none; border-color:#00BCD4; }
        .toggle-row { display:flex; align-items:center; justify-content:space-between; padding:4px 0; }
        .toggle-label { font-size:13px; color:var(--primary-text-color); }
        .toggle { position:relative; width:36px; height:20px; flex-shrink:0; }
        .toggle input { opacity:0; width:0; height:0; }
        .toggle-slider { position:absolute; cursor:pointer; inset:0; background:rgba(255,255,255,0.12); border-radius:10px; transition:background 0.2s; }
        .toggle-slider::before { position:absolute; content:''; height:16px; width:16px; left:2px; bottom:2px; background:#fff; border-radius:50%; transition:transform 0.2s; }
        .toggle input:checked+.toggle-slider { background:#00BCD4; }
        .toggle input:checked+.toggle-slider::before { transform:translateX(16px); }
      </style>
      <div class="editor">
        <div class="section">
          <div class="section-title">Radar</div>
          <div class="row">
            <label>Layer</label>
            <select id="layer">
              ${Object.entries(BOM_LAYERS).map(([key, val]) =>
                `<option value="${key}" ${cfg.layer === key ? 'selected' : ''}>${val.name} (${val.unit})</option>`
              ).join('')}
            </select>
          </div>
          <div class="row-inline">
            <div class="row">
              <label>Radar Opacity</label>
              <input type="number" id="radar_opacity" min="0.1" max="1" step="0.1" value="${cfg.radar_opacity || 0.7}">
            </div>
            <div class="row">
              <label>Frames</label>
              <input type="number" id="frame_count" min="1" max="9" value="${cfg.frame_count || 9}">
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Map</div>
          <div class="row-inline">
            <div class="row">
              <label>Zoom (3-12)</label>
              <input type="number" id="zoom_level" min="3" max="12" value="${cfg.zoom_level || 6}">
            </div>
            <div class="row">
              <label>Height (px)</label>
              <input type="number" id="map_height" min="150" max="800" value="${cfg.map_height || 300}">
            </div>
          </div>
          <div class="row-inline">
            <div class="row">
              <label>Center Lat</label>
              <input type="number" id="center_latitude" step="0.01" value="${cfg.center_latitude ?? ''}">
            </div>
            <div class="row">
              <label>Center Lon</label>
              <input type="number" id="center_longitude" step="0.01" value="${cfg.center_longitude ?? ''}">
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Animation</div>
          <div class="row-inline">
            <div class="row">
              <label>Frame Delay (ms)</label>
              <input type="number" id="frame_delay" min="100" max="2000" step="50" value="${cfg.frame_delay || 500}">
            </div>
            <div class="row">
              <label>Loop Pause (ms)</label>
              <input type="number" id="restart_delay" min="500" max="5000" step="100" value="${cfg.restart_delay || 1500}">
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Display</div>
          ${this._toggle('dark_basemap', 'Dark basemap', cfg.dark_basemap !== false)}
          ${this._toggle('show_marker', 'Home marker', cfg.show_marker !== false)}
          ${this._toggle('show_zoom', 'Zoom controls', cfg.show_zoom !== false)}
          ${this._toggle('show_recenter', 'Recenter button', cfg.show_recenter !== false)}
          ${this._toggle('show_layer_switcher', 'Layer switcher', cfg.show_layer_switcher !== false)}
          ${this._toggle('show_playback', 'Playback controls', cfg.show_playback !== false)}
          ${this._toggle('show_legend', 'Radar legend', cfg.show_legend !== false)}
          ${this._toggle('square_style', 'Square style', cfg.square_style === true)}
          ${this._toggle('show_layer_label', 'Layer label', cfg.show_layer_label === true)}
          ${this._toggle('show_attribution', 'Attribution', cfg.show_attribution !== false)}
        </div>

        <div class="section">
          <div class="section-title">Marker Position</div>
          <div class="row-inline">
            <div class="row">
              <label>Marker Lat</label>
              <input type="number" id="marker_latitude" step="0.01" value="${cfg.marker_latitude ?? ''}">
            </div>
            <div class="row">
              <label>Marker Lon</label>
              <input type="number" id="marker_longitude" step="0.01" value="${cfg.marker_longitude ?? ''}">
            </div>
          </div>
        </div>
      </div>
    `;

    // Bind events
    const fields = [
      'layer', 'zoom_level', 'map_height', 'center_latitude', 'center_longitude',
      'frame_delay', 'restart_delay', 'radar_opacity', 'frame_count',
      'marker_latitude', 'marker_longitude',
    ];
    fields.forEach(id => {
      const el = this.shadowRoot.getElementById(id);
      if (el) el.addEventListener('change', () => this._valueChanged());
    });

    const toggles = [
      'dark_basemap', 'show_marker', 'show_zoom', 'show_recenter', 'show_layer_switcher', 'show_playback',
      'show_legend', 'square_style', 'show_layer_label', 'show_attribution',
    ];
    toggles.forEach(id => {
      const el = this.shadowRoot.getElementById(id);
      if (el) el.addEventListener('change', () => this._valueChanged());
    });
  }

  _toggle(id, label, checked) {
    return `
      <div class="toggle-row">
        <span class="toggle-label">${label}</span>
        <label class="toggle">
          <input type="checkbox" id="${id}" ${checked ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </div>
    `;
  }

  _valueChanged() {
    const config = { ...this._config };

    const get = (id) => this.shadowRoot.getElementById(id);

    const layer = get('layer');
    if (layer) config.layer = layer.value;

    const numFields = {
      zoom_level: 'int', map_height: 'int', frame_delay: 'int',
      restart_delay: 'int', frame_count: 'int',
      center_latitude: 'float', center_longitude: 'float',
      marker_latitude: 'float', marker_longitude: 'float',
      radar_opacity: 'float',
    };

    Object.entries(numFields).forEach(([id, type]) => {
      const el = get(id);
      if (!el) return;
      if (el.value === '') {
        delete config[id];
      } else {
        config[id] = type === 'int' ? parseInt(el.value) : parseFloat(el.value);
      }
    });

    const toggleFields = [
      'dark_basemap', 'show_marker', 'show_zoom', 'show_recenter', 'show_layer_switcher', 'show_playback',
      'show_legend', 'square_style', 'show_layer_label', 'show_attribution',
    ];
    toggleFields.forEach(id => {
      const el = get(id);
      if (el) config[id] = el.checked;
    });

    this._config = config;
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config } }));
  }
}

function defineCustomElement(name, ctor) {
  if (customElements.get(name)) {
    return;
  }

  try {
    customElements.define(name, ctor);
  } catch (err) {
    if (!String(err?.message || '').includes(`the name "${name}" has already been used`)) {
      throw err;
    }
  }
}

defineCustomElement('bom-radar-card', BomRadarCard);
defineCustomElement('bom-radar-card-editor', BomRadarCardEditor);

window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === 'bom-radar-card')) {
  window.customCards.push({
    type: 'bom-radar-card',
    name: 'BOM Radar Card',
    description: 'Australian Bureau of Meteorology rain radar using native BOM WMTS tiles',
    preview: true,
    documentationURL: 'https://github.com/AshtonAU/bom-radar-card',
  });
}
