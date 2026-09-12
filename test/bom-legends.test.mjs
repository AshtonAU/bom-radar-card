import assert from 'node:assert/strict';
import test from 'node:test';
import { BOM_LAYERS } from '../src/bom-layers.js';
import { getLayerLegend, getLegendTableUrl } from '../src/bom-legends.js';

test('every supported layer has an explicit legend type and its own units', () => {
  const counts = {};
  for (const [key, layer] of Object.entries(BOM_LAYERS)) {
    const legend = getLayerLegend(key);
    assert.ok(legend, `${key} needs a legend definition`);
    assert.equal(legend.layerKey, key);
    assert.equal(legend.title, layer.name);
    assert.equal(legend.unit, layer.unit);
    assert.ok(legend.rasterFunction);
    assert.equal(legend.bands.length > 0, legend.kind !== 'direction');
    counts[legend.kind] = (counts[legend.kind] || 0) + 1;
  }
  assert.deepEqual(counts, { radar: 2, numeric: 24, direction: 3, categorical: 5 });
});

test('rain rate and reflectivity use different verified ranges, not interchangeable units', () => {
  const rain = getLayerLegend('rain_rate');
  const reflectivity = getLayerLegend('reflectivity');
  assert.equal(rain.unit, 'mm/h');
  assert.equal(reflectivity.unit, 'dBZ');
  assert.deepEqual(rain.bands[0], { label: 'less than 2', rgba: [245, 245, 255, 255] });
  assert.equal(rain.bands.at(-1).label, '400+');
  assert.equal(reflectivity.bands[0].label, '12 - 23');
  assert.equal(reflectivity.bands.at(-1).label, '> 64');
});

test('daily and three-hour UV share independently verified upstream bands', () => {
  assert.deepEqual(getLayerLegend('uv_index').bands, getLayerLegend('uv_max_daily').bands);
  assert.equal(getLayerLegend('uv_max_daily').bands.at(-1).label, '> 11', 'preserve BOM wording, do not infer threshold inclusivity');
});

test('direction legends identify the real arrow renderer without inventing colour ranges', () => {
  assert.equal(getLayerLegend('wind_direction').rasterFunction, 'wind_direction_deg_n');
  for (const key of ['wind_direction', 'swell_1_direction', 'swell_2_direction']) {
    assert.equal(getLayerLegend(key).kind, 'direction');
    assert.deepEqual(getLayerLegend(key).bands, []);
  }
});

test('source URLs preserve the layer product, category and rendering rule', () => {
  for (const [key, layer] of Object.entries(BOM_LAYERS)) {
    const url = new URL(getLegendTableUrl(key));
    const category = layer.timeMode === 'past' ? 'observations' : 'forecasts';
    assert.equal(url.hostname, 'api.bom.gov.au');
    assert.equal(url.pathname, `/apikey/v1/mapping/${category}/${layer.id}/ImageServer/rasterAttributeTable`);
    assert.deepEqual(JSON.parse(url.searchParams.get('renderingRule')), { rasterFunction: getLayerLegend(key).rasterFunction });
  }
});

test('a consumer cannot mutate the shared palette through the legend contract', () => {
  const legend = getLayerLegend('air_temperature');
  legend.bands[0].label = 'changed';
  legend.bands[0].rgba[0] = 0;
  assert.deepEqual(getLayerLegend('air_temperature').bands[0], { label: '< 0', rgba: [16, 61, 98, 255] });
});

test('unknown or inherited property names do not fall back to a different legend', () => {
  for (const key of [undefined, null, '', 'missing', '__proto__', 'constructor', 'toString']) {
    assert.equal(getLayerLegend(key), null);
    assert.equal(getLegendTableUrl(key), null);
  }
});
