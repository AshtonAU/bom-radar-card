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
import { getLegendConfig, renderLegendHtml, renderLegendBandsHtml } from './legend.js';
import { loadUiFont } from './ui-font.js';
import { getLayerPickerBounds } from './layer-picker-layout.js';
import { UI_THEME_CSS, syncUiTheme, observeUiTheme } from './ui-theme.js';
import { createAutoHideControls } from './auto-hide-controls.js';

const CARD_VERSION = '1.12.0';
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

const CARTO_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a> | &copy; <a href="http://www.bom.gov.au">BOM</a>';
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
  const cartoApiKey = typeof config?.carto_api_key === 'string' ? config.carto_api_key.trim() : '';
  const stadiaKeySuffix = apiKey ? `?api_key=${encodeURIComponent(apiKey)}` : '';
  const esriTokenSuffix = apiKey ? `?token=${encodeURIComponent(apiKey)}` : '';
  const cartoKeySuffix = cartoApiKey ? `?key=${encodeURIComponent(cartoApiKey)}` : '';

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
const ICON_COLOUR_KEY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="3" y="3" width="5" height="5" rx="1"/><rect x="3" y="10" width="5" height="5" rx="1"/><rect x="3" y="17" width="5" height="4" rx="1"/><path d="M12 5.5h9M12 12.5h9M12 19h9"/></svg>';

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
.leaflet-control-zoom-in,.leaflet-control-zoom-out{font-family:inherit;font-size:20px;font-weight:500;text-indent:0}
.leaflet-touch .leaflet-control-zoom-in,.leaflet-touch .leaflet-control-zoom-out{font-size:22px}
.leaflet-map-pane,.leaflet-tile,.leaflet-marker-icon,.leaflet-marker-shadow,.leaflet-tile-container,.leaflet-pane>svg,.leaflet-pane>canvas,.leaflet-zoom-box,.leaflet-image-layer,.leaflet-layer{position:absolute;left:0;top:0;pointer-events:none}
.leaflet-pane{z-index:400}
.leaflet-tile-pane{z-index:200;pointer-events:auto}
.leaflet-overlay-pane{z-index:400}
.leaflet-shadow-pane{z-index:500}
.leaflet-marker-pane{z-index:600}
.leaflet-tooltip-pane{z-index:650}
.leaflet-popup-pane{z-index:700}
.leaflet-map-pane canvas{z-index:100}
.leaflet-map-pane svg{z-index:200}
.leaflet-control{position:relative;z-index:800;pointer-events:visiblePainted;pointer-events:auto}
.leaflet-top,.leaflet-bottom{position:absolute;z-index:1000;pointer-events:none}
.leaflet-top{top:0}.leaflet-right{right:0}.leaflet-bottom{bottom:0}.leaflet-left{left:0}
.leaflet-control{float:left;clear:both}
.leaflet-right .leaflet-control{float:right}
.leaflet-top .leaflet-control{margin-top:8px}
.leaflet-bottom .leaflet-control{margin-bottom:8px}
.leaflet-left .leaflet-control{margin-left:8px}
.leaflet-right .leaflet-control{margin-right:8px}
.leaflet-top.leaflet-right{top:8px;right:8px;display:flex;flex-direction:column;padding:2px;background:var(--bom-chrome-background);border:1px solid var(--bom-border);border-radius:var(--bom-control-radius);box-shadow:var(--bom-shadow)}
.leaflet-top.leaflet-right[hidden]{display:none}
.leaflet-top.leaflet-right > .leaflet-control{margin:0;float:none;clear:none}
.leaflet-control-zoom{border:none}
.leaflet-control-zoom a{background:transparent;color:var(--bom-text);width:var(--bom-control-size);height:var(--bom-control-size);line-height:var(--bom-control-size);text-align:center;text-decoration:none;display:block;border-radius:var(--bom-control-radius);transition:background 0.15s,color 0.15s,opacity 0.15s}
.leaflet-control-zoom a.leaflet-disabled{opacity:0.4;cursor:default}
.leaflet-control-zoom-in{border-top-left-radius:var(--bom-control-radius);border-top-right-radius:var(--bom-control-radius)}
.leaflet-control-zoom-out{border-bottom-left-radius:var(--bom-control-radius);border-bottom-right-radius:var(--bom-control-radius);border-bottom:none}
.leaflet-control-attribution{background:var(--bom-panel-background)!important;color:var(--bom-muted);font-size:10px;padding:2px 6px;border-radius:var(--bom-attribution-radius);line-height:1.4}
.leaflet-control-attribution a{color:var(--bom-text);text-decoration:underline;text-underline-offset:2px}
.leaflet-touch .leaflet-control-zoom a{font-size:18px}
.bom-recenter-control{border:none}
.bom-recenter-button{appearance:none;-webkit-appearance:none;background:transparent;color:var(--bom-text);width:var(--bom-control-size);height:var(--bom-control-size);padding:0;display:flex;align-items:center;justify-content:center;border:none;border-radius:var(--bom-control-radius);cursor:pointer;transition:background 0.15s,color 0.15s,opacity 0.15s}
.bom-recenter-button svg{width:16px;height:16px}
.leaflet-top.leaflet-right > .bom-layer-control{position:static}
.bom-layer-button{appearance:none;-webkit-appearance:none;background:transparent;color:var(--bom-text);width:var(--bom-control-size);height:var(--bom-control-size);padding:0;display:flex;align-items:center;justify-content:center;border:none;border-radius:var(--bom-control-radius);cursor:pointer;transition:background 0.15s,color 0.15s,opacity 0.15s}
.bom-layer-button.is-open{background:var(--bom-selected)}
.bom-layer-button svg{width:16px;height:16px}
.bom-layer-group{margin:0 0 8px;padding:0 2px;font-size:11px;font-weight:600;line-height:1.4;color:var(--bom-muted)}
.bom-layer-section + .bom-layer-section{margin-top:16px}
.bom-layer-grid{display:grid;grid-template-columns:repeat(var(--bom-layer-columns,2),minmax(0,1fr));gap:6px}
.bom-layer-option{appearance:none;-webkit-appearance:none;position:relative;min-width:0;width:100%;min-height:56px;padding:9px 10px;border:1px solid var(--bom-border);border-radius:max(0px,calc(var(--bom-control-radius) - 2px));background:transparent;color:var(--bom-text);cursor:pointer;text-align:left;transition:background 0.15s,color 0.15s}
.bom-layer-option.is-active{background:var(--bom-selected)}
.bom-layer-option.is-active{border-color:var(--bom-ui-accent-color,#F8FAFC)}
.bom-layer-option-name{display:block;font-size:13px;font-weight:500;line-height:1.35;overflow-wrap:anywhere}
.bom-layer-option-unit{display:block;margin-top:4px;padding-right:16px;font-size:11px;color:var(--bom-muted)}
.bom-layer-selected{position:absolute;right:9px;bottom:10px;width:14px;height:14px;color:var(--bom-ui-accent-color);visibility:hidden}
.bom-layer-option.is-active .bom-layer-selected{visibility:visible}
`;

const CARD_CSS = `
${UI_THEME_CSS}
:host {
  display: block;
  font-family: var(--bom-font-family);
  -webkit-font-smoothing: antialiased;
}
button { font-family: inherit; }
ha-card {
  overflow: hidden;
  position: relative;
  isolation: isolate;
  z-index: 0;
  border-radius: var(--bom-card-radius, var(--ha-card-border-radius, var(--ha-border-radius-lg, 12px)));
  background: var(--ha-card-background, var(--card-background-color, var(--bom-surface)));
  box-shadow: var(--ha-card-box-shadow, none);
}
.card-content {
  /* Resolve opacity here, beneath the per-card config on ha-card. */
  --bom-chrome-background: color-mix(in srgb, var(--bom-surface) calc(94% * var(--bom-chrome-opacity, 1)), transparent);
  --bom-control-size: 36px;
  --bom-control-radius: 10px;
  --bom-badge-radius: 8px;
  --bom-bar-radius: 10px;
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
.card-content.is-idle :is(.leaflet-top.leaflet-right, .controls, .layer-badge, .leaflet-control-attribution) {
  opacity: 0;
  pointer-events: none;
  transition: opacity 180ms cubic-bezier(0.23, 1, 0.32, 1);
}
.card-content.is-idle :is(.leaflet-top.leaflet-right, .controls, .leaflet-control-attribution) * {
  pointer-events: none;
}
.card-content.has-top-legend .layer-badge {
  top: 16px;
}
.card-content.has-top-legend .leaflet-top.leaflet-right {
  top: 14px;
}
.card-content.has-short-toolbar .leaflet-top.leaflet-right {
  display: grid;
  grid-template-columns: repeat(var(--bom-toolbar-columns, 5), var(--bom-control-size));
}
.card-content.has-short-toolbar .leaflet-top.leaflet-right > .leaflet-control {
  display: contents;
}
.card-content.has-short-toolbar .layer-badge {
  top: calc(var(--bom-toolbar-height) + 12px);
  max-width: calc(100% - 16px);
  padding: 2px 8px;
  line-height: 1.25;
}
.card-content.has-short-toolbar.has-top-legend .layer-badge {
  top: calc(var(--bom-toolbar-height) + 18px);
}
.card-content.panel-covers-playback .controls {
  visibility: hidden;
}
.card-content.has-playback .leaflet-bottom.leaflet-right {
  bottom: calc(var(--bom-control-size) + 16px);
}
#map {
  position: relative;
  width: 100%;
  border-radius: var(--bom-card-radius, var(--ha-card-border-radius, var(--ha-border-radius-lg, 12px)));
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
  gap: 6px;
  padding: 2px 6px;
  background: var(--bom-chrome-background);
  border-radius: var(--bom-bar-radius);
  border: 1px solid var(--bom-border);
  box-shadow: var(--bom-shadow);
}
.play-btn {
  background: none;
  border: none;
  color: var(--bom-muted);
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--bom-control-size);
  height: var(--bom-control-size);
  border-radius: var(--bom-control-radius);
  transition: color 0.15s, transform 0.1s;
  flex-shrink: 0;
}
.play-btn svg {
  width: 15px;
  height: 15px;
}
.play-btn:hover {
  color: var(--bom-text);
}
.play-btn:active {
  transform: scale(0.92);
}

/* Timeline */
.timeline {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 3px;
  height: var(--bom-control-size);
  padding: 0 2px;
}
.frame-dot {
  appearance: none;
  -webkit-appearance: none;
  flex: 1;
  min-width: 0;
  height: 100%;
  border-radius: var(--bom-track-radius);
  border: 0;
  padding: 0;
  background: transparent;
  cursor: pointer;
  position: relative;
}
.frame-dot::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: calc(50% - 1.5px);
  height: 3px;
  border-radius: var(--bom-track-radius);
  background: var(--bom-track);
  transition: background 0.15s;
}
.frame-dot:hover::after { background: var(--bom-muted); }
.play-btn:focus-visible, .frame-dot:focus-visible, .bom-layer-option:focus-visible,
.bom-layer-close:focus-visible, .bom-layer-body:focus-visible {
  outline: 2px solid var(--bom-ui-accent-color, #F8FAFC);
  outline-offset: 2px;
}
.frame-dot.active::after {
  background: var(--bom-ui-accent-color, #F8FAFC);
  top: calc(50% - 2.5px);
  height: 5px;
}
.frame-dot.past::after {
  background: color-mix(in srgb, var(--bom-ui-accent-color, #F8FAFC) 25%, transparent);
}

/* Time label */
.time-label {
  color: var(--bom-text);
  font-size: 11px;
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
  max-width: calc(100% - var(--bom-control-size) - 40px);
  box-sizing: border-box;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  background: var(--bom-chrome-background);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  border-radius: var(--bom-badge-radius);
  border: 1px solid var(--bom-border);
  color: var(--bom-text);
  font-size: 12px;
  font-weight: 500;
  pointer-events: none;
}
.card-content:has(.bom-layer-panel.is-open, .bom-key-panel:not([hidden])) .layer-badge {
  visibility: hidden;
}
.card-content.has-crowded-label .layer-badge {
  visibility: hidden;
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
.legend-open { position:absolute;top:0;left:0;right:0;height:12px;padding:0;border:0;background:none;cursor:pointer;pointer-events:auto; }
.legend-open:focus-visible { outline:2px solid var(--bom-ui-accent-color,#F8FAFC);outline-offset:-2px; }
.bom-key-cluster { display: flex; flex-direction: column; }
.bom-key-button[hidden], .bom-key-panel[hidden] { display: none; }
.leaflet-control-zoom a:focus-visible, .bom-recenter-button:focus-visible,
.bom-layer-button:focus-visible, .bom-key-close:focus-visible, .bom-key-body:focus-visible {
  outline: 2px solid var(--bom-ui-accent-color, #F8FAFC);
  outline-offset: 2px;
}
.bom-layer-panel, .bom-key-panel {
  position: absolute;
  z-index: 4;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--bom-text);
  background: var(--bom-panel-background);
  border: 1px solid var(--bom-border);
  border-radius: var(--bom-control-radius);
  box-shadow: var(--bom-shadow);
  font-size: 12px;
  line-height: 1.4;
  font-variant-numeric: tabular-nums;
}
.bom-layer-panel:not(.is-open) { display:none; }
.bom-layer-header, .bom-key-header { display:flex;align-items:center;gap:8px;padding-left:12px;flex-shrink:0;border-bottom:1px solid var(--bom-divider); }
.bom-layer-title, .bom-key-title { flex:1;min-width:0;margin:0;font-size:14px;font-weight:600;line-height:1.4;letter-spacing:-0.015em;overflow-wrap:anywhere; }
.bom-layer-count { flex-shrink:0;color:var(--bom-muted);font-size:11px; }
.bom-layer-close, .bom-key-close { flex-shrink:0;width:44px;height:44px;background:none;border:0;color:inherit;cursor:pointer;font:inherit;font-size:22px; }
.bom-layer-body, .bom-key-body { min-height:0;overflow:auto;overscroll-behavior:contain;padding:12px;scrollbar-width:thin;scrollbar-gutter:stable;scrollbar-color:var(--bom-scrollbar) transparent; }
.bom-key-bands { list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(var(--bom-layer-columns,2),minmax(0,1fr));gap:8px 12px; }
.bom-key-bands li { display:flex;align-items:center;gap:9px;min-width:0;min-height:28px;overflow-wrap:anywhere; }
.bom-key-swatch { width:22px;height:22px;border-radius:4px;flex-shrink:0;box-shadow:inset 0 0 0 1px rgb(0 0 0 / 0.15),0 0 0 1px var(--bom-border); }
.bom-key-note { margin:14px 0 0;color:var(--bom-muted);font-size:12px;line-height:1.5; }
@media (hover: hover) and (pointer: fine) {
  .leaflet-control-zoom a:not(.leaflet-disabled):hover,
  .bom-recenter-button:hover, .bom-layer-button:hover,
  .bom-layer-option:hover, .bom-layer-close:hover, .bom-key-close:hover { background:var(--bom-hover); }
}
@media (pointer: coarse) {
  .card-content { --bom-control-size: 44px; }
  .bom-key-close { width: 44px; height: 44px; }
  .bom-layer-option { min-height: 44px; }
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
  background: var(--bom-panel-background);
  pointer-events: none;
  transition: opacity 0.3s;
}
.loading-overlay.hidden {
  opacity: 0;
}
.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid color-mix(in srgb, var(--bom-text) 15%, transparent);
  border-top-color: var(--bom-text);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.loading-text {
  color: var(--bom-text);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.5;
}
.error-text {
  color: var(--bom-error);
  font-size: 13px;
  line-height: 1.5;
  padding: 16px;
  text-align: center;
}

/* Home marker */
.marker-dot {
  position: absolute;
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
@media (prefers-reduced-motion: reduce) {
  .card-content.is-idle :is(.leaflet-top.leaflet-right, .controls, .layer-badge, .leaflet-control-attribution) { transition: none; }
  .play-btn, .frame-dot::after, .loading-overlay,
  .bom-layer-button, .bom-recenter-button, .leaflet-control-zoom a { transition: none; }
  .play-btn:active { transform: none; }
  .marker-dot::after { animation: none; }
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
    this._windowScrollHandler = null;
    this._panelPointerHandler = null;
    this._autoHideControls = null;
    this._layerSwitcher = null;
    this._legendControl = null;
    this._legendKeydownHandler = null;
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
    this._stopThemeObserver?.();
    this._stopThemeObserver = observeUiTheme(this, () => this._hass);
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
    syncUiTheme(this, hass);
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
      auto_hide_controls: config.auto_hide_controls === true,
      show_recenter: config.show_recenter !== false,
      show_layer_switcher: config.show_layer_switcher !== false,
      show_playback: config.show_playback !== false,
      show_legend: config.show_legend !== false,
      show_weather_legend: config.show_weather_legend === true,
      show_legend_button: config.show_legend_button !== false,
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
      carto_api_key: config.carto_api_key,
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
    loadUiFont();

    replaceShadowContentPreservingCardMod(this.shadowRoot, `
      <style>${LEAFLET_CSS}${CARD_CSS}</style>
      <ha-card style="--bom-card-radius:${this._config.square_style ? '0px' : 'var(--ha-card-border-radius, var(--ha-border-radius-lg, 12px))'}; --bom-chrome-opacity:${this._config.chrome_opacity}; --bom-ui-accent-color:${this._config.accent_color || 'var(--bom-default-accent)'}; --bom-map-accent-color:${this._config.location_color || `var(--accent-color, ${DEFAULT_ACCENT_COLOR})`}">
        <div class="card-content${this._config.square_style ? ' is-square' : ''}${this._config.show_playback ? ' has-playback' : ''}">
          <div id="map" style="height: ${this._config.map_height}px"></div>
          <div class="loading-overlay" id="loading">
            <div class="spinner"></div>
            <div class="loading-text">Loading BOM weather data</div>
          </div>
          ${this._config.show_playback ? `
          <div class="controls">
            <button class="play-btn" id="play-btn" type="button" aria-label="Pause animation">${ICON_PAUSE}</button>
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
      this._setupAutoHideControls();
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
    if (this._config.show_legend_button) {
      this._addLegendControl(L);
    }
    this._syncMapToolbar();

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

    // Credits can wrap or gain another provider after the base layer is added.
    this._syncMapToolbar();
    this._setupControls();
    if (this._playing) this._startAnimation();

    // Auto-refresh every 5 minutes
    this._updateTimer = setInterval(() => this._refreshData(), 300000);

    // Pause animation during map interaction
    this._map.on('movestart', () => {
      this._autoHideControls?.hold('move');
      if (this._playing) this._stopAnimation();
    });
    this._map.on('zoomstart', () => {
      this._autoHideControls?.hold('zoom');
      this._pendingZoomRebuild = true;
      this._previousDisplayZoom = this._lastRadarDisplayZoom ?? this._map?.getZoom() ?? this._config.zoom_level;
      if (this._playing) this._stopAnimation();
    });
    this._map.on('moveend', () => {
      this._autoHideControls?.release('move');
      if (this._pendingZoomRebuild) return;
      if (this._playing) this._startAnimation();
    });
    this._map.on('zoomend', async () => {
      this._autoHideControls?.release('zoom');
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
      this._syncMapToolbar();
      this._fitLayerSwitcherPanel();
    });
    // Leaflet measures clientWidth/clientHeight (the padding box), so observe
    // the border box rather than missing padding-only responsive changes.
    this._resizeObserver.observe(container, { box: 'border-box' });
    const credits = this.shadowRoot.querySelector('.leaflet-control-attribution');
    if (credits) this._resizeObserver.observe(credits, { box: 'border-box' });
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
      this._syncMapToolbar();
      this._fitLayerSwitcherPanel();
    };
    window.addEventListener('resize', this._windowResizeHandler);
    this._windowScrollHandler = (event) => {
      const path = event.composedPath();
      if (!path.includes(this._layerSwitcher?.panel) && !path.includes(this._legendControl?.panel)) this._fitLayerSwitcherPanel();
    };
    window.addEventListener('scroll', this._windowScrollHandler, true);
    window.visualViewport?.addEventListener('resize', this._windowResizeHandler);
    window.visualViewport?.addEventListener('scroll', this._windowScrollHandler);
    this._panelPointerHandler = event => {
      const path = event.composedPath();
      if (!path.includes(this._layerSwitcher?.panel) && !path.includes(this._layerSwitcher?.button)) this._closeLayerSwitcher();
      if (!path.includes(this._legendControl?.panel) && !path.includes(this._legendControl?.button) &&
        !path.includes(this.shadowRoot.querySelector('.legend-open'))) this._closeLegendPanel();
    };
    window.addEventListener('pointerdown', this._panelPointerHandler);
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

  _setupAutoHideControls() {
    this._autoHideControls?.destroy();
    this._autoHideControls = null;
    if (!this._config.auto_hide_controls) return;
    const content = this.shadowRoot.querySelector('.card-content');
    const toolbar = this.shadowRoot.querySelector('.leaflet-top.leaflet-right');
    this._autoHideControls = createAutoHideControls({
      content,
      windowTarget: window,
      getActiveElement: () => this.shadowRoot.activeElement,
      // Pointer taps leave DOM focus behind too. Only keyboard-visible focus
      // should prevent idle hiding once the pointer interaction has finished.
      isControlFocused: element => element?.matches(':focus-visible') && (toolbar?.contains(element) ||
        content.querySelector('.controls')?.contains(element) ||
        content.querySelector('.leaflet-control-attribution')?.contains(element)),
      isPanelOpen: () => this._layerSwitcher?.panel.classList.contains('is-open') ||
        Boolean(this._legendControl && !this._legendControl.panel.hidden),
    });
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
      const content = this.shadowRoot.querySelector('.card-content');
      const panel = L.DomUtil.create('section', 'bom-layer-panel', content);

      button.type = 'button';
      button.innerHTML = ICON_LAYERS;
      button.title = 'Choose weather layer';
      button.setAttribute('aria-label', 'Choose weather layer');
      button.setAttribute('aria-controls', 'bom-layer-menu');
      button.setAttribute('aria-expanded', 'false');
      panel.id = 'bom-layer-menu';
      panel.setAttribute('role', 'region');
      panel.setAttribute('aria-labelledby', 'bom-layer-title');
      const header = L.DomUtil.create('div', 'bom-layer-header', panel);
      const title = L.DomUtil.create('h2', 'bom-layer-title', header);
      title.id = 'bom-layer-title';
      title.textContent = 'Weather layers';
      const groups = getGroupedLayerEntries(this._config.enabled_layers || DEFAULT_ENABLED_LAYERS);
      const count = L.DomUtil.create('span', 'bom-layer-count', header);
      count.textContent = `${groups.reduce((total, group) => total + group.entries.length, 0)} available`;
      const close = L.DomUtil.create('button', 'bom-layer-close', header);
      close.type = 'button';
      close.textContent = '×';
      close.setAttribute('aria-label', 'Close weather layers');
      close.addEventListener('click', () => this._closeLayerSwitcher(true));
      const body = L.DomUtil.create('div', 'bom-layer-body', panel);
      body.tabIndex = 0;
      body.setAttribute('role', 'region');
      body.setAttribute('aria-label', 'Available weather layers');

      groups.forEach(({ groupName, entries }) => {
        const section = L.DomUtil.create('section', 'bom-layer-section', body);
        const group = L.DomUtil.create('h3', 'bom-layer-group', section);
        group.textContent = groupName;
        const grid = L.DomUtil.create('div', 'bom-layer-grid', section);

        entries.forEach(([key, layer]) => {
          const option = L.DomUtil.create('button', 'bom-layer-option', grid);
          option.type = 'button';
          option.dataset.layer = key;
          option.innerHTML = `
            <span class="bom-layer-option-name">${layer.name}</span>
            <span class="bom-layer-option-unit">${['icon', 'level'].includes(layer.unit) ? 'Categories' : layer.unit === 'deg' ? 'Direction' : layer.unit}</span>
            <svg class="bom-layer-selected" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 8 3 3 7-7"/></svg>
          `;
          L.DomEvent.on(option, 'click', async (ev) => {
            L.DomEvent.stop(ev);
            await this._setLayer(key);
          });
        });
      });

      const togglePanel = (ev) => {
        L.DomEvent.stop(ev);
        if (panel.classList.contains('is-open')) {
          this._closeLayerSwitcher(true);
          return;
        }
        this._closeLegendPanel();
        panel.classList.add('is-open');
        this._autoHideControls?.activity();
        button.classList.add('is-open');
        button.setAttribute('aria-expanded', 'true');
        this._fitLayerSwitcherPanel();
        const selected = panel.querySelector('.is-active');
        if (selected) {
          const optionRect = selected.getBoundingClientRect();
          const bodyRect = body.getBoundingClientRect();
          if (optionRect.top < bodyRect.top || optionRect.bottom > bodyRect.bottom) {
            body.scrollTop += optionRect.top - bodyRect.top - 4;
          }
          selected.focus({ preventScroll: true });
        } else close.focus({ preventScroll: true });
      };

      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);
      L.DomEvent.disableClickPropagation(panel);
      L.DomEvent.disableScrollPropagation(panel);
      L.DomEvent.on(button, 'click', togglePanel);
      const onEscape = (event) => {
        if (event.key === 'Escape' && panel.classList.contains('is-open')) {
          event.stopPropagation();
          this._closeLayerSwitcher(true);
        }
      };
      container.addEventListener('keydown', onEscape);
      panel.addEventListener('keydown', onEscape);

      this._layerSwitcher = { button, panel, body, close };
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

  _addLegendControl(L) {
    const createButton = (container) => {
      const button = L.DomUtil.create('button', 'bom-layer-button bom-key-button', container);
      button.type = 'button';
      button.innerHTML = ICON_COLOUR_KEY;
      button.title = 'Show colour key';
      button.setAttribute('aria-label', 'Show colour key');
      button.setAttribute('aria-expanded', 'false');
      button.setAttribute('aria-controls', 'bom-colour-key');
      const content = this.shadowRoot.querySelector('.card-content');
      const panel = L.DomUtil.create('section', 'bom-key-panel', content);
      panel.id = 'bom-colour-key';
      panel.hidden = true;
      panel.setAttribute('role', 'region');
      panel.setAttribute('aria-labelledby', 'bom-colour-key-title');
      const header = L.DomUtil.create('div', 'bom-key-header', panel);
      const title = L.DomUtil.create('h2', 'bom-key-title', header);
      title.id = 'bom-colour-key-title';
      const close = L.DomUtil.create('button', 'bom-key-close', header);
      close.type = 'button';
      close.textContent = '×';
      close.setAttribute('aria-label', 'Close colour key');
      const body = L.DomUtil.create('div', 'bom-key-body', panel);
      body.tabIndex = 0;
      body.setAttribute('role', 'region');
      body.setAttribute('aria-label', 'Colour ranges');
      this._legendControl = { button, panel, title, close, body, layerKey: null };
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);
      L.DomEvent.disableClickPropagation(panel);
      L.DomEvent.disableScrollPropagation(panel);
      button.addEventListener('click', () => this._toggleLegendPanel(button));
      close.addEventListener('click', () => this._closeLegendPanel(true));
      const onEscape = (event) => {
        if (event.key === 'Escape' && !panel.hidden) {
          event.stopPropagation();
          this._closeLegendPanel(true);
        }
      };
      this._legendKeydownHandler = onEscape;
      this.shadowRoot.addEventListener('keydown', onEscape);
      this._syncLegendControl();
      return button;
    };
    const cluster = this._layerSwitcher?.button.parentNode;
    if (cluster) {
      cluster.classList.add('bom-key-cluster');
      const button = createButton(cluster);
      cluster.insertBefore(button, this._layerSwitcher.button);
    } else {
      const control = L.control({ position: 'topright' });
      control.onAdd = () => {
        const container = L.DomUtil.create('div', 'leaflet-control');
        createButton(container);
        return container;
      };
      control.addTo(this._map);
    }
    this._map.on('click movestart zoomstart', () => this._closeLegendPanel());
  }

  _syncLegendControl() {
    if (!this._legendControl) return;
    const { button, panel, title, body } = this._legendControl;
    const layerKey = this._getDisplayedRadarLayerKey();
    const legend = getLegendConfig(layerKey);
    const hadFocus = button === this.shadowRoot.activeElement || panel.contains(this.shadowRoot.activeElement);
    if (!legend) this._closeLegendPanel();
    button.hidden = !legend;
    if (!legend && hadFocus) (this._layerSwitcher?.button || this.shadowRoot.getElementById('map'))?.focus();
    if (!legend || this._legendControl.layerKey === layerKey) return;
    title.textContent = `${legend.title}${legend.kind === 'categorical' ? '' : ` (${legend.unit})`}`;
    body.innerHTML = renderLegendBandsHtml(layerKey);
    body.scrollTop = 0;
    panel.dataset.layer = layerKey;
    this._legendControl.layerKey = layerKey;
  }

  _syncMapToolbar() {
    const toolbar = this.shadowRoot.querySelector('.leaflet-top.leaflet-right');
    if (!toolbar) {
      this._syncLayerBadgeVisibility();
      return;
    }
    toolbar.hidden = !(this._config.show_zoom || this._config.show_recenter ||
      this._config.show_layer_switcher || (this._legendControl && !this._legendControl.button.hidden));
    const content = this.shadowRoot.querySelector('.card-content');
    const controls = (this._config.show_zoom ? 2 : 0) + (this._config.show_recenter ? 1 : 0) +
      (this._config.show_layer_switcher ? 1 : 0) + (this._legendControl && !this._legendControl.button.hidden ? 1 : 0);
    const size = window.matchMedia?.('(pointer: coarse)').matches ? 44 : 36;
    const bounds = content.getBoundingClientRect();
    const { top, bottom } = bounds;
    const width = bounds.width || bounds.right - bounds.left || content.clientWidth;
    // Flatten grouped buttons into a grid on short cards, retaining full touch
    // targets while wrapping instead of extending off a narrow card's left edge.
    const maxColumns = Math.max(1, Math.floor((width - 22) / size));
    const rows = Math.ceil(controls / maxColumns);
    const columns = Math.max(1, Math.ceil(controls / Math.max(1, rows)));
    content.style.setProperty('--bom-toolbar-columns', String(columns));
    content.style.setProperty('--bom-toolbar-height', `${rows * size + 6}px`);
    const topInset = content.classList.contains('has-top-legend') ? 14 : 8;
    const creditHeight = this.shadowRoot.querySelector('.leaflet-control-attribution')?.getBoundingClientRect().height || 18;
    const bottomInset = this._config.show_attribution
      ? (this._config.show_playback ? size + 16 : 0) + creditHeight + 16
      : this._config.show_playback ? size + 16 : 8;
    content.classList.toggle('has-short-toolbar', controls * size + 6 > bottom - top - topInset - bottomInset);
    this._syncLayerBadgeVisibility();
  }

  _syncLayerBadgeVisibility() {
    const content = this.shadowRoot.querySelector('.card-content');
    if (!content) return;
    const badge = content.querySelector('.layer-badge');
    if (!badge) {
      content.classList.remove('has-crowded-label');
      return;
    }
    // Visibility preserves the label's box while hidden, so repeated observer
    // callbacks make the same decision until the actual available space changes.
    const label = badge.getBoundingClientRect();
    const card = content.getBoundingClientRect();
    let crowded = label.left < card.left || label.right > card.right ||
      label.top < card.top || label.bottom > card.bottom;
    for (const selector of ['.leaflet-top.leaflet-right', '.controls', '.leaflet-control-attribution']) {
      const control = content.querySelector(selector);
      if (!control || control.hidden) continue;
      const bounds = control.getBoundingClientRect();
      if (bounds.right <= bounds.left || bounds.bottom <= bounds.top) continue;
      // Reserve playback space even while a panel temporarily covers it. This
      // keeps the decision stable through panel open/close and idle fading.
      if (label.left < bounds.right + 4 && label.right + 4 > bounds.left &&
        label.top < bounds.bottom + 4 && label.bottom + 4 > bounds.top) crowded = true;
    }
    content.classList.toggle('has-crowded-label', crowded);
  }

  _closeLegendPanel(restoreFocus = false) {
    if (!this._legendControl) return;
    const { button, panel } = this._legendControl;
    const wasOpen = !panel.hidden;
    if (!panel.hidden && (restoreFocus || panel.contains(this.shadowRoot.activeElement))) {
      const trigger = this.shadowRoot.contains(this._legendControl.trigger) ? this._legendControl.trigger : button;
      trigger.focus({ preventScroll: true });
    }
    this._legendControl.trigger = null;
    panel.hidden = true;
    if (wasOpen) this._autoHideControls?.activity();
    this._syncLegendExpandedState();
    this._fitLayerSwitcherPanel();
  }

  _toggleLegendPanel(trigger) {
    if (!this._legendControl) return;
    const { button, panel, close } = this._legendControl;
    if (!panel.hidden) {
      this._closeLegendPanel(true);
      return;
    }
    this._syncLegendControl();
    if (button.hidden) return;
    this._closeLayerSwitcher();
    this._legendControl.trigger = trigger;
    panel.hidden = false;
    this._autoHideControls?.activity();
    this._fitLayerSwitcherPanel();
    this._syncLegendExpandedState();
    close.focus({ preventScroll: true });
  }

  _syncLegendExpandedState() {
    if (!this._legendControl) return;
    const { button, panel } = this._legendControl;
    const isOpen = !panel.hidden;
    button.classList.toggle('is-open', isOpen);
    button.setAttribute('aria-expanded', String(isOpen));
    button.setAttribute('aria-label', isOpen ? 'Hide colour key' : 'Show colour key');
    button.title = isOpen ? 'Hide colour key' : 'Show colour key';
    this.shadowRoot.querySelector('.legend-open')?.setAttribute('aria-expanded', String(isOpen));
  }

  _renderTopOverlays() {
    const content = this.shadowRoot.querySelector('.card-content');
    const map = this.shadowRoot.getElementById('map');
    if (!content || !map) return;

    content.querySelector('.layer-badge')?.remove();
    const previousLegend = content.querySelector('.legend-card');

    const displayedLayerKey = this._getDisplayedRadarLayerKey();
    this._syncLegendControl();
    const layerConfig = getBomLayerConfig(displayedLayerKey) || BOM_LAYERS.reflectivity;
    const legendConfig = getLegendConfig(displayedLayerKey);
    const showLegend = Boolean(legendConfig && (legendConfig.kind === 'radar'
      ? this._config.show_legend : this._config.show_weather_legend));

    content.classList.toggle('has-top-legend', showLegend);
    this._syncMapToolbar();

    if (this._config.show_layer_label) {
      map.insertAdjacentHTML('beforebegin', `<div class="layer-badge">${layerConfig.name}</div>`);
    }
    // All products use the same strip node and CSS; refreshes need no new node.
    if (!showLegend || previousLegend?.dataset.layer !== displayedLayerKey) previousLegend?.remove();
    if (showLegend && !content.querySelector('.legend-card')) {
      map.insertAdjacentHTML('beforebegin', renderLegendHtml(displayedLayerKey));
    }
    // The first strip renders before the map controls exist. Wire its trigger
    // independently of palette changes so initialization and reconnect work too.
    if (showLegend && this._legendControl) {
      const strip = content.querySelector('.legend-card');
      if (!strip.querySelector('.legend-open')) {
        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'legend-open';
        trigger.setAttribute('aria-label', `Show ${legendConfig.title} colour key`);
        trigger.setAttribute('aria-controls', 'bom-colour-key');
        trigger.setAttribute('aria-expanded', String(!this._legendControl.panel.hidden));
        trigger.addEventListener('click', () => this._toggleLegendPanel(trigger));
        strip.setAttribute('role', 'group');
        strip.appendChild(trigger);
        if (this._legendControl.trigger?.classList.contains('legend-open')) this._legendControl.trigger = trigger;
      }
      this._syncLegendExpandedState();
    }
    this._syncLayerBadgeVisibility();
  }

  _closeLayerSwitcher(restoreFocus = false) {
    if (!this._layerSwitcher) return;
    const wasOpen = this._layerSwitcher.panel.classList.contains('is-open');
    if (this._layerSwitcher.panel.classList.contains('is-open') &&
      (restoreFocus || this._layerSwitcher.panel.contains(this.shadowRoot.activeElement))) {
      this._layerSwitcher.button.focus({ preventScroll: true });
    }
    this._layerSwitcher.panel.classList.remove('is-open');
    if (wasOpen) this._autoHideControls?.activity();
    this._layerSwitcher.button.classList.remove('is-open');
    this._layerSwitcher.button.setAttribute('aria-expanded', 'false');
    this._fitLayerSwitcherPanel();
  }

  _fitLayerSwitcherPanel() {
    const panels = [];
    if (this._layerSwitcher?.panel.classList.contains('is-open')) panels.push(this._layerSwitcher.panel);
    if (this._legendControl && !this._legendControl.panel.hidden) panels.push(this._legendControl.panel);
    const content = this.shadowRoot.querySelector('.card-content');
    if (!content) return;
    if (!panels.length) {
      content.classList.remove('panel-covers-playback');
      return;
    }

    const visual = window.visualViewport;
    const left = visual?.offsetLeft ?? 0;
    const top = visual?.offsetTop ?? 0;
    const layout = {
      card: content.getBoundingClientRect(),
      viewport: { left, top, right: left + (visual?.width ?? window.innerWidth), bottom: top + (visual?.height ?? window.innerHeight) },
      topInset: content.classList.contains('has-top-legend') ? 14 : 8,
      bottomInset: this._config.show_playback ? 64 : 8,
    };
    let bounds = getLayerPickerBounds(layout);
    // Keep a readable row beneath the fixed header on short/partly visible cards.
    // Playback returns as soon as the panel closes.
    const coverPlayback = this._config.show_playback && bounds.maxHeight < 140;
    if (coverPlayback) bounds = getLayerPickerBounds({ ...layout, bottomInset: 8 });
    content.classList.toggle('panel-covers-playback', coverPlayback);
    for (const panel of panels) {
      panel.style.left = `${bounds.left}px`;
      panel.style.top = `${bounds.top}px`;
      panel.style.width = `${bounds.width}px`;
      panel.style.maxHeight = `${bounds.maxHeight}px`;
      panel.style.setProperty('--bom-layer-columns', String(bounds.columns));
    }
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
        playBtn.setAttribute('aria-label', this._playing ? 'Pause animation' : 'Play animation');
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
      dot.setAttribute('aria-pressed', String(i === this._currentFrame));
      dot.setAttribute('aria-label', `Show ${formatLayerTimestamp(layerConfig, this._timestamps[i])}`);
      dot.addEventListener('click', () => {
        this._stopAnimation();
        this._showFrame(i);
        this._playing = false;
        const playBtn = this.shadowRoot.getElementById('play-btn');
        if (playBtn) {
          playBtn.innerHTML = ICON_PLAY;
          playBtn.setAttribute('aria-label', 'Play animation');
        }
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
      dot.setAttribute('aria-pressed', String(i === this._currentFrame));
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
    this._autoHideControls?.destroy();
    this._autoHideControls = null;
    this._radarLoadToken += 1;
    this._stopAnimation();
    this._closeLayerSwitcher();
    this._layerSwitcher?.panel.remove();
    this._closeLegendPanel();
    this._legendControl?.panel.remove();
    this._legendControl = null;
    if (this._legendKeydownHandler) {
      this.shadowRoot.removeEventListener('keydown', this._legendKeydownHandler);
      this._legendKeydownHandler = null;
    }
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
      window.visualViewport?.removeEventListener('resize', this._windowResizeHandler);
      this._windowResizeHandler = null;
    }
    if (this._windowScrollHandler) {
      window.removeEventListener('scroll', this._windowScrollHandler, true);
      window.visualViewport?.removeEventListener('scroll', this._windowScrollHandler);
      this._windowScrollHandler = null;
    }
    if (this._panelPointerHandler) {
      window.removeEventListener('pointerdown', this._panelPointerHandler);
      this._panelPointerHandler = null;
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
    this._stopThemeObserver?.();
    this._stopThemeObserver = null;
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
    this._openSections = new Set(['map']);
    loadUiFont();
  }

  connectedCallback() {
    this._stopObservingTheme?.();
    this._stopObservingTheme = observeUiTheme(this, () => this._hass);
  }

  disconnectedCallback() {
    this._stopObservingTheme?.();
    this._stopObservingTheme = null;
  }

  set hass(hass) {
    const wasLoaded = this._blitzLoaded;
    this._hass = hass;
    syncUiTheme(this, hass);
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
    syncUiTheme(this, this._hass);
    const focusedId = this.shadowRoot.activeElement?.id;
    const layersScrollTop = this.shadowRoot.querySelector('.layer-list')?.scrollTop || 0;
    this.shadowRoot.querySelectorAll('details[data-section]').forEach(section => {
      const name = section.getAttribute('data-section');
      if (section.open) this._openSections.add(name);
      else this._openSections.delete(name);
    });
    const basemapProvider = getBasemapProvider(cfg);
    const basemapStyle = getConfiguredBasemapStyle(cfg, basemapProvider);
    const basemapApiKey = basemapProvider === 'carto'
      ? cfg.carto_api_key
      : basemapProvider === 'bom' ? '' : cfg.basemap_api_key;
    const enabledLayerKeys = getEnabledLayerKeys(cfg);
    const groupedLayers = getGroupedLayerEntries(enabledLayerKeys);
    const bomReferenceLayerKeys = getBomReferenceLayerKeys(cfg);
    const activeEditorLayer = enabledLayerKeys.includes(cfg.layer) ? cfg.layer : enabledLayerKeys[0] || 'reflectivity';
    const layerOptionLabel = layer => `${layer.name}${layer.unit && !['icon', 'level'].includes(layer.unit) ? ` (${layer.unit === 'deg' ? '°' : layer.unit})` : ''}`;
    const rainfallForecastSelected = activeEditorLayer.startsWith('forecast_rain_');
    const radarCoverageAvailable = supportsRadarCoverageLayer(activeEditorLayer);
    const blitzLoaded = isBlitzortungLoaded(this._hass);
    const additionalBomReferenceLayers = Object.entries(BOM_REFERENCE_OVERLAY_STYLES)
      .filter(([key]) => key !== 'state_borders');
    this.shadowRoot.innerHTML = `
      <style>
        ${UI_THEME_CSS}
        :host {
          --editor-text:var(--bom-text);
          --editor-muted:var(--bom-muted);
          --editor-border:var(--bom-border);
          --editor-field:var(--input-fill-color,var(--bom-hover));
          --editor-switch-off:#78838f;
          --editor-switch-on-thumb:#fff;
          --editor-accent:var(--primary-color,#1976d2);
          --editor-link:var(--primary-color,#1565c0);
          display:block; min-width:0; color:var(--editor-text);
          font-family:var(--bom-font-family);
          font-size:14px; line-height:1.5; -webkit-font-smoothing:antialiased;
          container-type:inline-size;
        }
        :host([data-theme="dark"]) {
          --editor-accent:var(--primary-color,#64b5f6);
          --editor-link:var(--primary-color,#90caf9);
          --editor-switch-on-thumb:var(--bom-surface);
        }
        *,*::before,*::after { box-sizing:border-box; }
        .editor { padding:8px 0; }
        .section { min-width:0; padding:18px 4px; border-bottom:1px solid var(--editor-border); }
        .section:first-child { padding-top:0; }
        .section:last-child { border-bottom:0; }
        .section-title { margin:0 0 12px; font-size:16px; font-weight:600; line-height:1.4; letter-spacing:-.02em; }
        details.section { padding:0 4px; }
        summary { display:flex; align-items:center; gap:16px; min-height:64px; padding:14px 0; cursor:pointer; list-style:none; }
        summary::-webkit-details-marker { display:none; }
        summary::after { content:''; width:7px; height:7px; flex:none; margin:0 4px 0 auto; border-right:1.5px solid var(--editor-muted); border-bottom:1.5px solid var(--editor-muted); transform:rotate(45deg); }
        details[open]>summary::after { transform:rotate(225deg); }
        summary .section-title { display:block; margin:0; font-size:15px; }
        .section-description { display:block; margin-top:3px; color:var(--editor-muted); font-size:12px; font-weight:400; line-height:1.4; }
        .section-content { padding:2px 0 20px; }
        .map-details { margin:0 0 16px; }
        .map-details>summary { min-height:44px; padding:8px 0; font-size:13px; font-weight:500; }
        .row { margin-bottom:16px; min-width:0; }
        .row:last-child { margin-bottom:0; }
        .row[hidden] { display:none; }
        .row-inline { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
        label,.field-label { display:block; margin:0 0 6px; color:var(--editor-text); font-size:13px; font-weight:500; }
        select,input[type="number"],input[type="password"] { width:100%; min-width:0; min-height:44px; padding:10px 12px; border:1px solid var(--editor-border); border-radius:8px; background:var(--editor-field); color:var(--editor-text); font:inherit; font-size:14px; }
        select { padding-right:28px; text-overflow:ellipsis; }
        input[type="number"] { font-variant-numeric:tabular-nums; }
        input::placeholder { color:var(--editor-muted); opacity:1; }
        input:disabled { opacity:.6; }
        input[type="color"] { width:100%; height:44px; padding:5px; border:1px solid var(--editor-border); border-radius:8px; background:var(--editor-field); cursor:pointer; }
        select:focus-visible,input:focus-visible,summary:focus-visible,a:focus-visible { outline:2px solid var(--editor-accent); outline-offset:3px; }
        .toggle-row { position:relative; display:flex; align-items:center; justify-content:space-between; min-height:44px; gap:20px; margin:0; padding:8px 0; cursor:pointer; font-weight:400; }
        .toggle-label { min-width:0; color:var(--editor-text); font-size:14px; line-height:1.45; }
        .toggle { position:relative; display:block; width:40px; height:24px; flex:none; }
        .toggle input { position:absolute; z-index:1; inset:-10px -2px; width:44px; height:44px; margin:0; opacity:0; cursor:pointer; }
        .toggle-slider { position:absolute; inset:0; background:var(--editor-switch-off); border-radius:12px; }
        .toggle-slider::before { position:absolute; content:''; height:18px; width:18px; left:3px; top:3px; background:#fff; border-radius:50%; box-shadow:0 1px 2px #0003; }
        .toggle input:focus-visible+.toggle-slider { outline:2px solid var(--editor-accent); outline-offset:3px; }
        .toggle input:checked+.toggle-slider { background:var(--editor-accent); }
        .toggle input:checked+.toggle-slider::before { transform:translateX(16px); background:var(--editor-switch-on-thumb); }
        .help-text { margin:6px 0 12px; color:var(--editor-muted); font-size:12px; line-height:1.55; overflow-wrap:anywhere; }
        .help-text:last-child { margin-bottom:0; }
        .help-text a { color:var(--editor-link); text-underline-offset:2px; }
        .layer-list { max-height:360px; overflow:auto; overscroll-behavior:contain; scrollbar-gutter:stable; padding:2px 8px 2px 4px; border:1px solid var(--editor-border); border-radius:8px; }
        .layer-group-title { margin:16px 0 4px; padding:0 0 5px; border-bottom:1px solid var(--editor-border); color:var(--editor-muted); font-size:12px; font-weight:600; line-height:1.5; }
        .layer-group-title:first-child { margin-top:8px; }
        @container (max-width:340px) {
          .row-inline { grid-template-columns:1fr; gap:0; }
          select,input[type="number"],input[type="password"] { font-size:16px; }
        }
      </style>
      <div class="editor">
        <div class="section">
          <h2 class="section-title">Weather layer</h2>
          <div class="row">
            <label for="layer">Default layer</label>
            <select id="layer" ${rainfallForecastSelected ? 'aria-describedby="forecast-rain-help"' : ''}>
              ${groupedLayers.map(({ groupName, entries }) => {
                const options = entries.map(([key, val]) =>
                  `<option value="${key}" ${activeEditorLayer === key ? 'selected' : ''}>${layerOptionLabel(val)}</option>`
                ).join('');
                return `<optgroup label="${groupName}">${options}</optgroup>`;
              }).join('')}
            </select>
            ${rainfallForecastSelected ? '<div class="help-text" id="forecast-rain-help">Forecast rainfall amounts marked 50%, 25% or 10% show the chance of exceeding that amount. Chance of rain layers show whether rain is likely.</div>' : ''}
          </div>
          <div class="row-inline">
            <div class="row">
              <label for="radar_opacity">Weather opacity (%)</label>
              <input type="number" id="radar_opacity" min="10" max="100" step="5" value="${escapeHtml(Number(((cfg.radar_opacity || 0.7) * 100).toFixed(6)))}">
            </div>
            <div class="row">
              <label for="chrome_opacity">Controls opacity (%)</label>
              <input type="number" id="chrome_opacity" min="20" max="100" step="5" aria-describedby="controls-opacity-help" value="${escapeHtml(Number(((cfg.chrome_opacity ?? 1) * 100).toFixed(6)))}">
            </div>
          </div>
          <div class="help-text" id="controls-opacity-help">Open panels stay solid for readability.</div>
        </div>
        <details class="section" data-section="map" ${this._openSections.has('map') ? 'open' : ''}>
          <summary><span><span class="section-title">Map</span><span class="section-description">Background, size and starting view</span></span></summary>
          <div class="section-content">
          <div class="row-inline">
            <div class="row">
              <label for="basemap_provider">Map provider</label>
              <select id="basemap_provider">
                ${Object.entries(BASEMAP_PROVIDER_NAMES).map(([key, label]) =>
                  `<option value="${key}" ${basemapProvider === key ? 'selected' : ''}>${label}</option>`
                ).join('')}
              </select>
            </div>
            <div class="row">
              <label for="basemap_style">Map style</label>
              <select id="basemap_style">
                ${getBasemapStyleOptions(basemapProvider).map((style) =>
                  `<option value="${style.value}" ${basemapStyle === style.value ? 'selected' : ''}>${style.label}</option>`
                ).join('')}
              </select>
            </div>
          </div>
          <div class="row" ${basemapProvider === 'bom' ? 'hidden' : ''}>
            <label for="basemap_api_key">${BASEMAP_PROVIDER_NAMES[basemapProvider]} API key</label>
            <input type="password" id="basemap_api_key" value="${escapeHtml(basemapApiKey || '')}" autocomplete="off" aria-describedby="provider-key-help" ${basemapProvider === 'bom' ? 'disabled' : ''}>
            <div class="help-text" id="provider-key-help">Use a key from your selected provider. Changing providers clears the saved key. <a href="https://github.com/AshtonAU/bom-radar-card#getting-basemap-provider-keys" target="_blank" rel="noreferrer">How to get a key</a>.</div>
          </div>
          <details class="map-details" data-section="references" ${this._openSections.has('references') ? 'open' : ''}>
            <summary id="reference-overlays-title">Boundaries and landmarks</summary>
            <div role="group" aria-labelledby="reference-overlays-title">
              ${this._toggle('show_bom_boundaries', 'State borders', bomReferenceLayerKeys.includes('state_borders'))}
              ${additionalBomReferenceLayers.map(([key, layer]) =>
                this._toggle(`bom_reference_layer__${key}`, layer.name, bomReferenceLayerKeys.includes(key))
              ).join('')}
            </div>
            <div class="help-text">Add boundaries and landmarks above the weather layer.</div>
          </details>
          <div class="row-inline">
            <div class="row">
              <label for="zoom_level">Starting zoom (3–${cfg.allow_overzoom === true ? MAX_OVERZOOM_DISPLAY_ZOOM : MAX_DISPLAY_ZOOM})</label>
              <input type="number" id="zoom_level" min="3" max="${cfg.allow_overzoom === true ? MAX_OVERZOOM_DISPLAY_ZOOM : MAX_DISPLAY_ZOOM}" value="${escapeHtml(cfg.zoom_level || 7)}">
            </div>
            <div class="row">
              <label for="map_height">Card height (px)</label>
              <input type="number" id="map_height" min="150" max="800" value="${escapeHtml(cfg.map_height || 300)}">
            </div>
          </div>
          ${this._toggle('allow_overzoom', 'Closer zoom · experimental', cfg.allow_overzoom === true, 'overzoom-help')}
          <div class="help-text" id="overzoom-help">Allow zoom levels up to 10. This enlarges the map without adding weather detail.</div>
          <div class="row-inline">
            <div class="row">
              <label for="center_latitude">Centre latitude</label>
              <input type="number" id="center_latitude" step="0.01" min="-90" max="90" placeholder="Home location" aria-describedby="map-centre-help" value="${escapeHtml(cfg.center_latitude ?? '')}">
            </div>
            <div class="row">
              <label for="center_longitude">Centre longitude</label>
              <input type="number" id="center_longitude" step="0.01" min="-180" max="180" placeholder="Home location" aria-describedby="map-centre-help" value="${escapeHtml(cfg.center_longitude ?? '')}">
            </div>
          </div>
          <div class="help-text" id="map-centre-help">Leave blank to centre the map on your Home Assistant home location.</div>
          </div>
        </details>

        <details class="section" data-section="playback" ${this._openSections.has('playback') ? 'open' : ''}>
          <summary><span><span class="section-title">Playback</span><span class="section-description">Animation speed and frame count</span></span></summary>
          <div class="section-content">
          <div class="row">
            <label for="frame_count">Frames per loop</label>
            <input type="number" id="frame_count" min="1" max="9" value="${escapeHtml(cfg.frame_count || 9)}">
          </div>
          <div class="row-inline">
            <div class="row">
              <label for="frame_delay">Time per frame (ms)</label>
              <input type="number" id="frame_delay" min="100" max="2000" step="50" value="${escapeHtml(cfg.frame_delay || 500)}">
            </div>
            <div class="row">
              <label for="restart_delay">Pause between loops (ms)</label>
              <input type="number" id="restart_delay" min="500" max="5000" step="100" value="${escapeHtml(cfg.restart_delay || 1500)}">
            </div>
          </div>
          </div>
        </details>

        <details class="section" data-section="display" ${this._openSections.has('display') ? 'open' : ''}>
          <summary><span><span class="section-title">Controls and appearance</span><span class="section-description">Buttons, colour strips and card styling</span></span></summary>
          <div class="section-content">
          ${this._toggle('show_marker', 'Home marker', cfg.show_marker !== false)}
          ${this._toggle('show_zoom', 'Zoom controls', cfg.show_zoom !== false)}
          ${this._toggle('show_recenter', 'Re-centre button', cfg.show_recenter !== false)}
          ${this._toggle('show_layer_switcher', 'Layer picker', cfg.show_layer_switcher !== false)}
          ${this._toggle('auto_hide_controls', 'Auto-hide controls', cfg.auto_hide_controls === true, 'auto-hide-controls-help')}
          <div class="help-text" id="auto-hide-controls-help">After 10 seconds of inactivity, show only the map and top colour strip. The toolbar, playback, timestamps, layer title and map credits fade out. Move the pointer or tap once to bring them back.</div>
          ${this._toggle('show_playback', 'Playback controls', cfg.show_playback !== false)}
          ${this._toggle('show_legend', 'Radar colour strip', cfg.show_legend !== false)}
          ${this._toggle('show_weather_legend', 'Other weather colour strips', cfg.show_weather_legend === true, 'weather-strips-help')}
          ${this._toggle('show_legend_button', 'Colour key button', cfg.show_legend_button !== false)}
          <div class="help-text" id="weather-strips-help">The thin strip shows the active layer&apos;s colours. Tap it or the colour key button for values and units. Direction-only layers have no strip.</div>
          ${radarCoverageAvailable
            ? this._toggle('show_radar_coverage', 'Shade areas outside radar coverage', cfg.show_radar_coverage === true)
            : ''}
          ${this._toggle('square_style', 'Square corners', cfg.square_style === true)}
          ${this._toggle('show_layer_label', 'Weather layer title', cfg.show_layer_label === true)}
          ${this._toggle('show_attribution', 'Map credits', cfg.show_attribution !== false, 'attribution-help')}
          <div class="help-text" id="attribution-help">Keep credits visible to acknowledge the map and weather providers. CARTO requires them.</div>
          ${this._toggle('use_custom_accent_color', 'Custom accent colour', Boolean(cfg.accent_color))}
          ${cfg.accent_color ? `
            <div class="row">
              <label for="accent_color">Controls accent</label>
              <input type="color" id="accent_color" aria-describedby="accent-help" value="${escapeHtml(cfg.accent_color || DEFAULT_UI_ACCENT_COLOR)}">
              <div class="help-text" id="accent-help">Leave custom colour off to follow your Home Assistant theme.</div>
            </div>
          ` : ''}
          </div>
        </details>

        <details class="section" data-section="layers" ${this._openSections.has('layers') ? 'open' : ''}>
          <summary><span><span class="section-title">Available layers</span><span class="section-description">${enabledLayerKeys.length} of ${DEFAULT_ENABLED_LAYERS.length} layers in the picker</span></span></summary>
          <div class="section-content">
          <p class="help-text" id="enabled-layers-help">Choose which weather layers people can switch between. Keep at least one enabled.</p>
          <div class="layer-list" role="group" aria-label="Available weather layers" aria-describedby="enabled-layers-help">
            ${BOM_LAYER_GROUPS.map((groupName) => {
              const entries = Object.entries(BOM_LAYERS).filter(([, layer]) => layer.category === groupName);
              if (!entries.length) return '';
              return `
                <h3 class="layer-group-title">${groupName}</h3>
                ${entries.map(([key, layer]) =>
                  this._toggle(`enabled_layer__${key}`, layerOptionLabel(layer), enabledLayerKeys.includes(key))
                ).join('')}
              `;
            }).join('')}
          </div>
          </div>
        </details>

        <details class="section" data-section="lightning" ${this._openSections.has('lightning') ? 'open' : ''}>
          <summary><span><span class="section-title">Lightning</span><span class="section-description">${blitzLoaded ? 'Strike visibility and fading' : 'Requires the Blitzortung integration'}</span></span></summary>
          <div class="section-content">
          ${this._toggle('show_lightning', 'Lightning strikes', cfg.show_lightning !== false)}
          ${blitzLoaded ? (cfg.show_lightning !== false ? `
            <div class="row">
              <label for="lightning_fade_minutes">Show strikes from the last (minutes)</label>
              <input type="number" id="lightning_fade_minutes" min="1" max="120" value="${escapeHtml(cfg.lightning_fade_minutes ?? 30)}">
            </div>
            ${this._toggle('lightning_pulse', 'Pulse on new strike', cfg.lightning_pulse !== false)}
          ` : '') : `
            <div class="help-text">The <a href="https://github.com/mrk-its/homeassistant-blitzortung" target="_blank" rel="noreferrer">Blitzortung integration</a> is not detected. Add it to Home Assistant to show nearby lightning strikes.</div>
          `}
          </div>
        </details>

        <details class="section" data-section="location" ${this._openSections.has('location') ? 'open' : ''}>
          <summary><span><span class="section-title">Home marker</span><span class="section-description">Location and marker colour</span></span></summary>
          <div class="section-content">
          <div class="row-inline">
            <div class="row">
              <label for="marker_latitude">Marker latitude</label>
              <input type="number" id="marker_latitude" step="0.01" min="-90" max="90" placeholder="Home location" aria-describedby="marker-location-help" value="${escapeHtml(cfg.marker_latitude ?? '')}">
            </div>
            <div class="row">
              <label for="marker_longitude">Marker longitude</label>
              <input type="number" id="marker_longitude" step="0.01" min="-180" max="180" placeholder="Home location" aria-describedby="marker-location-help" value="${escapeHtml(cfg.marker_longitude ?? '')}">
            </div>
          </div>
          <div class="help-text" id="marker-location-help">Leave blank to use your Home Assistant home location.</div>
          ${this._toggle('use_custom_location_color', 'Custom marker colour', Boolean(cfg.location_color))}
          ${cfg.location_color ? `
            <div class="row">
              <label for="location_color">Marker colour</label>
              <input type="color" id="location_color" aria-describedby="marker-colour-help" value="${escapeHtml(cfg.location_color || DEFAULT_ACCENT_COLOR)}">
              <div class="help-text" id="marker-colour-help">Leave custom colour off to use your Home Assistant accent.</div>
            </div>
          ` : ''}
          </div>
        </details>
      </div>
    `;

    this.shadowRoot.querySelectorAll('details[data-section]').forEach(section => {
      section.addEventListener('toggle', () => {
        const name = section.getAttribute('data-section');
        if (section.open) this._openSections.add(name);
        else this._openSections.delete(name);
      });
    });

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
      'auto_hide_controls',
      'show_marker', 'show_zoom', 'show_recenter', 'show_layer_switcher', 'show_playback',
      'show_legend', 'show_weather_legend', 'show_legend_button', 'show_bom_boundaries', 'square_style', 'show_layer_label', 'show_attribution', 'allow_overzoom', 'use_custom_accent_color', 'use_custom_location_color',
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
    const layerList = this.shadowRoot.querySelector('.layer-list');
    if (layerList) layerList.scrollTop = layersScrollTop;
    if (focusedId) this.shadowRoot.getElementById(focusedId)?.focus({ preventScroll: true });
  }

  _toggle(id, label, checked, describedBy = '') {
    return `
      <label class="toggle-row" for="${id}">
        <span class="toggle-label">${label}</span>
        <span class="toggle">
          <input type="checkbox" role="switch" id="${id}" ${checked ? 'checked' : ''} ${describedBy ? `aria-describedby="${describedBy}"` : ''}>
          <span class="toggle-slider" aria-hidden="true"></span>
        </span>
      </label>
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

    const previousBasemapProvider = getBasemapProvider(config);
    const basemapProvider = get('basemap_provider');
    const nextBasemapProvider = basemapProvider
      ? getBasemapProvider({ basemap_provider: basemapProvider.value })
      : previousBasemapProvider;
    const basemapProviderChanged = nextBasemapProvider !== previousBasemapProvider;
    if (basemapProvider) config.basemap_provider = nextBasemapProvider;

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
      if (basemapProviderChanged) {
        basemapApiKey.value = '';
        delete config.basemap_api_key;
        delete config.carto_api_key;
      } else if (nextBasemapProvider === 'carto') {
        delete config.basemap_api_key;
        if (basemapApiKey.value.trim() === '') {
          delete config.carto_api_key;
        } else {
          config.carto_api_key = basemapApiKey.value.trim();
        }
      } else if (nextBasemapProvider === 'stadia' || nextBasemapProvider === 'esri') {
        delete config.carto_api_key;
        if (basemapApiKey.value.trim() === '') {
          delete config.basemap_api_key;
        } else {
          config.basemap_api_key = basemapApiKey.value.trim();
        }
      } else if (basemapApiKey.value.trim() === '') {
        delete config.basemap_api_key;
        delete config.carto_api_key;
      } else {
        delete config.basemap_api_key;
        delete config.carto_api_key;
      }
    }

    const useCustomAccent = get('use_custom_accent_color');
    if (useCustomAccent?.checked) {
      const accentColor = sanitizeAccentColor(get('accent_color')?.value);
      config.accent_color = accentColor || (this.getAttribute('data-theme') === 'dark' ? '#edf1f5' : '#26384b');
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
      radar_opacity: 'percent', chrome_opacity: 'percent',
      lightning_fade_minutes: 'int',
    };

    Object.entries(numFields).forEach(([id, type]) => {
      const el = get(id);
      if (!el) return;
      if (el.value === '') {
        delete config[id];
      } else {
        config[id] = type === 'int' ? parseInt(el.value) : parseFloat(el.value) / (type === 'percent' ? 100 : 1);
      }
    });

    const toggleFields = [
      'auto_hide_controls',
      'show_marker', 'show_zoom', 'show_recenter', 'show_layer_switcher', 'show_playback',
      'show_legend', 'show_weather_legend', 'show_legend_button', 'show_bom_boundaries', 'square_style', 'show_layer_label', 'show_attribution', 'allow_overzoom',
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
