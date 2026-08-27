/**
 * BOM Radar Card for Home Assistant
 * Uses native BOM WMTS tiles from api.bom.gov.au
 *
 * Author: Ashton Turner (github.com/AshtonAU)
 * License: MIT
 */

import * as Leaflet from 'leaflet/dist/leaflet-src.esm.js';

import { BOM_LAYER_GROUPS, BOM_LAYERS, BOM_TILE_MATRIX_SETS } from './bom-layers.js';
import {
  collectLightningStrikes,
  colorForAge,
  guardLightningRenderer,
  isBlitzortungLoaded,
  opacityForAge,
  pulseScale,
  removeLightningLayers,
} from './lightning.js';
import { getFixedHeightGridOptions } from './grid-options.js';
import { loadImageWithRetry } from './image-retry.js';
import { createResizeGuardedMap, invalidateMapSizeIfVisible } from './map-resize.js';
import {
  RADAR_COVERAGE_TILE_OPTIONS,
  RADAR_COVERAGE_TILE_URL,
  shouldShowRadarCoverage,
  supportsRadarCoverageLayer,
} from './radar-coverage.js';
import { replaceShadowContentPreservingCardMod } from './shadow-content.js';
import {
  createImageAvailabilityProbe,
  createTimestampAvailabilityResolver,
} from './timestamp-availability.js';
import { generateFallbackTimestamps } from './timestamps.js';

const CARD_VERSION = '1.11.0';
const DEFAULT_ACCENT_COLOR = '#00BCD4';
const DEFAULT_UI_ACCENT_COLOR = '#F8FAFC';

console.info(
  `%c BOM-RADAR-CARD %c v${CARD_VERSION} `,
  'color: #00BCD4; font-weight: bold; background: #1a1a2e',
  'color: white; font-weight: bold; background: #16213e',
);

// BOM WMTS Configuration
const BOM_WMTS_BASE = 'https://api.bom.gov.au/apikey/v1/mapping/timeseries/wmts';

const DEFAULT_ENABLED_LAYERS = Object.keys(BOM_LAYERS);

const RADAR_LEGEND = {
  gradient: 'linear-gradient(90deg, rgb(245, 245, 255) 0%, rgb(180, 180, 255) 7%, rgb(120, 120, 255) 14%, rgb(20, 20, 255) 21%, rgb(0, 216, 195) 28%, rgb(0, 150, 144) 35%, rgb(0, 102, 102) 42%, rgb(255, 255, 0) 49%, rgb(255, 200, 0) 56%, rgb(255, 150, 0) 63%, rgb(255, 100, 0) 70%, rgb(255, 0, 0) 77%, rgb(200, 0, 0) 84%, rgb(120, 0, 0) 91%, rgb(40, 0, 0) 100%)',
};

const MIN_MAP_ZOOM = 3;
const MAX_BOM_NATIVE_ZOOM = 8;
const MAX_DISPLAY_ZOOM = 8;
const MAX_OVERZOOM_DISPLAY_ZOOM = 10;
const MAX_MAP_HEIGHT = 4096;
const MAX_TIMEOUT_DELAY_MS = 2147483647;
const BASEMAP_STYLE_AUTO = 'auto';
const SUN_ENTITY_ID = 'sun.sun';

const HALF_EXTENT = 20037508.342789244;
const WORLD_EXTENT = HALF_EXTENT * 2;
const MAX_BOM_MAPSERVER_NATIVE_ZOOM = 10;
const RADAR_COVERAGE_PANE = 'bomRadarCoveragePane';
const RADAR_COVERAGE_PANE_Z_INDEX = 350;
const BOM_REFERENCE_OVERLAY_BASE_URL = 'https://api.bom.gov.au/apikey/v1/mapping/overlays';
const BOM_REFERENCE_OVERLAY_STYLES = {
  state_borders: { name: 'State borders' },
  coastal_areas: { name: 'Coastal areas' },
  forecast_districts: { name: 'Forecast districts' },
  drainage_divisions: { name: 'Drainage divisions' },
  railways: { name: 'Railways' },
  lakes: { name: 'Lakes' },
};

const BASEMAP_PROVIDER_NAMES = {
  carto: 'CARTO',
  bom: 'BOM',
  stadia: 'Stadia Maps',
  esri: 'Esri',
};
const DEFAULT_BASEMAP_PROVIDER = 'bom';

const CARTO_ATTRIBUTION = '&copy; <a href="https://carto.com">CARTO</a> | &copy; <a href="http://www.bom.gov.au">BOM</a>';
const BOM_ATTRIBUTION = '&copy; <a href="http://www.bom.gov.au">BOM</a>';
const STADIA_ATTRIBUTION = '&copy; <a href="https://www.stadiamaps.com">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | &copy; <a href="http://www.bom.gov.au">BOM</a>';
const STADIA_STAMEN_ATTRIBUTION = '&copy; <a href="https://www.stadiamaps.com">Stadia Maps</a> &copy; <a href="https://stamen.com/">Stamen Design</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | &copy; <a href="http://www.bom.gov.au">BOM</a>';
const STADIA_SATELLITE_ATTRIBUTION = '&copy; <a href="https://www.stadiamaps.com">Stadia Maps</a> &copy; CNES, Distribution Airbus DS, &copy; Airbus DS, &copy; PlanetObserver (Contains Copernicus Data), &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | &copy; <a href="http://www.bom.gov.au">BOM</a>';
const ESRI_IMAGERY_ATTRIBUTION = 'Tiles &copy; Esri, Maxar, Earthstar Geographics | Labels &copy; Esri | &copy; <a href="http://www.bom.gov.au">BOM</a>';
const ESRI_TOPO_ATTRIBUTION = 'Tiles &copy; Esri, TomTom, Garmin, FAO, NOAA, USGS, OpenStreetMap contributors | &copy; <a href="http://www.bom.gov.au">BOM</a>';

const BASEMAP_PROVIDER_STYLES = {
  carto: {
    dark: {
      name: 'CARTO Dark Matter',
      baseUrl: 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
      labelsUrl: 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png',
      attribution: CARTO_ATTRIBUTION,
      background: '#0d1117',
    },
    light: {
      name: 'CARTO Voyager',
      baseUrl: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png',
      labelsUrl: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png',
      attribution: CARTO_ATTRIBUTION,
      background: '#f2f3f0',
    },
  },
  bom: {
    default: {
      name: 'BOM Default',
      baseUrl: 'https://api.bom.gov.au/apikey/v1/mapping/basemaps/basemap_default/MapServer/tile/{z}/{y}/{x}?blankTile=false',
      labelsUrl: null,
      attribution: BOM_ATTRIBUTION,
      background: '#e8eef2',
      maxNativeZoom: MAX_BOM_MAPSERVER_NATIVE_ZOOM,
    },
    dark: {
      name: 'BOM Dark',
      baseUrl: 'https://api.bom.gov.au/apikey/v1/mapping/basemaps/basemap_dark/MapServer/tile/{z}/{y}/{x}?blankTile=false',
      labelsUrl: null,
      attribution: BOM_ATTRIBUTION,
      background: '#111827',
      maxNativeZoom: MAX_BOM_MAPSERVER_NATIVE_ZOOM,
    },
  },
  stadia: {
    alidade_dark: {
      name: 'Alidade Smooth Dark',
      baseUrl: 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png',
      labelsUrl: null,
      attribution: STADIA_ATTRIBUTION,
      background: '#0d1117',
    },
    alidade_light: {
      name: 'Alidade Smooth',
      baseUrl: 'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png',
      labelsUrl: null,
      attribution: STADIA_ATTRIBUTION,
      background: '#f2f3f0',
    },
    outdoors: {
      name: 'Outdoors',
      baseUrl: 'https://tiles.stadiamaps.com/tiles/outdoors/{z}/{x}/{y}{r}.png',
      labelsUrl: null,
      attribution: STADIA_ATTRIBUTION,
      background: '#f1f4ee',
    },
    osm_bright: {
      name: 'OSM Bright',
      baseUrl: 'https://tiles.stadiamaps.com/tiles/osm_bright/{z}/{x}/{y}{r}.png',
      labelsUrl: null,
      attribution: STADIA_ATTRIBUTION,
      background: '#f6f8fb',
    },
    terrain: {
      name: 'Stamen Terrain',
      baseUrl: 'https://tiles.stadiamaps.com/tiles/stamen_terrain/{z}/{x}/{y}{r}.png',
      labelsUrl: null,
      attribution: STADIA_STAMEN_ATTRIBUTION,
      background: '#f2efe9',
    },
    satellite: {
      name: 'Alidade Satellite',
      baseUrl: 'https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}{r}.jpg',
      labelsUrl: null,
      attribution: STADIA_SATELLITE_ATTRIBUTION,
      background: '#0d1117',
    },
  },
  esri: {
    imagery: {
      name: 'World Imagery',
      baseUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      labelsUrl: 'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      attribution: ESRI_IMAGERY_ATTRIBUTION,
      background: '#0d1117',
    },
    topo: {
      name: 'World Topo',
      baseUrl: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
      labelsUrl: null,
      attribution: ESRI_TOPO_ATTRIBUTION,
      background: '#f2f3f0',
    },
  },
};

// 1x1 transparent PNG for out-of-bounds tiles
const TRANSPARENT_PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

