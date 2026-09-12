import assert from 'node:assert/strict';
import { BOM_LAYERS } from '../src/bom-layers.js';
import { getLayerLegend, getLegendTableUrl } from '../src/bom-legends.js';

async function fetchJson(url, key) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (response.status >= 500 && attempt === 1) {
        await response.body?.cancel();
        continue;
      }
      assert.equal(response.status, 200, `${key}: HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      if (attempt === 1 && ['TimeoutError', 'TypeError'].includes(error.name)) continue;
      throw new Error(`${key}: failed to read ${url}`, { cause: error });
    }
  }
}

// Read-only comparison: a changed upstream palette needs review, not an
// automatic rewrite of the colours users see in the card.
const queue = Object.keys(BOM_LAYERS);
let checked = 0;
let directionCount = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
  while (queue.length) {
    const key = queue.shift();
    const legend = getLayerLegend(key);
    assert.ok(legend, `${key}: missing legend definition`);
    const url = getLegendTableUrl(key);
    const table = await fetchJson(url, key);
    if (legend.kind === 'direction') {
      assert.deepEqual(table, {}, `${key}: direction now has metadata that needs review`);
      const functionsUrl = new URL(url);
      functionsUrl.pathname = functionsUrl.pathname.replace(/rasterAttributeTable$/, 'rasterFunctionInfos');
      functionsUrl.search = '?f=json';
      const info = await fetchJson(functionsUrl, key);
      assert.ok(info.rasterFunctionInfos?.some(({ name }) => name === legend.rasterFunction), `${key}: direction renderer changed`);
      directionCount += 1;
      continue;
    }
    assert.ok(Array.isArray(table.features), `${key}: no colour table returned`);
    const actual = table.features.map(({ attributes: a }) => [
      a.ClassName.trim(), a.Red, a.Green, a.Blue, a.Alpha,
    ]);
    assert.deepEqual(actual, legend.bands.map(({ label, rgba }) => [label, ...rgba]), `${key}: upstream colour bands changed`);
    checked += 1;
  }
}));
console.log(`Legend upstream check passed: ${checked} layer palettes match BOM labels and RGBA values; ${directionCount} direction renderers have no colour table`);
