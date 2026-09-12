import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { getLayerLegend } from '../src/bom-legends.js';
import { BOM_LAYERS } from '../src/bom-layers.js';
import { getLegendConfig, renderLegendHtml, renderLegendBandsHtml } from '../src/legend.js';

// An independent snapshot of the pre-refactor CSS, not another runtime palette.
const EXISTING_GRADIENT = 'linear-gradient(90deg, rgb(245, 245, 255) 0%, rgb(180, 180, 255) 7%, rgb(120, 120, 255) 14%, rgb(20, 20, 255) 21%, rgb(0, 216, 195) 28%, rgb(0, 150, 144) 35%, rgb(0, 102, 102) 42%, rgb(255, 255, 0) 49%, rgb(255, 200, 0) 56%, rgb(255, 150, 0) 63%, rgb(255, 100, 0) 70%, rgb(255, 0, 0) 77%, rgb(200, 0, 0) 84%, rgb(120, 0, 0) 91%, rgb(40, 0, 0) 100%)';

test('both radar gradients are byte-for-byte identical to the existing visual strip', () => {
  for (const key of ['reflectivity', 'rain_rate']) {
    assert.equal(getLayerLegend(key).bands.length, 15, 'review gradient spacing if BOM changes its band count');
    assert.equal(getLegendConfig(key).gradient, EXISTING_GRADIENT);
  }
});

test('gradient colours come from the selected product table in their original order', () => {
  for (const key of ['reflectivity', 'rain_rate']) {
    const colors = [...getLegendConfig(key).gradient.matchAll(/rgb\((\d+), (\d+), (\d+)\)/g)]
      .map((match) => match.slice(1).map(Number));
    assert.deepEqual(colors, getLayerLegend(key).bands.map(({ rgba }) => rgba.slice(0, 3)));
  }
});

test('shared colours do not erase distinct reflectivity and rain-rate meaning', () => {
  assert.equal(getLegendConfig('reflectivity').unit, 'dBZ');
  assert.match(getLegendConfig('reflectivity').ariaLabel, /radar echoes; qualitative/);
  assert.equal(getLegendConfig('rain_rate').unit, 'mm/h');
  assert.match(getLegendConfig('rain_rate').ariaLabel, /rainfall; qualitative/);
});

test('does not invent colour strips for direction products or unknown keys', () => {
  for (const key of ['wind_direction', 'swell_1_direction', 'swell_2_direction', undefined, '__proto__', 'constructor', 'missing']) {
    assert.equal(getLegendConfig(key), null);
    assert.equal(renderLegendHtml(key), '');
  }
});

