import { BOM_LAYERS } from './bom-layers.js';
import { BOM_LAYER_LEGENDS, BOM_LEGEND_SCALES } from './bom-legend-data.js';

const DIRECTION_FUNCTIONS = {
  wind_direction: 'wind_direction_deg_n',
  swell_1_direction: 'wave_direction_deg_n',
  swell_2_direction: 'wave_direction_deg_n',
};

/**
 * Presentation-independent legend contract for every supported weather layer.
 * Numeric/categorical/radar bands retain BOM's labels verbatim. Direction
 * layers use glyphs, so they deliberately have no colour bands. Unknown keys
 * return null rather than falling back to a misleading rain legend.
 * This is bundled data: it never fetches metadata at runtime.
 */
export function getLayerLegend(layerKey) {
  if (!Object.hasOwn(BOM_LAYERS, layerKey)) return null;
  const layer = BOM_LAYERS[layerKey];
  const base = { layerKey, title: layer.name, unit: layer.unit };
  if (Object.hasOwn(DIRECTION_FUNCTIONS, layerKey)) {
    return { ...base, kind: 'direction', rasterFunction: DIRECTION_FUNCTIONS[layerKey], bands: [] };
  }
  const rasterFunction = BOM_LAYER_LEGENDS[layerKey];
  const scale = BOM_LEGEND_SCALES[rasterFunction];
  if (!scale) return null;
  return {
    ...base,
    kind: layer.legendType === 'rainRadar' ? 'radar'
      : ['icon', 'level'].includes(layer.unit) ? 'categorical' : 'numeric',
    rasterFunction,
    bands: scale.bands.map(([label, ...rgba]) => ({ label, rgba })),
  };
}

export function getLegendTableUrl(layerKey) {
  const legend = getLayerLegend(layerKey);
  if (!legend) return null;
  const layer = BOM_LAYERS[layerKey];
  const category = layer.timeMode === 'past' ? 'observations' : 'forecasts';
  const url = new URL(`https://api.bom.gov.au/apikey/v1/mapping/${category}/${layer.id}/ImageServer/rasterAttributeTable`);
  url.searchParams.set('f', 'json');
  url.searchParams.set('renderingRule', JSON.stringify({ rasterFunction: legend.rasterFunction }));
  return url.href;
}