function hasOwnKey(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function getTileOffset(tileMatrixSet, z) {
  if (z < 0 || z > MAX_BOM_NATIVE_ZOOM) return null;
  const info = BOM_TILE_MATRIX_SETS[tileMatrixSet]?.[z];
  if (!info) return null;
  const tileSpan = WORLD_EXTENT / Math.pow(2, z);
  const xOffset = Math.round((info.tlx + HALF_EXTENT) / tileSpan);
  const yOffset = Math.round((HALF_EXTENT - info.tly) / tileSpan);
  return {
    xOffset,
    yOffset,
    xShiftPx: (((info.tlx + HALF_EXTENT) / tileSpan) - xOffset) * 256,
    yShiftPx: (((HALF_EXTENT - info.tly) / tileSpan) - yOffset) * 256,
    width: info.w,
    height: info.h,
  };
}

function getBasemapProvider(config) {
  return hasOwnKey(BASEMAP_PROVIDER_STYLES, config?.basemap_provider) ? config.basemap_provider : DEFAULT_BASEMAP_PROVIDER;
}

function getDefaultBasemapStyle(provider, darkBasemap) {
  if (provider === 'bom') {
    return darkBasemap ? 'dark' : 'default';
  }

  if (provider === 'stadia') {
    return darkBasemap ? 'alidade_dark' : 'alidade_light';
  }

  if (provider === 'esri') {
    return darkBasemap ? 'imagery' : 'topo';
  }

  return darkBasemap ? 'dark' : 'light';
}

function providerSupportsAutoBasemap(provider) {
  return Boolean(
    hasOwnKey(BASEMAP_PROVIDER_STYLES[provider] || {}, getDefaultBasemapStyle(provider, false)) &&
    hasOwnKey(BASEMAP_PROVIDER_STYLES[provider] || {}, getDefaultBasemapStyle(provider, true))
  );
}

function getConfiguredBasemapStyle(config, provider) {
  const hasLegacyDarkBasemapSetting = Object.prototype.hasOwnProperty.call(config || {}, 'dark_basemap');
  if (!config?.basemap_style && !config?.basemap_provider && !hasLegacyDarkBasemapSetting && providerSupportsAutoBasemap(provider)) {
    return BASEMAP_STYLE_AUTO;
  }

  if (config?.basemap_style === BASEMAP_STYLE_AUTO && providerSupportsAutoBasemap(provider)) {
    return BASEMAP_STYLE_AUTO;
  }

  const darkBasemap = config?.dark_basemap !== false;
  return hasOwnKey(BASEMAP_PROVIDER_STYLES[provider] || {}, config?.basemap_style)
    ? config.basemap_style
    : getDefaultBasemapStyle(provider, darkBasemap);
}

function getSunDaylightState(hass) {
  const sun = hass?.states?.[SUN_ENTITY_ID];
  if (sun?.state === 'above_horizon') return true;
  if (sun?.state === 'below_horizon') return false;

  const nextRising = Date.parse(sun?.attributes?.next_rising);
  const nextSetting = Date.parse(sun?.attributes?.next_setting);
  if (Number.isFinite(nextRising) && Number.isFinite(nextSetting)) {
    return nextSetting < nextRising;
  }

  return null;
}

function shouldUseDarkAutoBasemap(config, hass) {
  const isDaylight = getSunDaylightState(hass);
  if (isDaylight === true) return false;
  if (isDaylight === false) return true;
  return config?.dark_basemap !== false;
}

function getResolvedBasemapStyle(config, hass) {
  const provider = getBasemapProvider(config);
  const configuredStyle = getConfiguredBasemapStyle(config, provider);
  if (configuredStyle === BASEMAP_STYLE_AUTO) {
    return getDefaultBasemapStyle(provider, shouldUseDarkAutoBasemap(config, hass));
  }
  return configuredStyle;
}

function isDarkBasemapStyle(provider, style) {
  return (
    (provider === 'carto' && style === 'dark') ||
    (provider === 'bom' && style === 'dark') ||
    (provider === 'stadia' && (style === 'alidade_dark' || style === 'satellite')) ||
    (provider === 'esri' && style === 'imagery')
  );
}

function getBasemapStyleOptions(provider) {
  const resolvedProvider = getBasemapProvider({ basemap_provider: provider });
  const options = Object.entries(BASEMAP_PROVIDER_STYLES[resolvedProvider] || {})
    .map(([value, styleConfig]) => ({
      value,
      label: styleConfig.name,
    }));

  return providerSupportsAutoBasemap(resolvedProvider)
    ? [{ value: BASEMAP_STYLE_AUTO, label: 'Auto (day/night)' }, ...options]
    : options;
}

function getBasemapConfig(config, hass) {
  const provider = getBasemapProvider(config);
  const style = getResolvedBasemapStyle(config, hass);
  const styleConfig = hasOwnKey(BASEMAP_PROVIDER_STYLES[provider], style)
    ? BASEMAP_PROVIDER_STYLES[provider][style]
    : BASEMAP_PROVIDER_STYLES[DEFAULT_BASEMAP_PROVIDER][getDefaultBasemapStyle(DEFAULT_BASEMAP_PROVIDER, true)];
  const apiKey = typeof config?.basemap_api_key === 'string' ? config.basemap_api_key.trim() : '';
  const stadiaKeySuffix = apiKey ? `?api_key=${encodeURIComponent(apiKey)}` : '';
  const esriTokenSuffix = apiKey ? `?token=${encodeURIComponent(apiKey)}` : '';
  const cartoKeySuffix = apiKey ? `?key=${encodeURIComponent(apiKey)}` : '';

  if (provider === 'carto') {
    return {
      ...styleConfig,
      provider,
      style,
      baseUrl: `${styleConfig.baseUrl}${cartoKeySuffix}`,
      labelsUrl: styleConfig.labelsUrl ? `${styleConfig.labelsUrl}${cartoKeySuffix}` : null,
    };
  }

  if (provider === 'stadia') {
    return {
      ...styleConfig,
      provider,
      style,
      baseUrl: `${styleConfig.baseUrl}${stadiaKeySuffix}`,
    };
  }

  if (provider === 'esri') {
    return {
      ...styleConfig,
      provider,
      style,
      baseUrl: `${styleConfig.baseUrl}${esriTokenSuffix}`,
      labelsUrl: styleConfig.labelsUrl ? `${styleConfig.labelsUrl}${esriTokenSuffix}` : null,
    };
  }

  return {
    ...styleConfig,
    provider,
    style,
  };
}

function getBomReferenceLayerKeys(config) {
  const configuredLayers = Array.isArray(config?.bom_reference_layers)
    ? config.bom_reference_layers
    : String(config?.bom_reference_layers || '').split(',');
  const layerKeys = [...new Set(configuredLayers
    .map((layerKey) => String(layerKey).trim())
    .filter((layerKey) => hasOwnKey(BOM_REFERENCE_OVERLAY_STYLES, layerKey)))];

  if (config?.show_bom_boundaries === true && !layerKeys.includes('state_borders')) {
    layerKeys.unshift('state_borders');
  }

  return layerKeys;
}

function getEnabledLayerKeys(config) {
  const requestedLayers = Array.isArray(config?.enabled_layers)
    ? [...new Set(config.enabled_layers
      .map((key) => String(key).trim())
      .filter((key) => hasOwnKey(BOM_LAYERS, key)))]
    : [];

  if (requestedLayers.length) {
    return requestedLayers;
  }

  return [...DEFAULT_ENABLED_LAYERS];
}

function getBomLayerConfig(layerKey) {
  return hasOwnKey(BOM_LAYERS, layerKey) ? BOM_LAYERS[layerKey] : null;
}

function getConfiguredMaxDisplayZoom(config) {
  return config?.allow_overzoom ? MAX_OVERZOOM_DISPLAY_ZOOM : MAX_DISPLAY_ZOOM;
}

function getGroupedLayerEntries(layerKeys) {
  return BOM_LAYER_GROUPS
    .map((groupName) => ({
      groupName,
      entries: layerKeys
        .filter((key) => getBomLayerConfig(key)?.category === groupName)
        .map((key) => [key, getBomLayerConfig(key)]),
    }))
    .filter((group) => group.entries.length);
}

function isBlankConfigValue(value) {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

function parseFiniteNumber(value, fallback) {
  if (isBlankConfigValue(value)) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function parseOptionalFiniteNumber(value) {
  if (isBlankConfigValue(value)) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function clampNumber(value, fallback, min, max) {
  return Math.min(max, Math.max(min, parseFiniteNumber(value, fallback)));
}

function clampInteger(value, fallback, min, max) {
  if (isBlankConfigValue(value)) return Math.min(max, Math.max(min, fallback));
  const number = Number.parseInt(value, 10);
  return Math.min(max, Math.max(min, Number.isFinite(number) ? number : fallback));
}

function clampPositiveInteger(value, fallback, min, max) {
  if (isBlankConfigValue(value)) return fallback;
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.min(max, Math.max(min, number));
}

function sanitizeAccentColor(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed) ? trimmed : undefined;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
.leaflet-control{position:relative;z-index:2;pointer-events:visiblePainted;pointer-events:auto}
.leaflet-top,.leaflet-bottom{position:absolute;z-index:3;pointer-events:none}
.leaflet-top{top:0}.leaflet-right{right:0}.leaflet-bottom{bottom:0}.leaflet-left{left:0}
.leaflet-control{float:left;clear:both}
.leaflet-right .leaflet-control{float:right}
.leaflet-top .leaflet-control{margin-top:8px}
.leaflet-bottom .leaflet-control{margin-bottom:8px}
.leaflet-left .leaflet-control{margin-left:8px}
.leaflet-right .leaflet-control{margin-right:8px}
.leaflet-control-zoom{border:none;border-radius:var(--bom-control-radius);overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,0.24)}
.leaflet-control-zoom a{background-color:rgb(14 18 32 / calc(0.72 * var(--bom-chrome-opacity, 1)));backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);color:rgba(255,255,255,0.68);width:30px;height:30px;line-height:30px;text-align:center;text-decoration:none;display:block;border-bottom:1px solid rgb(255 255 255 / calc(0.05 * var(--bom-chrome-opacity, 1)));transition:background 0.15s,color 0.15s,opacity 0.15s}
.leaflet-control-zoom a:hover{background-color:rgb(18 24 42 / calc(0.84 * var(--bom-chrome-opacity, 1)));color:white}
.leaflet-control-zoom-in{border-top-left-radius:var(--bom-control-radius);border-top-right-radius:var(--bom-control-radius)}
.leaflet-control-zoom-out{border-bottom-left-radius:var(--bom-control-radius);border-bottom-right-radius:var(--bom-control-radius);border-bottom:none}
.leaflet-control-attribution{background:rgb(7 10 18 / calc(0.28 * var(--bom-chrome-opacity, 1)))!important;backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);color:rgba(255,255,255,0.38);font-size:9px;padding:1px 5px;border-radius:var(--bom-attribution-radius);line-height:1.4}
.leaflet-control-attribution a{color:color-mix(in srgb, var(--bom-ui-accent-color, #F8FAFC) 50%, transparent);text-decoration:none}
.leaflet-touch .leaflet-control-zoom a{width:36px;height:36px;line-height:36px;font-size:18px}
.bom-recenter-control{border:none;border-radius:var(--bom-control-radius);overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,0.24)}
.bom-recenter-button{appearance:none;-webkit-appearance:none;background-color:rgb(14 18 32 / calc(0.72 * var(--bom-chrome-opacity, 1)));backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);color:rgba(255,255,255,0.68);width:30px;height:30px;padding:0;display:flex;align-items:center;justify-content:center;border:none;cursor:pointer;transition:background 0.15s,color 0.15s,opacity 0.15s}
.bom-recenter-button:hover{background-color:rgb(18 24 42 / calc(0.84 * var(--bom-chrome-opacity, 1)));color:white}
.bom-recenter-button svg{width:16px;height:16px}
.leaflet-touch .bom-recenter-button{width:36px;height:36px}
.bom-layer-control{position:relative}
.bom-layer-button{appearance:none;-webkit-appearance:none;background-color:rgb(14 18 32 / calc(0.72 * var(--bom-chrome-opacity, 1)));backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);color:rgba(255,255,255,0.7);width:30px;height:30px;padding:0;display:flex;align-items:center;justify-content:center;border:none;border-radius:var(--bom-control-radius);cursor:pointer;box-shadow:0 1px 6px rgba(0,0,0,0.24);transition:background 0.15s,color 0.15s,opacity 0.15s}
.bom-layer-button:hover,.bom-layer-button.is-open{background-color:rgb(18 24 42 / calc(0.84 * var(--bom-chrome-opacity, 1)));color:white}
.bom-layer-button svg{width:16px;height:16px}
.bom-layer-panel{position:absolute;top:0;right:38px;width:192px;max-width:192px;padding:4px;display:none;flex-direction:column;gap:3px;background:rgb(8 11 20 / calc(0.86 * var(--bom-chrome-opacity, 1)));backdrop-filter:blur(12px) saturate(1.35);-webkit-backdrop-filter:blur(12px) saturate(1.35);border:1px solid rgb(255 255 255 / calc(0.06 * var(--bom-chrome-opacity, 1)));border-radius:var(--bom-control-radius);box-shadow:0 8px 22px rgba(0,0,0,0.28)}
.bom-layer-panel.is-open{display:flex}
.bom-layer-panel{max-height:var(--bom-layer-panel-max-height, min(70vh,520px));overflow:auto;overscroll-behavior:contain}
.bom-layer-group{padding:8px 10px 4px;font-size:10px;font-weight:700;line-height:1;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.34)}
.bom-layer-option{appearance:none;-webkit-appearance:none;width:100%;padding:8px 10px;border:none;border-radius:calc(var(--bom-control-radius) - 2px);background:transparent;color:rgba(255,255,255,0.68);cursor:pointer;text-align:left;transition:background 0.15s,color 0.15s}
.bom-layer-option:hover,.bom-layer-option.is-active{background:rgb(255 255 255 / calc(0.08 * var(--bom-chrome-opacity, 1)));color:white}
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
  position: relative;
  isolation: isolate;
  z-index: 0;
  border-radius: var(--bom-card-radius, var(--ha-card-border-radius, 12px));
  background: var(--ha-card-background, var(--card-background-color, rgba(26, 26, 46, 0.6)));
  box-shadow: var(--ha-card-box-shadow, none);
}
.card-content {
  --bom-control-radius: 8px;
  --bom-badge-radius: 8px;
  --bom-bar-radius: 12px;
  --bom-attribution-radius: 6px 0 0 0;
  --bom-track-radius: 1.5px;
  padding: 0;
  position: relative;
  isolation: isolate;
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
  top: 16px;
}
.card-content.has-top-legend .leaflet-top .leaflet-control {
  margin-top: 18px;
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
  bottom: 8px;
  left: 8px;
  right: 8px;
  z-index: 4;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 5px 9px;
  background: rgb(8 11 20 / calc(0.74 * var(--bom-chrome-opacity, 1)));
  backdrop-filter: blur(12px) saturate(1.35);
  -webkit-backdrop-filter: blur(12px) saturate(1.35);
  border-radius: var(--bom-bar-radius);
  border: 1px solid rgb(255 255 255 / calc(0.05 * var(--bom-chrome-opacity, 1)));
  box-shadow: 0 3px 12px rgba(0, 0, 0, 0.24);
}
.play-btn {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.78);
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: var(--bom-control-radius);
  transition: background 0.15s, transform 0.1s;
  flex-shrink: 0;
}
.play-btn svg {
  width: 15px;
  height: 15px;
}
.play-btn:hover {
  background: rgb(255 255 255 / calc(0.08 * var(--bom-chrome-opacity, 1)));
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
  height: 24px;
  padding: 0 2px;
}
.frame-dot {
  appearance: none;
  -webkit-appearance: none;
  flex: 1;
  height: 3px;
  border-radius: var(--bom-track-radius);
  border: 0;
  padding: 0;
  background: rgba(255, 255, 255, 0.1);
  cursor: pointer;
  transition: background 0.2s, height 0.15s, box-shadow 0.2s;
  position: relative;
}
.frame-dot:hover {
  background: rgba(255, 255, 255, 0.25);
  height: 5px;
}
.frame-dot:focus-visible {
  outline: 2px solid var(--bom-ui-accent-color, #F8FAFC);
  outline-offset: 2px;
}
.frame-dot.active {
  background: var(--bom-ui-accent-color, #F8FAFC);
  height: 5px;
  box-shadow: 0 0 8px color-mix(in srgb, var(--bom-ui-accent-color, #F8FAFC) 50%, transparent);
}
.frame-dot.past {
  background: color-mix(in srgb, var(--bom-ui-accent-color, #F8FAFC) 25%, transparent);
}

/* Time label */
.time-label {
  color: rgba(255, 255, 255, 0.54);
  font-size: 10px;
  font-weight: 500;
  min-width: 38px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
  letter-spacing: 0.3px;
}

/* Layer label */
.layer-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 4;
  padding: 3px 9px;
  background: rgb(8 11 20 / calc(0.58 * var(--bom-chrome-opacity, 1)));
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  border-radius: var(--bom-badge-radius);
  border: 1px solid rgb(255 255 255 / calc(0.05 * var(--bom-chrome-opacity, 1)));
  color: rgba(255, 255, 255, 0.5);
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.7px;
  pointer-events: none;
}

/* Legend */
.legend-card {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 4;
  pointer-events: none;
}
.legend-scale {
  height: 6px;
  border-radius: 0;
  box-shadow: inset 0 -1px 0 rgba(255, 255, 255, 0.08);
}

/* Loading state */
.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 5;
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
  border: 2px solid color-mix(in srgb, var(--bom-ui-accent-color, #F8FAFC) 15%, transparent);
  border-top-color: var(--bom-ui-accent-color, #F8FAFC);
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
  background: var(--bom-map-accent-color, var(--accent-color, #00BCD4));
  border: 2px solid rgba(255, 255, 255, 0.9);
  border-radius: 50%;
  box-shadow: 0 0 10px color-mix(in srgb, var(--bom-map-accent-color, var(--accent-color, #00BCD4)) 60%, transparent), 0 0 20px color-mix(in srgb, var(--bom-map-accent-color, var(--accent-color, #00BCD4)) 20%, transparent);
}
.marker-dot::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 24px;
  height: 24px;
  background: color-mix(in srgb, var(--bom-map-accent-color, var(--accent-color, #00BCD4)) 15%, transparent);
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

function bomTileUrl(layerId, tileMatrixSet, z, col, row, time) {
  return `${BOM_WMTS_BASE}?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0` +
    `&LAYER=${layerId}&STYLE=default&FORMAT=image/png` +
    `&TILEMATRIXSET=${tileMatrixSet}&TILEMATRIX=${z}` +
    `&TILEROW=${row}&TILECOL=${col}&time=${time}`;
}

const timestampAvailabilityResolvers = new Map();

function getTimestampAvailabilityResolver(layerConfig) {
  const cacheKey = `${layerConfig.id}\u0000${layerConfig.tileMatrixSet}`;
  let resolver = timestampAvailabilityResolvers.get(cacheKey);
  if (resolver) return resolver;

  resolver = createTimestampAvailabilityResolver({
    probe: createImageAvailabilityProbe({
      buildUrl: (timestamp) => bomTileUrl(
        layerConfig.id,
        layerConfig.tileMatrixSet,
        0,
        0,
        0,
        timestamp,
      ),
      timeoutMs: 1500,
    }),
  });
  timestampAvailabilityResolvers.set(cacheKey, resolver);
  return resolver;
}

async function getLayerTimestamps(layerConfig, count = 9, isCurrent) {
  const timestamps = generateFallbackTimestamps(layerConfig, count);
  if (!timestamps.length) return timestamps;

  return getTimestampAvailabilityResolver(layerConfig).resolve({
    cacheKey: `${layerConfig.id}\u0000${layerConfig.tileMatrixSet}`,
    timestamps,
    stepMinutes: layerConfig.fallbackStepMinutes || 5,
    isCurrent,
  });
}

function getBomTileUrlForCoords(layerId, tileMatrixSet, coords, time) {
  const offset = getTileOffset(tileMatrixSet, coords.z);
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
      const offset = getTileOffset(tileMatrixSet, coords.z);
      if (offset) {
        tile.style.marginLeft = `${offset.xShiftPx}px`;
        tile.style.marginTop = `${offset.yShiftPx}px`;
      }
      const url = this.getTileUrl(coords);
      if (!url) {
        tile.src = TRANSPARENT_PIXEL;
        setTimeout(() => done(null, tile), 0);
        return tile;
      }
      loadImageWithRetry(tile, url, TRANSPARENT_PIXEL, () => done(null, tile));
      return tile;
    },
  });

  return new BomTileLayer('', options);
}

function getLegendConfig(layerKey) {
  const layer = getBomLayerConfig(layerKey);
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

function formatLayerTimestamp(layerConfig, timestampValue) {
  const time = new Date(timestampValue);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const stepMinutes = layerConfig?.fallbackStepMinutes || 5;
  const timeMode = layerConfig?.timeMode || 'past';

  if (stepMinutes >= 1440) {
    return time.toLocaleDateString('en-AU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone,
    });
  }

  if (timeMode === 'forecast') {
    return time.toLocaleString('en-AU', {
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone,
    });
  }

  return time.toLocaleTimeString('en-AU', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  });
}


const LIGHTNING_PANE = 'bomLightning';
const LIGHTNING_PANE_Z = 450;
const LIGHTNING_FRESH_SEC = 30;
const LIGHTNING_AGE_TICK_MS = 30000;
const LIGHTNING_PULSE_MS = 600;
const LIGHTNING_PULSE_MAX_STRIKES = 300;
const LIGHTNING_HALO_RATIO = 2.2;
const LIGHTNING_ATTRIBUTION = 'Lightning &copy; <a href="https://www.blitzortung.org">Blitzortung.org</a>';

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Live Blitzortung lightning overlay. Renders strikes as canvas circleMarkers in a
// dedicated pane above the radar; ages/fades them on a timer; pulses fresh ones once.
class LightningOverlay {
  constructor(L, map, options = {}) {
    this._L = L;
    this._map = map;
    this._fadeSec = Math.max(60, (options.fadeMinutes ?? 30) * 60);
    this._pulseEnabled = options.pulse !== false && !prefersReducedMotion();
    this._dotSize = options.dotSize ?? 5;
    this._cap = options.cap ?? 750;
    this._strikes = new Map(); // id -> { ts, marker, halo, pulseStart }
    this._ageTimer = null;
    this._rafId = null;
    this._renderer = null;
    this._layer = null;
  }

  start(hass) {
    const L = this._L;
    if (!this._map.getPane(LIGHTNING_PANE)) {
      const pane = this._map.createPane(LIGHTNING_PANE);
      pane.style.zIndex = String(LIGHTNING_PANE_Z);
      pane.style.pointerEvents = 'none';
    }
    this._renderer = guardLightningRenderer(L.canvas({ pane: LIGHTNING_PANE, padding: 0.5 }));
    this._layer = L.layerGroup([]).addTo(this._map);
    this._ageTimer = setInterval(() => this._refreshAges(), LIGHTNING_AGE_TICK_MS);
    this.updateHass(hass);
  }

  updateHass(hass) {
    if (!this._layer) return;
    const strikes = collectLightningStrikes(hass, this._cap);
    const now = Date.now();
    const current = new Set();
    let changed = false;
    // strikes is newest-first; add oldest-first so the newest paints on top (canvas draw order = insertion order)
    const fadeMs = this._fadeSec * 1000;
    for (let i = strikes.length - 1; i >= 0; i--) {
      const s = strikes[i];
      // Skip strikes already past the fade window. The Blitzortung integration can
      // retain geo_location entities longer than lightning_fade_minutes; without this,
      // every hass tick would re-add then immediately remove markers for those stale
      // entities (churn that scales with the number of expired-but-present strikes).
      if (now - s.ts >= fadeMs) continue;
      current.add(s.id);
      if (!this._strikes.has(s.id)) {
        this._addStrike(s, now);
        changed = true;
      }
    }
    for (const id of this._strikes.keys()) {
      if (!current.has(id)) {
        this._removeStrike(id);
        changed = true;
      }
    }
    if (changed) this._restyleAll(now);
  }

  _addStrike(s, now) {
    const L = this._L;
    const ageSec = Math.max(0, (now - s.ts) / 1000);
    const fresh = ageSec < LIGHTNING_FRESH_SEC;
    const common = { renderer: this._renderer, pane: LIGHTNING_PANE, interactive: false, stroke: false };
    const entry = { ts: s.ts, marker: null, halo: null, pulseStart: null };
    if (fresh) {
      entry.halo = L.circleMarker([s.lat, s.lon], {
        ...common, radius: this._dotSize * LIGHTNING_HALO_RATIO, fillColor: '#ffffff', fillOpacity: 0.22,
      }).addTo(this._layer);
    }
    entry.marker = L.circleMarker([s.lat, s.lon], {
      ...common, radius: this._dotSize, fillColor: '#ffffff', fillOpacity: 1,
    }).addTo(this._layer);
    if (fresh && this._pulseEnabled && this._strikes.size < LIGHTNING_PULSE_MAX_STRIKES) {
      entry.pulseStart = now;
      this._ensurePulseLoop();
    }
    this._strikes.set(s.id, entry);
  }

  _removeStrike(id) {
    const entry = this._strikes.get(id);
    if (!entry) return;
    if (entry.marker) this._layer.removeLayer(entry.marker);
    if (entry.halo) this._layer.removeLayer(entry.halo);
    this._strikes.delete(id);
  }

  _restyleAll(now) {
    for (const [id, entry] of this._strikes) {
      const ageSec = Math.max(0, (now - entry.ts) / 1000);
      if (ageSec >= this._fadeSec) { this._removeStrike(id); continue; }
      const color = colorForAge(ageSec, this._fadeSec);
      const opacity = opacityForAge(ageSec, this._fadeSec);
      if (entry.marker) entry.marker.setStyle({ fillColor: color, fillOpacity: opacity });
      if (entry.halo && ageSec >= LIGHTNING_FRESH_SEC) {
        this._layer.removeLayer(entry.halo);
        entry.halo = null;
      }
    }
  }

  _refreshAges() {
    this._restyleAll(Date.now());
  }

  _ensurePulseLoop() {
    if (this._rafId != null || typeof requestAnimationFrame !== 'function') return;
    const step = () => {
      const now = Date.now();
      let active = false;
      for (const entry of this._strikes.values()) {
        if (entry.pulseStart == null) continue;
        const t = (now - entry.pulseStart) / LIGHTNING_PULSE_MS;
        if (t >= 1) {
          entry.pulseStart = null;
          if (entry.marker) entry.marker.setRadius(this._dotSize);
          if (entry.halo) entry.halo.setRadius(this._dotSize * LIGHTNING_HALO_RATIO);
          continue;
        }
        active = true;
        const scale = pulseScale(t); // 2x -> 1x ease-out
        if (entry.marker) entry.marker.setRadius(this._dotSize * scale);
        if (entry.halo) entry.halo.setRadius(this._dotSize * LIGHTNING_HALO_RATIO * scale);
      }
      this._rafId = active ? requestAnimationFrame(step) : null;
    };
    this._rafId = requestAnimationFrame(step);
  }

  destroy() {
    if (this._ageTimer) { clearInterval(this._ageTimer); this._ageTimer = null; }
    if (this._rafId != null && typeof cancelAnimationFrame === 'function') { cancelAnimationFrame(this._rafId); }
    this._rafId = null;
    removeLightningLayers(this._map, this._renderer, this._layer);
    this._layer = null;
    this._renderer = null;
    this._strikes.clear();
  }
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
    this._committedRadarLayerKey = null;
    this._currentFrame = 0;
    this._playing = true;
    this._animationTimer = null;
    this._timestamps = [];
    this._initialized = false;
    this._updateTimer = null;
    this._resizeObserver = null;
    this._visibilityObserver = null;
    this._windowResizeHandler = null;
    this._layerSwitcher = null;
    this._bomReferenceLayers = [];
    this._radarCoverageLayer = null;
    this._labelLayer = null;
    this._lastRadarDisplayZoom = null;
    this._pendingZoomRebuild = false;
    this._previousDisplayZoom = null;
    this._initToken = 0;
    this._radarLoadToken = 0;
    this._resolvedBasemapStyle = null;
    this._lightning = null;
  }

  connectedCallback() {
    this._initIfReady();
  }

  _hasConfig() {
    return Object.keys(this._config).length > 0;
  }

  _initIfReady() {
    if (!this.isConnected || this._initialized || this._map || !this._hass || !this._hasConfig()) return;
    this._init();
  }

  _isCurrentInit(initToken) {
    return this.isConnected && this._initToken === initToken;
  }

  _getEstimatedCardHeight() {
    return this._config?.map_height || 300;
  }

  _getHomeCoordinates() {
    const lat = this._config.marker_latitude ?? this._hass?.config?.latitude ?? this._config.center_latitude ?? -33.87;
    const lon = this._config.marker_longitude ?? this._hass?.config?.longitude ?? this._config.center_longitude ?? 151.21;
    return [lat, lon];
  }

  set hass(hass) {
    this._hass = hass;
    if (this._restartForAutoBasemapChange()) {
      return;
    }
    this._initIfReady();
    if (this._lightning) {
      this._lightning.updateHass(hass);
    }
  }

  setConfig(config) {
    if (!config) throw new Error('Invalid configuration');
    const basemapProvider = getBasemapProvider(config);
    const darkBasemap = config.dark_basemap !== false;
    const basemapStyle = getConfiguredBasemapStyle(config, basemapProvider);
    const enabledLayers = getEnabledLayerKeys(config);
    const activeLayer = enabledLayers.includes(config.layer) ? config.layer : enabledLayers[0] || 'reflectivity';
    const allowOverzoom = config.allow_overzoom === true;
    const maxDisplayZoom = getConfiguredMaxDisplayZoom({ allow_overzoom: allowOverzoom });
    this._config = {
      center_latitude: parseOptionalFiniteNumber(config.center_latitude),
      center_longitude: parseOptionalFiniteNumber(config.center_longitude),
      zoom_level: clampNumber(config.zoom_level, 7, MIN_MAP_ZOOM, maxDisplayZoom),
      frame_count: clampInteger(config.frame_count, 9, 1, 9),
      frame_delay: clampPositiveInteger(config.frame_delay, 500, 100, MAX_TIMEOUT_DELAY_MS),
      restart_delay: clampPositiveInteger(config.restart_delay, 1500, 500, MAX_TIMEOUT_DELAY_MS),
      layer: activeLayer,
      enabled_layers: enabledLayers,
      show_marker: config.show_marker !== false,
      show_zoom: config.show_zoom !== false,
      show_recenter: config.show_recenter !== false,
      show_layer_switcher: config.show_layer_switcher !== false,
      show_playback: config.show_playback !== false,
      show_legend: config.show_legend !== false,
      show_bom_boundaries: config.show_bom_boundaries === true,
      bom_reference_layers: getBomReferenceLayerKeys(config),
      show_radar_coverage: config.show_radar_coverage === true,
      square_style: config.square_style === true,
      show_attribution: config.show_attribution !== false,
      show_layer_label: config.show_layer_label === true,
      map_height: clampPositiveInteger(config.map_height, 300, 1, MAX_MAP_HEIGHT),
      dark_basemap: darkBasemap,
      basemap_provider: basemapProvider,
      basemap_style: basemapStyle,
      basemap_api_key: config.basemap_api_key,
      marker_latitude: parseOptionalFiniteNumber(config.marker_latitude),
      marker_longitude: parseOptionalFiniteNumber(config.marker_longitude),
      radar_opacity: clampNumber(config.radar_opacity, 0.7, 0.1, 1),
      chrome_opacity: clampNumber(config.chrome_opacity, 1, 0.2, 1),
      accent_color: sanitizeAccentColor(config.accent_color),
      location_color: sanitizeAccentColor(config.location_color),
      allow_overzoom: allowOverzoom,
      max_display_zoom: maxDisplayZoom,
      card_mod: config.card_mod,
      show_lightning: config.show_lightning !== false,
      lightning_fade_minutes: clampNumber(config.lightning_fade_minutes, 30, 1, 120),
      lightning_pulse: config.lightning_pulse !== false,
      lightning_dot_size: clampNumber(config.lightning_dot_size, 5, 2, 12),
    };
    if (this._initialized || this._map) {
      this._restart();
      return;
    }
    this._initIfReady();
  }

  _restartForAutoBasemapChange() {
    if (
      !this._initialized ||
      !this._map ||
      this._config.basemap_style !== BASEMAP_STYLE_AUTO ||
      !this._resolvedBasemapStyle
    ) {
      return false;
    }

    if (getSunDaylightState(this._hass) === null) {
      return false;
    }

    const nextResolvedStyle = getResolvedBasemapStyle(this._config, this._hass);
    if (nextResolvedStyle === this._resolvedBasemapStyle) {
      return false;
    }

    this._restart();
    return true;
  }

  _restart() {
    this._initToken += 1;
    this._cleanupMap();
    this._playing = true;
    this._currentFrame = 0;
    this._initialized = false;
    this._initIfReady();
  }

  getCardSize() {
    return Math.ceil(this._getEstimatedCardHeight() / 50);
  }

  getGridOptions() {
    return getFixedHeightGridOptions(this._getEstimatedCardHeight());
  }

  static getConfigElement() {
    return document.createElement('bom-radar-card-editor');
  }

  static getStubConfig() {
    return {
      layer: 'reflectivity',
      zoom_level: 7,
      map_height: 300,
    };
  }

  async _init() {
    if (this._initialized || !this.isConnected || !this._hass || !this._hasConfig()) return;
    const initToken = ++this._initToken;
    this._initialized = true;

    replaceShadowContentPreservingCardMod(this.shadowRoot, `
      <style>${LEAFLET_CSS}${CARD_CSS}</style>
      <ha-card style="--bom-card-radius:${this._config.square_style ? '0px' : 'var(--ha-card-border-radius, 12px)'}; --bom-chrome-opacity:${this._config.chrome_opacity}; --bom-ui-accent-color:${this._config.accent_color || DEFAULT_UI_ACCENT_COLOR}; --bom-map-accent-color:${this._config.location_color || `var(--accent-color, ${DEFAULT_ACCENT_COLOR})`}">
        <div class="card-content${this._config.square_style ? ' is-square' : ''}">
          <div id="map" style="height: ${this._config.map_height}px"></div>
          <div class="loading-overlay" id="loading">
            <div class="spinner"></div>
            <div class="loading-text">Loading BOM weather data</div>
          </div>
          ${this._config.show_playback ? `
          <div class="controls">
            <button class="play-btn" id="play-btn" aria-label="Play/Pause">${ICON_PAUSE}</button>
            <div class="timeline" id="timeline"></div>
            <span class="time-label" id="time-label">--:--</span>
          </div>` : ''}
        </div>
      </ha-card>
    `);

    try {
      this._renderTopOverlays();
      const L = Leaflet;
      this._L = L;
      await this._initMap(L, initToken);
      if (!this._isCurrentInit(initToken)) {
        if (this._initToken === initToken) {
          this._cleanupMap();
          this._initialized = false;
        }
        return;
      }
      // Fade out loading overlay
      const loading = this.shadowRoot.getElementById('loading');
      if (loading) {
        loading.classList.add('hidden');
        setTimeout(() => loading.remove(), 300);
      }
    } catch (err) {
      if (!this._isCurrentInit(initToken)) return;
      this._cleanupMap();
      this._initialized = false;
      console.error('BOM Radar Card: Failed to initialize', err);
      const loading = this.shadowRoot.getElementById('loading');
      if (loading) {
        loading.innerHTML = `<div class="error-text">Failed to load BOM weather data</div>`;
      }
    }
  }

  async _initMap(L, initToken) {
    const container = this.shadowRoot.getElementById('map');
    if (!container) return;

    const lat = this._config.center_latitude ?? this._hass?.config?.latitude ?? -33.87;
    const lon = this._config.center_longitude ?? this._hass?.config?.longitude ?? 151.21;
    const basemapConfig = getBasemapConfig(this._config, this._hass);
    this._resolvedBasemapStyle = basemapConfig.style;

    container.style.background = basemapConfig.background;

    this._map = createResizeGuardedMap(L, container, {
      center: [lat, lon],
      zoom: this._config.zoom_level,
      zoomControl: false,
      attributionControl: this._config.show_attribution,
      maxBounds: [[-55, 95], [5, 175]],
      minZoom: MIN_MAP_ZOOM,
      maxZoom: this._config.max_display_zoom,
    });
    if (this._config.show_attribution && this._map.attributionControl) {
      this._map.attributionControl.setPrefix(false);
    }
    this._lastRadarDisplayZoom = this._map.getZoom();
    this._scheduleMapResize();

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

    // Base tiles (below radar)
    const baseLayerOptions = {
      attribution: basemapConfig.attribution,
      subdomains: 'abcd',
      maxZoom: this._config.max_display_zoom,
    };
    if (basemapConfig.maxNativeZoom) {
      baseLayerOptions.maxNativeZoom = basemapConfig.maxNativeZoom;
    }
    L.tileLayer(basemapConfig.baseUrl, baseLayerOptions).addTo(this._map);

    // Load radar data (middle layer)
    const radarLoadToken = ++this._radarLoadToken;
    const loadedRadar = await this._loadRadarData(L, initToken, radarLoadToken);
    if (!loadedRadar || !this._isCurrentInit(initToken) || !this._map) return;

    this._addBomReferenceLayers(L);

    // Labels on top of radar
    if (basemapConfig.labelsUrl) {
      this._labelLayer = L.tileLayer(basemapConfig.labelsUrl, {
        subdomains: 'abcd',
        maxZoom: this._config.max_display_zoom,
        pane: 'overlayPane',
      }).addTo(this._map);
    }

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

    // Lightning overlay (optional; requires the Blitzortung integration)
    if (this._config.show_lightning && isBlitzortungLoaded(this._hass)) {
      this._lightning = new LightningOverlay(L, this._map, {
        fadeMinutes: this._config.lightning_fade_minutes,
        pulse: this._config.lightning_pulse,
        dotSize: this._config.lightning_dot_size,
      });
      this._lightning.start(this._hass);
      if (this._config.show_attribution && this._map.attributionControl) {
        this._map.attributionControl.addAttribution(LIGHTNING_ATTRIBUTION);
      }
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
    this._resizeObserver = new ResizeObserver(() => {
      this._scheduleMapResize();
      this._fitLayerSwitcherPanel();
    });
    // Leaflet measures clientWidth/clientHeight (the padding box), so observe
    // the border box rather than missing padding-only responsive changes.
    this._resizeObserver.observe(container, { box: 'border-box' });
    if (typeof IntersectionObserver === 'function') {
      this._visibilityObserver = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        this._scheduleMapResize();
        this._fitLayerSwitcherPanel();
      });
      this._visibilityObserver.observe(container);
    }
    this._windowResizeHandler = () => {
      this._scheduleMapResize();
      this._fitLayerSwitcherPanel();
    };
    window.addEventListener('resize', this._windowResizeHandler);
    this._scheduleMapResize();
  }

  _scheduleMapResize() {
    const map = this._map;
    const container = this.shadowRoot.getElementById('map');
    if (!map || !container) return;

    const resize = () => {
      if (this._map !== map || this.shadowRoot.getElementById('map') !== container) return;
      invalidateMapSizeIfVisible(map, container);
    };
    resize();
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(resize);
    } else {
      setTimeout(resize, 0);
    }
  }

  _addBomReferenceLayers(L) {
    if (!this._config.bom_reference_layers.length || !this._map) return;

    this._bomReferenceLayers = this._config.bom_reference_layers
      .map((layerKey) => {
        if (!hasOwnKey(BOM_REFERENCE_OVERLAY_STYLES, layerKey)) return null;
        return L.tileLayer(`${BOM_REFERENCE_OVERLAY_BASE_URL}/${layerKey}/MapServer/tile/{z}/{y}/{x}?blankTile=false`, {
          attribution: BOM_ATTRIBUTION,
          maxZoom: this._config.max_display_zoom,
          maxNativeZoom: MAX_BOM_MAPSERVER_NATIVE_ZOOM,
          pane: 'overlayPane',
        }).addTo(this._map);
      })
      .filter(Boolean);
  }

  _syncRadarCoverageLayer(L = this._L) {
    if (!this._map || !L) return;

    if (this._radarCoverageLayer && !shouldShowRadarCoverage(this._config)) {
      if (this._map.hasLayer(this._radarCoverageLayer)) {
        this._map.removeLayer(this._radarCoverageLayer);
      }
      this._radarCoverageLayer = null;
    }

    if (!this._radarCoverageLayer && shouldShowRadarCoverage(this._config)) {
      const coveragePane = this._map.getPane(RADAR_COVERAGE_PANE) || this._map.createPane(RADAR_COVERAGE_PANE);
      coveragePane.style.zIndex = String(RADAR_COVERAGE_PANE_Z_INDEX);
      coveragePane.style.pointerEvents = 'none';
      let coverageLayer = null;
      try {
        coverageLayer = L.tileLayer(RADAR_COVERAGE_TILE_URL, {
          ...RADAR_COVERAGE_TILE_OPTIONS,
          attribution: BOM_ATTRIBUTION,
          maxZoom: this._config.max_display_zoom,
          pane: RADAR_COVERAGE_PANE,
        });
        coverageLayer.addTo(this._map);
        this._radarCoverageLayer = coverageLayer;
      } catch (error) {
        if (coverageLayer && this._map?.hasLayer(coverageLayer)) {
          this._map.removeLayer(coverageLayer);
        }
        console.warn('BOM Radar Card: Failed to add radar coverage layer', error);
      }
    }
  }

  _syncReferenceLayerOrder() {
    this._bomReferenceLayers.forEach((layer) => {
      if (this._map?.hasLayer(layer)) {
        layer.bringToFront();
      }
    });
    if (this._labelLayer && this._map?.hasLayer(this._labelLayer)) {
      this._labelLayer.bringToFront();
    }
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
      button.title = 'Choose weather layer';
      button.setAttribute('aria-label', 'Choose weather layer');
      button.setAttribute('aria-haspopup', 'true');
      button.setAttribute('aria-expanded', 'false');

      getGroupedLayerEntries(this._config.enabled_layers || DEFAULT_ENABLED_LAYERS).forEach(({ groupName, entries }) => {
        const group = L.DomUtil.create('div', 'bom-layer-group', panel);
        group.textContent = groupName;

        entries.forEach(([key, layer]) => {
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
      });

      const togglePanel = (ev) => {
        L.DomEvent.stop(ev);
        const isOpen = !panel.classList.contains('is-open');
        panel.classList.toggle('is-open', isOpen);
        button.classList.toggle('is-open', isOpen);
        button.setAttribute('aria-expanded', String(isOpen));
        if (isOpen) {
          this._fitLayerSwitcherPanel();
        }
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

  _getDisplayedRadarLayerKey() {
    return hasOwnKey(BOM_LAYERS, this._committedRadarLayerKey)
      ? this._committedRadarLayerKey
      : this._config.layer;
  }

  _renderTopOverlays() {
    const content = this.shadowRoot.querySelector('.card-content');
    const map = this.shadowRoot.getElementById('map');
    if (!content || !map) return;

    content.querySelector('.layer-badge')?.remove();
    content.querySelector('.legend-card')?.remove();

    const displayedLayerKey = this._getDisplayedRadarLayerKey();
    const layerConfig = getBomLayerConfig(displayedLayerKey) || BOM_LAYERS.reflectivity;
    const legendConfig = this._config.show_legend ? getLegendConfig(displayedLayerKey) : null;

    content.classList.toggle('has-top-legend', Boolean(legendConfig));

    if (this._config.show_layer_label) {
      map.insertAdjacentHTML('beforebegin', `<div class="layer-badge">${layerConfig.name}</div>`);
    }
    if (legendConfig) {
      map.insertAdjacentHTML('beforebegin', renderLegendHtml(displayedLayerKey));
    }
  }

  _closeLayerSwitcher() {
    if (!this._layerSwitcher) return;
    this._layerSwitcher.panel.classList.remove('is-open');
    this._layerSwitcher.button.classList.remove('is-open');
    this._layerSwitcher.button.setAttribute('aria-expanded', 'false');
    this._layerSwitcher.panel.style.removeProperty('max-height');
    this._layerSwitcher.panel.style.removeProperty('max-width');
  }

  _fitLayerSwitcherPanel() {
    if (!this._layerSwitcher?.panel?.classList.contains('is-open')) return;

    const content = this.shadowRoot.querySelector('.card-content');
    const { panel } = this._layerSwitcher;
    if (!content || !panel) return;

    const contentRect = content.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const availableHeight = Math.max(160, Math.floor(contentRect.bottom - panelRect.top - 8));
    const availableWidth = Math.max(156, Math.min(210, Math.floor(contentRect.width - 52)));

    panel.style.maxHeight = `${availableHeight}px`;
    panel.style.maxWidth = `${availableWidth}px`;
  }

  _syncLayerSwitcherState() {
    if (!this._layerSwitcher) return;
    const displayedLayerKey = this._getDisplayedRadarLayerKey();
    const layerConfig = getBomLayerConfig(displayedLayerKey) || BOM_LAYERS.reflectivity;
    this._layerSwitcher.button.title = `Weather layer: ${layerConfig.name}`;
    this._layerSwitcher.button.setAttribute('aria-label', `Weather layer: ${layerConfig.name}`);
    this._layerSwitcher.panel.querySelectorAll('.bom-layer-option').forEach((option) => {
      const isActive = option.dataset.layer === displayedLayerKey;
      option.classList.toggle('is-active', isActive);
      option.setAttribute('aria-pressed', String(isActive));
    });
  }

  async _setLayer(layerKey) {
    if (!hasOwnKey(BOM_LAYERS, layerKey) || layerKey === this._config.layer) {
      this._closeLayerSwitcher();
      return;
    }

    const previousLayer = this._config.layer;
    this._config.layer = layerKey;
    this._closeLayerSwitcher();

    if (!this._L || !this._map) {
      this._renderTopOverlays();
      this._syncLayerSwitcherState();
      return;
    }

    try {
      await this._refreshData({ throwOnError: true });
    } catch (err) {
      if (this._config.layer === layerKey) {
        this._config.layer = hasOwnKey(BOM_LAYERS, this._committedRadarLayerKey)
          ? this._committedRadarLayerKey
          : previousLayer;
        this._renderTopOverlays();
        this._syncLayerSwitcherState();
        this._syncRadarCoverageLayer();
        this._buildTimeline();
        this._updateTimeLabel();
      }
      console.warn(`BOM Radar Card: Failed to switch to layer "${layerKey}"`, err);
    }
  }

  async _loadRadarData(
    L,
    initToken = this._initToken,
    radarLoadToken = ++this._radarLoadToken,
  ) {
    const layerKey = this._config.layer;
    const layerConfig = getBomLayerConfig(this._config.layer) || BOM_LAYERS.reflectivity;
    const isCurrent = () => (
      this._isCurrentInit(initToken) &&
      this._radarLoadToken === radarLoadToken &&
      this._map &&
      this._config.layer === layerKey
    );
    const timestamps = await getLayerTimestamps(layerConfig, this._config.frame_count, isCurrent);

    if (!isCurrent() || !timestamps.length) {
      return false;
    }

    const initialFrame = layerConfig.initialFrame === 'first' ? 0 : timestamps.length - 1;
    this._replaceRadarLayers(L, layerConfig, timestamps, initialFrame, layerKey);
    this._syncRadarCoverageLayer(L);
    this._renderTopOverlays();
    this._syncLayerSwitcherState();
    this._updateTimeline();
    this._updateTimeLabel();
    return true;
  }

  _replaceRadarLayers(
    L,
    layerConfig,
    timestamps = this._timestamps,
    currentFrame = this._currentFrame,
    layerKey = this._config.layer,
  ) {
    const activeFrame = Math.min(currentFrame, timestamps.length - 1);
    const previousLayers = this._radarLayers;
    const nextLayers = [];

    try {
      for (let i = 0; i < timestamps.length; i++) {
        const time = timestamps[i];
        const layer = createBomTileLayer(L, layerConfig.id, layerConfig.tileMatrixSet, time, {
          opacity: i === activeFrame ? this._config.radar_opacity : 0,
          maxZoom: this._config.max_display_zoom,
          maxNativeZoom: MAX_BOM_NATIVE_ZOOM,
          minZoom: MIN_MAP_ZOOM,
        });
        nextLayers.push(layer);
        layer.addTo(this._map);
      }
      this._syncReferenceLayerOrder();
    } catch (error) {
      nextLayers.forEach((layer) => {
        if (this._map?.hasLayer(layer)) this._map.removeLayer(layer);
      });
      throw error;
    }

    previousLayers.forEach((layer) => {
      if (this._map.hasLayer(layer)) this._map.removeLayer(layer);
    });
    this._radarLayers = nextLayers;
    this._timestamps = timestamps;
    this._currentFrame = activeFrame;
    this._committedRadarLayerKey = layerKey;
  }

  _shouldRebuildRadarOnZoom(previousZoom, nextZoom) {
    const previous = Math.round(previousZoom ?? nextZoom ?? this._config.zoom_level);
    const next = Math.round(nextZoom ?? previous);

    return previous !== next && (previous > MAX_BOM_NATIVE_ZOOM || next > MAX_BOM_NATIVE_ZOOM);
  }

  async _rebuildRadarLayers() {
    if (!this._L || !this._map || !this._timestamps.length) return;
    const layerKey = this._getDisplayedRadarLayerKey();
    const layerConfig = getBomLayerConfig(layerKey) || BOM_LAYERS.reflectivity;
    this._replaceRadarLayers(this._L, layerConfig, this._timestamps, this._currentFrame, layerKey);
  }

  async _refreshData({ throwOnError = false } = {}) {
    if (!this._L || !this._map) return;
    const refreshToken = this._initToken;
    const radarLoadToken = ++this._radarLoadToken;
    const wasPlaying = this._playing;
    const refreshLayer = this._config.layer;

    try {
      if (wasPlaying) this._stopAnimation();
      const loadedRadar = await this._loadRadarData(this._L, refreshToken, radarLoadToken);
      if (!loadedRadar || !this._isCurrentInit(refreshToken) || !this._map) return;
      this._buildTimeline();
    } catch (err) {
      if (throwOnError) throw err;
      console.warn('BOM Radar Card: Refresh failed', err);
    } finally {
      if (
        wasPlaying &&
        this._playing &&
        this._isCurrentInit(refreshToken) &&
        this._radarLoadToken === radarLoadToken &&
        this._map &&
        this._timestamps.length &&
        this._config.layer === refreshLayer
      ) {
        this._startAnimation();
      }
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
    const layerConfig = getBomLayerConfig(this._getDisplayedRadarLayerKey()) || BOM_LAYERS.reflectivity;
    for (let i = 0; i < this._timestamps.length; i++) {
      const dot = document.createElement('button');
      dot.className = 'frame-dot' + (i === this._currentFrame ? ' active' : i < this._currentFrame ? ' past' : '');
      dot.type = 'button';
      dot.setAttribute('aria-label', `Show ${formatLayerTimestamp(layerConfig, this._timestamps[i])}`);
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
    if (!Number.isInteger(index) || index < 0 || index >= this._radarLayers.length || !this._timestamps[index]) {
      return;
    }

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

    const layerConfig = getBomLayerConfig(this._getDisplayedRadarLayerKey()) || BOM_LAYERS.reflectivity;
    label.textContent = formatLayerTimestamp(layerConfig, this._timestamps[this._currentFrame]);
  }

  _startAnimation() {
    if (!this._timestamps.length || !this._radarLayers.length) return;

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

  _cleanupMap() {
    this._radarLoadToken += 1;
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
    if (this._visibilityObserver) {
      this._visibilityObserver.disconnect();
      this._visibilityObserver = null;
    }
    if (this._windowResizeHandler) {
      window.removeEventListener('resize', this._windowResizeHandler);
      this._windowResizeHandler = null;
    }
    if (this._lightning) {
      this._lightning.destroy();
      this._lightning = null;
    }
    if (this._map) {
      this._map.remove();
      this._map = null;
    }
    this._layerSwitcher = null;
    this._bomReferenceLayers = [];
    this._radarCoverageLayer = null;
    this._labelLayer = null;
    this._radarLayers = [];
    this._committedRadarLayerKey = null;
    this._timestamps = [];
    this._currentFrame = 0;
  }

  disconnectedCallback() {
    this._initToken += 1;
    this._cleanupMap();
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
    const wasLoaded = this._blitzLoaded;
    this._hass = hass;
    this._blitzLoaded = isBlitzortungLoaded(hass);
    if (this._config && this._blitzLoaded !== wasLoaded) {
      this._render();
    }
  }

  setConfig(config) {
    this._config = { ...config };
    this._render();
  }

  _render() {
    const cfg = this._config;
    const basemapProvider = getBasemapProvider(cfg);
    const basemapStyle = getConfiguredBasemapStyle(cfg, basemapProvider);
    const enabledLayerKeys = getEnabledLayerKeys(cfg);
    const groupedLayers = getGroupedLayerEntries(enabledLayerKeys);
    const bomReferenceLayerKeys = getBomReferenceLayerKeys(cfg);
    const activeEditorLayer = enabledLayerKeys.includes(cfg.layer) ? cfg.layer : enabledLayerKeys[0] || 'reflectivity';
    const radarCoverageAvailable = supportsRadarCoverageLayer(activeEditorLayer);
    const blitzLoaded = isBlitzortungLoaded(this._hass);
    const additionalBomReferenceLayers = Object.entries(BOM_REFERENCE_OVERLAY_STYLES)
      .filter(([key]) => key !== 'state_borders');
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
        input[type="password"] { width:100%; padding:8px 10px; border:1px solid var(--divider-color); border-radius:10px; background:var(--card-background-color); color:var(--primary-text-color); font-size:14px; box-sizing:border-box; }
        input[type="color"] { width:100%; height:40px; padding:4px; border:1px solid var(--divider-color); border-radius:10px; background:var(--card-background-color); box-sizing:border-box; }
        select:focus-visible,input:focus-visible { outline:2px solid var(--accent-color, #00BCD4); outline-offset:1px; border-color:var(--accent-color, #00BCD4); }
        .toggle-row { display:flex; align-items:center; justify-content:space-between; padding:4px 0; }
        .toggle-label { font-size:13px; color:var(--primary-text-color); }
        .toggle { position:relative; width:36px; height:20px; flex-shrink:0; }
        .toggle input { opacity:0; width:0; height:0; }
        .toggle-slider { position:absolute; cursor:pointer; inset:0; background:rgba(255,255,255,0.12); border-radius:10px; transition:background 0.2s; }
        .toggle-slider::before { position:absolute; content:''; height:16px; width:16px; left:2px; bottom:2px; background:#fff; border-radius:50%; transition:transform 0.2s; }
        .toggle input:focus-visible+.toggle-slider { box-shadow:0 0 0 2px var(--accent-color, #00BCD4); }
        .toggle input:checked+.toggle-slider { background:var(--accent-color, #00BCD4); }
        .toggle input:checked+.toggle-slider::before { transform:translateX(16px); }
        .help-text { margin-top:6px; font-size:11px; line-height:1.4; color:var(--secondary-text-color); }
        .layer-list { max-height:320px; overflow:auto; padding:2px 2px 0; }
        .layer-group-title { margin:12px 0 4px; font-size:10px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:var(--secondary-text-color); }
        .layer-group-title:first-child { margin-top:0; }
      </style>
      <div class="editor">
        <div class="section">
          <div class="section-title">Weather Layer</div>
          <div class="row">
            <label>Layer</label>
            <select id="layer">
              ${groupedLayers.map(({ groupName, entries }) => {
                const options = entries.map(([key, val]) =>
                  `<option value="${key}" ${cfg.layer === key ? 'selected' : ''}>${val.name} (${val.unit})</option>`
                ).join('');
                return `<optgroup label="${groupName}">${options}</optgroup>`;
              }).join('')}
            </select>
          </div>
          <div class="row-inline">
            <div class="row">
              <label>Overlay Opacity</label>
              <input type="number" id="radar_opacity" min="0.1" max="1" step="0.1" value="${escapeHtml(cfg.radar_opacity || 0.7)}">
            </div>
            <div class="row">
              <label>Chrome Opacity</label>
              <input type="number" id="chrome_opacity" min="0.2" max="1" step="0.1" value="${escapeHtml(cfg.chrome_opacity ?? 1)}">
            </div>
            <div class="row">
              <label>Frames</label>
              <input type="number" id="frame_count" min="1" max="9" value="${escapeHtml(cfg.frame_count || 9)}">
            </div>
          </div>
          ${this._toggle('use_custom_accent_color', 'Custom accent color', Boolean(cfg.accent_color))}
          ${cfg.accent_color ? `
            <div class="row">
              <label>UI Accent Color</label>
              <input type="color" id="accent_color" value="${escapeHtml(cfg.accent_color || DEFAULT_UI_ACCENT_COLOR)}">
              <div class="help-text">Optional. Leave this off to use the card&apos;s neutral default UI accent.</div>
            </div>
          ` : ''}
          ${this._toggle('use_custom_location_color', 'Custom GPS marker color', Boolean(cfg.location_color))}
          ${cfg.location_color ? `
            <div class="row">
              <label>GPS Location Color</label>
              <input type="color" id="location_color" value="${escapeHtml(cfg.location_color || DEFAULT_ACCENT_COLOR)}">
              <div class="help-text">Optional. Leave this off to keep the marker tied to your Home Assistant accent color.</div>
            </div>
          ` : ''}
        </div>

        <div class="section">
          <div class="section-title">Visible Layers</div>
          <div class="layer-list">
            ${BOM_LAYER_GROUPS.map((groupName) => {
              const entries = Object.entries(BOM_LAYERS).filter(([, layer]) => layer.category === groupName);
              if (!entries.length) return '';
              return `
                <div class="layer-group-title">${groupName}</div>
                ${entries.map(([key, layer]) =>
                  this._toggle(`enabled_layer__${key}`, `${layer.name} (${layer.unit})`, enabledLayerKeys.includes(key))
                ).join('')}
              `;
            }).join('')}
          </div>
        </div>

      <div class="section">
        <div class="section-title">Map</div>
          <div class="row-inline">
            <div class="row">
              <label>Basemap Provider</label>
              <select id="basemap_provider">
                ${Object.entries(BASEMAP_PROVIDER_NAMES).map(([key, label]) =>
                  `<option value="${key}" ${basemapProvider === key ? 'selected' : ''}>${label}</option>`
                ).join('')}
              </select>
            </div>
            <div class="row">
              <label>Basemap Style</label>
              <select id="basemap_style">
                ${getBasemapStyleOptions(basemapProvider).map((style) =>
                  `<option value="${style.value}" ${basemapStyle === style.value ? 'selected' : ''}>${style.label}</option>`
                ).join('')}
              </select>
            </div>
          </div>
          <div class="row">
            <label>Basemap API Key (Optional)</label>
            <input type="password" id="basemap_api_key" value="${escapeHtml(cfg.basemap_api_key || '')}" autocomplete="off">
            <div class="help-text">Not needed for BOM. CARTO now recommends a free API key to avoid a watermark; Stadia Maps requires domain authentication or a browser API key; Esri may require a browser API key for the selected service. See the <a href="https://github.com/AshtonAU/bom-radar-card#getting-basemap-provider-keys" target="_blank" rel="noreferrer">README provider-key guide</a>.</div>
          </div>
          ${this._toggle('show_bom_boundaries', 'BOM state borders overlay', bomReferenceLayerKeys.includes('state_borders'))}
          <div class="row">
            <label>BOM reference overlays</label>
            <div class="layer-list">
              ${additionalBomReferenceLayers.map(([key, layer]) =>
                this._toggle(`bom_reference_layer__${key}`, layer.name, bomReferenceLayerKeys.includes(key))
              ).join('')}
            </div>
            <div class="help-text">Optional BOM map reference tiles shown above the weather overlay.</div>
          </div>
          <div class="row-inline">
            <div class="row">
              <label>Zoom (3-${cfg.allow_overzoom === true ? MAX_OVERZOOM_DISPLAY_ZOOM : MAX_DISPLAY_ZOOM})</label>
              <input type="number" id="zoom_level" min="3" max="${cfg.allow_overzoom === true ? MAX_OVERZOOM_DISPLAY_ZOOM : MAX_DISPLAY_ZOOM}" value="${escapeHtml(cfg.zoom_level || 7)}">
            </div>
            <div class="row">
              <label>Height (px)</label>
              <input type="number" id="map_height" min="150" max="800" value="${escapeHtml(cfg.map_height || 300)}">
            </div>
          </div>
          ${this._toggle('allow_overzoom', 'Allow overzoom (Experimental)', cfg.allow_overzoom === true)}
          <div class="help-text">Off by default. When enabled, the card can zoom to 10 by scaling BOM&apos;s native z8 radar tiles for a closer local view. This does not add extra native radar detail.</div>
          <div class="row-inline">
            <div class="row">
              <label>Center Lat</label>
              <input type="number" id="center_latitude" step="0.01" value="${escapeHtml(cfg.center_latitude ?? '')}">
            </div>
            <div class="row">
              <label>Center Lon</label>
              <input type="number" id="center_longitude" step="0.01" value="${escapeHtml(cfg.center_longitude ?? '')}">
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Animation</div>
          <div class="row-inline">
            <div class="row">
              <label>Frame Delay (ms)</label>
              <input type="number" id="frame_delay" min="100" max="2000" step="50" value="${escapeHtml(cfg.frame_delay || 500)}">
            </div>
            <div class="row">
              <label>Loop Pause (ms)</label>
              <input type="number" id="restart_delay" min="500" max="5000" step="100" value="${escapeHtml(cfg.restart_delay || 1500)}">
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Display</div>
          ${this._toggle('show_marker', 'Home marker', cfg.show_marker !== false)}
          ${this._toggle('show_zoom', 'Zoom controls', cfg.show_zoom !== false)}
          ${this._toggle('show_recenter', 'Recenter button', cfg.show_recenter !== false)}
          ${this._toggle('show_layer_switcher', 'Layer switcher', cfg.show_layer_switcher !== false)}
          ${this._toggle('show_playback', 'Playback controls', cfg.show_playback !== false)}
          ${this._toggle('show_legend', 'Radar legend', cfg.show_legend !== false)}
          ${radarCoverageAvailable
            ? this._toggle('show_radar_coverage', 'Shade areas outside radar coverage', cfg.show_radar_coverage === true)
            : ''}
          ${this._toggle('square_style', 'Square style', cfg.square_style === true)}
          ${this._toggle('show_layer_label', 'Layer label', cfg.show_layer_label === true)}
          ${this._toggle('show_attribution', 'Attribution', cfg.show_attribution !== false)}
        </div>

        <div class="section">
          <div class="section-title">Lightning</div>
          ${this._toggle('show_lightning', 'Lightning strikes (Blitzortung)', cfg.show_lightning !== false)}
          ${blitzLoaded ? (cfg.show_lightning !== false ? `
            <div class="row">
              <label>Fade window (minutes)</label>
              <input type="number" id="lightning_fade_minutes" min="1" max="120" value="${escapeHtml(cfg.lightning_fade_minutes ?? 30)}">
            </div>
            ${this._toggle('lightning_pulse', 'Pulse on new strike', cfg.lightning_pulse !== false)}
          ` : '') : `
            <div class="help-text">Requires the <a href="https://github.com/mrk-its/homeassistant-blitzortung" target="_blank" rel="noreferrer">Blitzortung integration</a>. Not detected on this Home Assistant instance.</div>
          `}
        </div>

        <div class="section">
          <div class="section-title">Marker Position</div>
          <div class="row-inline">
            <div class="row">
              <label>Marker Lat</label>
              <input type="number" id="marker_latitude" step="0.01" value="${escapeHtml(cfg.marker_latitude ?? '')}">
            </div>
            <div class="row">
              <label>Marker Lon</label>
              <input type="number" id="marker_longitude" step="0.01" value="${escapeHtml(cfg.marker_longitude ?? '')}">
            </div>
          </div>
        </div>
      </div>
    `;

    // Bind events
    const fields = [
      'layer', 'basemap_provider', 'basemap_style', 'basemap_api_key',
      'zoom_level', 'map_height', 'center_latitude', 'center_longitude',
      'frame_delay', 'restart_delay', 'radar_opacity', 'chrome_opacity', 'frame_count',
      'marker_latitude', 'marker_longitude', 'accent_color', 'location_color',
      'lightning_fade_minutes',
    ];
    fields.forEach(id => {
      const el = this.shadowRoot.getElementById(id);
      if (el) el.addEventListener('change', () => this._valueChanged());
    });

    const toggles = [
      'show_marker', 'show_zoom', 'show_recenter', 'show_layer_switcher', 'show_playback',
      'show_legend', 'show_bom_boundaries', 'square_style', 'show_layer_label', 'show_attribution', 'allow_overzoom', 'use_custom_accent_color', 'use_custom_location_color',
      'show_lightning', 'lightning_pulse', 'show_radar_coverage',
    ];
    toggles.forEach(id => {
      const el = this.shadowRoot.getElementById(id);
      if (el) el.addEventListener('change', () => this._valueChanged());
    });

    Object.keys(BOM_LAYERS).forEach((key) => {
      const el = this.shadowRoot.getElementById(`enabled_layer__${key}`);
      if (el) el.addEventListener('change', () => this._valueChanged());
    });

    Object.keys(BOM_REFERENCE_OVERLAY_STYLES).forEach((key) => {
      const el = this.shadowRoot.getElementById(`bom_reference_layer__${key}`);
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

    const selectedLayerKeys = Object.keys(BOM_LAYERS).filter((key) => {
      const el = get(`enabled_layer__${key}`);
      return el?.checked;
    });

    const nextEnabledLayers = selectedLayerKeys.length ? selectedLayerKeys : [config.layer].filter((key) => hasOwnKey(BOM_LAYERS, key));
    if (nextEnabledLayers.length && nextEnabledLayers.length < DEFAULT_ENABLED_LAYERS.length) {
      config.enabled_layers = nextEnabledLayers;
    } else {
      delete config.enabled_layers;
    }

    if (nextEnabledLayers.length && !nextEnabledLayers.includes(config.layer)) {
      config.layer = nextEnabledLayers[0];
    }

    const selectedReferenceLayerKeys = Object.keys(BOM_REFERENCE_OVERLAY_STYLES)
      .filter((key) => key !== 'state_borders')
      .filter((key) => get(`bom_reference_layer__${key}`)?.checked);
    if (selectedReferenceLayerKeys.length) {
      config.bom_reference_layers = selectedReferenceLayerKeys;
    } else {
      delete config.bom_reference_layers;
    }

    const basemapProvider = get('basemap_provider');
    if (basemapProvider) config.basemap_provider = basemapProvider.value;

    const basemapStyle = get('basemap_style');
    if (basemapStyle) {
      const nextProvider = getBasemapProvider(config);
      if (basemapStyle.value === BASEMAP_STYLE_AUTO && providerSupportsAutoBasemap(nextProvider)) {
        config.basemap_style = BASEMAP_STYLE_AUTO;
      } else {
        config.basemap_style = hasOwnKey(BASEMAP_PROVIDER_STYLES[nextProvider] || {}, basemapStyle.value)
          ? basemapStyle.value
          : getDefaultBasemapStyle(nextProvider, config.dark_basemap !== false);
        config.dark_basemap = isDarkBasemapStyle(nextProvider, config.basemap_style);
      }
    }

    const basemapApiKey = get('basemap_api_key');
    if (basemapApiKey) {
      if (basemapApiKey.value === '') {
        delete config.basemap_api_key;
      } else {
        config.basemap_api_key = basemapApiKey.value;
      }
    }

    const useCustomAccent = get('use_custom_accent_color');
    if (useCustomAccent?.checked) {
      const accentColor = sanitizeAccentColor(get('accent_color')?.value);
      config.accent_color = accentColor || DEFAULT_UI_ACCENT_COLOR;
    } else {
      delete config.accent_color;
    }

    const useCustomLocationColor = get('use_custom_location_color');
    if (useCustomLocationColor?.checked) {
      const locationColor = sanitizeAccentColor(get('location_color')?.value);
      config.location_color = locationColor || DEFAULT_ACCENT_COLOR;
    } else {
      delete config.location_color;
    }


    const numFields = {
      zoom_level: 'int', map_height: 'int', frame_delay: 'int',
      restart_delay: 'int', frame_count: 'int',
      center_latitude: 'float', center_longitude: 'float',
      marker_latitude: 'float', marker_longitude: 'float',
      radar_opacity: 'float', chrome_opacity: 'float',
      lightning_fade_minutes: 'int',
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
      'show_marker', 'show_zoom', 'show_recenter', 'show_layer_switcher', 'show_playback',
      'show_legend', 'show_bom_boundaries', 'square_style', 'show_layer_label', 'show_attribution', 'allow_overzoom',
      'show_lightning', 'lightning_pulse', 'show_radar_coverage',
    ];
    toggleFields.forEach(id => {
      const el = get(id);
      if (el) config[id] = el.checked;
    });

    const maxDisplayZoom = getConfiguredMaxDisplayZoom(config);
    if (typeof config.zoom_level === 'number') {
      config.zoom_level = Math.min(maxDisplayZoom, Math.max(MIN_MAP_ZOOM, config.zoom_level));
    }

    this._config = config;
    this.dispatchEvent(new CustomEvent('config-changed', {
      bubbles: true,
      composed: true,
      detail: { config },
    }));
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
    description: 'Australian Bureau of Meteorology weather layers using native BOM WMTS tiles',
    preview: true,
    documentationURL: 'https://github.com/AshtonAU/bom-radar-card',
  });
}