test('the card uses one renderer and one six-pixel CSS rule for every colour strip', async () => {
  const source = await readFile(new URL('../src/bom-radar-card.js', import.meta.url), 'utf8');
  assert.match(source, /import \{ getLegendConfig, renderLegendHtml, renderLegendBandsHtml \} from '\.\/legend\.js'/);
  assert.match(source, /\.legend-scale\s*\{\s*height: 6px;/);
  assert.equal([...source.matchAll(/\.legend-scale\s*\{/g)].length, 1);
  assert.doesNotMatch(source, /const RADAR_LEGEND\s*=|has-weather-legend|weather-legend-heading/);
});

test('expanded key renders every exact band with units and no gradient interpolation', () => {
  for (const key of Object.keys(BOM_LAYERS)) {
    const legend = getLayerLegend(key);
    const html = renderLegendBandsHtml(key);
    if (legend.kind === 'direction') {
      assert.equal(html, '');
      continue;
    }
    assert.equal((html.match(/<li>/g) || []).length, legend.bands.length);
    assert.equal((html.match(/class="bom-key-swatch"/g) || []).length, legend.bands.length);
    assert.doesNotMatch(html, /linear-gradient|fetch\(|https?:/);
  }
  assert.match(renderLegendBandsHtml('air_temperature'), /&lt; 0 °C/);
  assert.match(renderLegendBandsHtml('reflectivity'), /&gt; 64 dBZ/);
  assert.match(renderLegendBandsHtml('rain_rate'), /400\+ mm\/h/);
  assert.doesNotMatch(renderLegendBandsHtml('snow'), /Snow icon/);
  assert.equal(renderLegendBandsHtml('missing'), '');
});

test('all 31 colour-bearing layers render through the same markup with valid source colours', () => {
  let rendered = 0;
  for (const key of Object.keys(BOM_LAYERS)) {
    const legend = getLegendConfig(key);
    if (!legend) continue;
    const html = renderLegendHtml(key);
    assert.match(html, /^<div class="legend-card" data-layer="[^"]+" role="img" aria-label="/);
    assert.equal((html.match(/class="legend-scale"/g) || []).length, 1);
    assert.doesNotMatch(html, /details|summary|button|fetch\(|https?:|NaN|undefined/);
    for (const { label, rgba } of legend.bands) {
      assert.ok(label.trim());
      assert.equal(rgba.length, 4);
      assert.ok(rgba.every(value => Number.isInteger(value) && value >= 0 && value <= 255));
    }
    rendered += 1;
  }
  assert.equal(rendered, 31);
});

test('all 24 numerical layers smoothly interpolate their own palettes from zero to 100 percent', () => {
  let numeric = 0;
  for (const key of Object.keys(BOM_LAYERS)) {
    const legend = getLegendConfig(key);
    if (legend?.kind !== 'numeric') continue;
    const stops = [...legend.gradient.matchAll(/rgb\((\d+), (\d+), (\d+)\) ([\d.]+)%/g)];
    assert.equal(stops.length, legend.bands.length);
    assert.equal(Number(stops[0][4]), 0);
    assert.equal(Number(stops.at(-1)[4]), 100);
    assert.deepEqual(stops.map(stop => stop.slice(1, 4).map(Number)), legend.bands.map(({ rgba }) => rgba.slice(0, 3)));
    assert.ok(stops.slice(1).every((stop, i) => Number(stop[4]) > Number(stops[i][4])));
    assert.match(legend.ariaLabel, /not a numerical axis/);
    numeric += 1;
  }
  assert.equal(numeric, 24);
});

test('categories have hard boundaries and fog is one solid colour without interpolation', () => {
  assert.equal(getLegendConfig('thunderstorms').gradient,
    'linear-gradient(90deg, rgb(241, 154, 154) 0%, rgb(241, 154, 154) 50%, rgb(219, 3, 3) 50%, rgb(219, 3, 3) 100%)');
  assert.equal(getLegendConfig('fog').gradient,
    'linear-gradient(90deg, rgb(184, 196, 197) 0%, rgb(184, 196, 197) 100%)');
  for (const key of ['heatwave_severity', 'snow', 'frost']) {
    const legend = getLegendConfig(key);
    const positions = [...legend.gradient.matchAll(/ ([\d.]+)%/g)].map(match => Number(match[1]));
    assert.equal(positions.length, legend.bands.length * 2);
    assert.equal(positions[0], 0);
    assert.equal(positions.at(-1), 100);
    for (let i = 1; i < legend.bands.length; i += 1) assert.equal(positions[2 * i - 1], positions[2 * i]);
  }
});

test('exact labels and units stay accessible and HTML boundaries are escaped', () => {
  const html = renderLegendHtml('air_temperature');
  assert.match(html, /&lt; 0 °C/);
  assert.match(html, /&gt; 45 °C/);
  assert.match(renderLegendHtml('wind_speed_kmh'), /km\/h/);
  assert.match(renderLegendHtml('wind_speed_kt'), / kt/);
  assert.match(renderLegendHtml('heatwave_severity'), /Low; Severe; Extreme/);
  assert.doesNotMatch(renderLegendHtml('snow'), /Snow icon|Heavy snow icon/);
});
